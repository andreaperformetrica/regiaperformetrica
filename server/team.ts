import { Router, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { accountFor, normalizeEmail, validEmail, verifiedEmail } from "./access";
import { getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

type Client = typeof clerkClient;
type User = Awaited<ReturnType<Client["users"]["getUser"]>>;
type Account = NonNullable<ReturnType<typeof accountFor>>;

declare global {
  namespace Express {
    interface Locals {
      account: Account;
      clerkUser: User;
    }
  }
}

export function teamGuard(
  client: Client = clerkClient,
  sessionUserId: (req: Parameters<typeof getAuth>[0]) => string | null =
    (req) => getAuth(req).userId,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const userId = sessionUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Accedi per continuare.", code: "SIGNED_OUT" });
        return;
      }
      const user = await client.users.getUser(userId);
      const account = accountFor(user);
      if (!account) {
        res.status(403).json({
          error: "Questo account non è autorizzato. Chiedi un invito all’amministratore del team.",
          code: "INVITATION_REQUIRED",
        });
        return;
      }
      res.locals.account = account;
      res.locals.clerkUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const adminGuard: RequestHandler = (_req, res, next) => {
  if (!res.locals.account.isAdmin) {
    res.status(403).json({ error: "Questa operazione è riservata all’amministratore.", code: "ADMIN_REQUIRED" });
    return;
  }
  next();
};

export const sameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  const host = getClerkProxyHost(req);
  try {
    const url = new URL(origin || "");
    if (!host || url.host !== host || !["https:", "http:"].includes(url.protocol)) throw new Error();
  } catch {
    res.status(403).json({ error: "Origine della richiesta non valida.", code: "INVALID_ORIGIN" });
    return;
  }
  next();
};

export function createTeamRouter(client: Client = clerkClient, guard: RequestHandler = teamGuard(client)) {
  const router = Router();
  const invitationTimes = new Map<string, number[]>();
  router.use(guard);
  router.get("/me", (_req, res) => res.json({ user: res.locals.account }));
  router.use(adminGuard);

  router.get("/team", async (_req, res) => {
    const users: User[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await client.users.getUserList({ limit: 100, offset });
      users.push(...page.data);
      if (offset + page.data.length >= page.totalCount || !page.data.length) break;
    }
    const invitations = [];
    for (let offset = 0; ; offset += 100) {
      const page = await client.invitations.getInvitationList({ status: "pending", limit: 100, offset });
      invitations.push(...page.data);
      if (offset + page.data.length >= page.totalCount || !page.data.length) break;
    }
    res.json({
      members: users.flatMap((user) => {
        const account = accountFor(user);
        return account ? [{ id: account.id, email: account.email, name: account.name, role: account.isAdmin ? "admin" : "member" }] : [];
      }),
      invitations: invitations
        .filter((invitation) => invitation.publicMetadata?.regiaAccess === true)
        .map((invitation) => ({
          id: invitation.id,
          email: invitation.emailAddress,
          status: invitation.status,
          createdAt: invitation.createdAt,
        })),
    });
  });

  router.post("/invitations", sameOrigin, async (req, res) => {
    if (!validEmail(req.body?.email)) {
      res.status(400).json({ error: "Inserisci un indirizzo email valido." });
      return;
    }
    const adminId = res.locals.account.id;
    const now = Date.now();
    const times = (invitationTimes.get(adminId) || []).filter((time) => now - time < 3_600_000);
    if (times.length >= 20) {
      res.status(429).json({ error: "Hai raggiunto il limite di 20 inviti all’ora. Riprova più tardi." });
      return;
    }
    invitationTimes.set(adminId, [...times, now]);
    const email = normalizeEmail(req.body.email);
    const existing = await client.users.getUserList({ emailAddress: [email], limit: 100 });
    if (existing.data.length) {
      const user = existing.data.find((entry) => verifiedEmail(entry) === email);
      if (!user) {
        res.status(409).json({ error: "L’account esiste, ma l’email principale non è verificata. Chiedi alla persona di verificarla prima di invitarla." });
        return;
      }
      if (accountFor(user)) {
        res.status(409).json({ error: "Questa persona ha già accesso a Regia." });
        return;
      }
      await client.users.updateUserMetadata(user.id, {
        publicMetadata: { regiaAccess: true, regiaRole: "member" },
      });
      res.json({ message: "L’account esiste già: accesso al team abilitato. Non è stata inviata un’email; comunica alla persona il link di Regia per accedere." });
      return;
    }
    const pending = await client.invitations.getInvitationList({ status: "pending", query: email, limit: 100 });
    if (pending.data.some((entry) => normalizeEmail(entry.emailAddress) === email)) {
      res.status(409).json({ error: "Esiste già un invito in attesa per questa email." });
      return;
    }
    const origin = new URL(req.get("origin")!).origin;
    await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${origin}/sign-up`,
      expiresInDays: 7,
      notify: true,
      publicMetadata: { regiaAccess: true, regiaRole: "member" },
    });
    res.status(201).json({ message: "Invito inviato tramite Clerk. Il link per creare l’account scade tra 7 giorni." });
  });

  router.delete("/invitations/:id", sameOrigin, async (req, res) => {
    // Only invitations created for Regia may be revoked here.
    let found = false;
    for (let offset = 0; !found; offset += 100) {
      const page = await client.invitations.getInvitationList({ status: "pending", limit: 100, offset });
      found = page.data.some((entry) => entry.id === req.params.id && entry.publicMetadata?.regiaAccess === true);
      if (found || !page.data.length || offset + page.data.length >= page.totalCount) break;
    }
    if (!found) {
      res.status(404).json({ error: "Invito non trovato o non più in attesa." });
      return;
    }
    await client.invitations.revokeInvitation(String(req.params.id));
    res.json({ message: "Invito revocato. Il link non è più utilizzabile." });
  });

  router.delete("/members/:id", sameOrigin, async (req, res) => {
    const user = await client.users.getUser(String(req.params.id));
    const account = accountFor(user);
    if (!account) {
      res.status(404).json({ error: "Persona non presente nel team." });
      return;
    }
    if (account.isAdmin || account.id === res.locals.account.id) {
      res.status(409).json({ error: "Non puoi rimuovere l’accesso dell’amministratore." });
      return;
    }
    await client.users.updateUserMetadata(user.id, {
      publicMetadata: { regiaAccess: false, regiaRole: "member" },
    });
    res.json({ message: "Accesso revocato. I dati locali della persona non sono stati eliminati." });
  });

  return router;
}
