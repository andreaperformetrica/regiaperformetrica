import { Router, type RequestHandler } from "express";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { accountFor, checkPassword, hashPassword, newToken, normalizeEmail, tokenHash, validEmail, validPassword, type AccountRow } from "./access";

const COOKIE = "regia_session";
const DAYS = 7;
declare global { namespace Express { interface Locals {
  account: ReturnType<typeof accountFor>; accountRow: AccountRow;
} } }

export function publicHost(req: { headers: Record<string, any> }) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
}
export const sameOrigin: RequestHandler = (req, res, next) => {
  try {
    const url = new URL(req.get("origin") || "");
    if (url.host !== publicHost(req) || !["https:", "http:"].includes(url.protocol)) throw new Error();
    next();
  } catch { res.status(403).json({ error: "Origine della richiesta non valida." }); }
};
function sessionToken(req: Parameters<RequestHandler>[0]) {
  const value = req.headers.cookie?.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function cookieOptions(req: Parameters<RequestHandler>[0]) {
  return { httpOnly: true, secure: req.secure, sameSite: "lax" as const, path: "/" };
}
export function teamGuard(db: pg.Pool): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = sessionToken(req);
      const result = token ? await db.query<AccountRow>(
        `SELECT a.* FROM regia_sessions s JOIN regia_accounts a ON a.id=s.account_id
         WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true`, [tokenHash(token)]) : null;
      const row = result?.rows[0];
      if (!row) { res.status(401).json({ error: "Accedi con email e password.", code: "SIGNED_OUT" }); return; }
      res.locals.accountRow = row;
      res.locals.account = accountFor(row);
      next();
    } catch (error) { next(error); }
  };
}
async function limited(db: pg.Pool, key: string, max: number) {
  const result = await db.query(
    `INSERT INTO regia_auth_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes')
     ON CONFLICT(key) DO UPDATE SET
     attempts=CASE WHEN regia_auth_limits.expires_at<now() THEN 1 ELSE regia_auth_limits.attempts+1 END,
     expires_at=CASE WHEN regia_auth_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE regia_auth_limits.expires_at END
     RETURNING attempts`, [tokenHash(key)]);
  return result.rows[0].attempts > max;
}

export async function createTeamRouter(db: pg.Pool) {
  const router = Router();
  const dummyHash = await hashPassword(newToken());
  router.post("/auth/login", sameOrigin, async (req, res) => {
    const email = validEmail(req.body?.email) ? normalizeEmail(req.body.email) : "";
    if (await limited(db, "ip:" + req.ip, 60) || await limited(db, "email:" + email, 10)) {
      res.status(429).json({ error: "Troppi tentativi. Riprova tra 15 minuti." }); return;
    }
    if (!email || typeof req.body?.password !== "string" || req.body.password.length > 128) {
      res.status(401).json({ error: "Email o password non corretti." }); return;
    }
    const result = await db.query<AccountRow>("SELECT * FROM regia_accounts WHERE email=$1", [email]);
    const row = result.rows[0];
    const valid = await checkPassword(req.body.password, row?.password_hash || dummyHash);
    if (!row?.active || !row.password_hash || !valid) {
      res.status(401).json({ error: "Email o password non corretti." }); return;
    }
    const token = newToken();
    await db.query("INSERT INTO regia_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [tokenHash(token), row.id]);
    res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: DAYS * 86400000 });
    res.json({ user: accountFor(row) });
  });
  router.post("/auth/logout", sameOrigin, async (req, res) => {
    const token = sessionToken(req);
    if (token) await db.query("DELETE FROM regia_sessions WHERE token_hash=$1", [tokenHash(token)]);
    res.clearCookie(COOKIE, cookieOptions(req));
    res.json({ message: "Disconnessione effettuata." });
  });
  router.post("/auth/activate", sameOrigin, async (req, res) => {
    if (await limited(db, "activate:" + req.ip, 30)) {
      res.status(429).json({ error: "Troppi tentativi. Riprova più tardi." }); return;
    }
    if (!validPassword(req.body?.password) || !/^[a-f0-9]{64}$/.test(req.body?.token || "")) {
      res.status(400).json({ error: "Serve un link valido e una password da 12 a 128 caratteri." }); return;
    }
    const hash = await hashPassword(req.body.password);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT * FROM regia_invitations WHERE token_hash=$1 AND expires_at>now()
         AND used_at IS NULL AND revoked_at IS NULL FOR UPDATE`, [tokenHash(req.body.token)]);
      if (!found.rows[0]) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Il link è scaduto, revocato o già utilizzato." }); return;
      }
      const invite = found.rows[0];
      const id = randomUUID();
      const account = await client.query(
        `INSERT INTO regia_accounts(id,email,name,password_hash,storage_id)
         VALUES($1::uuid,$2,$3,$4,$1::text) ON CONFLICT(email) DO UPDATE
         SET password_hash=$4,active=true,name=CASE WHEN $3='' THEN regia_accounts.name ELSE $3 END
         WHERE regia_accounts.role='member' RETURNING id`,
        [id, invite.email, typeof req.body.name === "string" ? req.body.name.trim().slice(0, 100) : "", hash]);
      if (!account.rows[0]) throw new Error("Protected administrator");
      await client.query("DELETE FROM regia_sessions WHERE account_id=$1", [account.rows[0].id]);
      await client.query("UPDATE regia_invitations SET used_at=now() WHERE id=$1", [invite.id]);
      await client.query("COMMIT");
      res.json({ message: "Password salvata. Ora puoi accedere con email e password.", email: invite.email });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
  router.use(teamGuard(db));
  router.get("/me", (_req, res) => res.json({ user: res.locals.account }));
  router.post("/auth/password", sameOrigin, async (req, res) => {
    if (await limited(db, "password:" + res.locals.account.id, 10)) {
      res.status(429).json({ error: "Troppi tentativi. Riprova tra 15 minuti." }); return;
    }
    if (typeof req.body?.oldPassword !== "string" || req.body.oldPassword.length > 128 ||
        !validPassword(req.body?.password)) {
      res.status(400).json({ error: "Inserisci la password attuale e una nuova password da 12 a 128 caratteri." }); return;
    }
    if (!await checkPassword(req.body.oldPassword, res.locals.accountRow.password_hash!)) {
      res.status(400).json({ error: "La password attuale non è corretta." }); return;
    }
    const hash = await hashPassword(req.body.password);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE regia_accounts SET password_hash=$2 WHERE id=$1", [res.locals.account.id, hash]);
      await client.query("DELETE FROM regia_sessions WHERE account_id=$1", [res.locals.account.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    res.clearCookie(COOKIE, cookieOptions(req));
    res.json({ message: "Password aggiornata. Accedi nuovamente." });
  });
  router.use((_req, res, next) => {
    if (!res.locals.account.isAdmin) { res.status(403).json({ error: "Operazione riservata al super admin.", code: "ADMIN_REQUIRED" }); return; }
    next();
  });
  router.get("/team", async (_req, res) => {
    const members = await db.query("SELECT id,email,name,role FROM regia_accounts WHERE active=true AND password_hash IS NOT NULL ORDER BY created_at");
    const invitations = await db.query(
      `SELECT id,email,'pending' AS status,extract(epoch FROM created_at)*1000 AS "createdAt"
       FROM regia_invitations WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC`);
    res.json({ members: members.rows, invitations: invitations.rows.map((r) => ({ ...r, createdAt: Number(r.createdAt) })) });
  });
  router.post("/invitations", sameOrigin, async (req, res) => {
    if (!validEmail(req.body?.email)) { res.status(400).json({ error: "Inserisci un’email valida." }); return; }
    const email = normalizeEmail(req.body.email);
    const existing = await db.query<AccountRow>("SELECT * FROM regia_accounts WHERE email=$1", [email]);
    if (existing.rows[0]?.role === "super_admin") { res.status(409).json({ error: "Questo indirizzo è riservato al super admin." }); return; }
    if (await limited(db, "invite:" + res.locals.account.id, 30)) { res.status(429).json({ error: "Troppi inviti. Riprova più tardi." }); return; }
    const token = newToken();
    const created = await db.query(
      `INSERT INTO regia_invitations(id,email,token_hash,expires_at,created_by)
       VALUES($1,$2,$3,now()+interval '7 days',$4)
       ON CONFLICT(email) DO UPDATE SET id=$1,token_hash=$3,expires_at=now()+interval '7 days',
       used_at=NULL,revoked_at=NULL,created_at=now(),created_by=$4 RETURNING id`,
      [randomUUID(), email, tokenHash(token), res.locals.account.id]);
    res.status(201).json({
      message: existing.rows[0]?.password_hash ? "Link per reimpostare la password creato. Condividilo solo con la persona interessata." :
        "Invito creato. Copia il link e condividilo con la persona invitata. Non è stata inviata un’email.",
      invitationPath: `/sign-up#token=${token}`, id: created.rows[0].id,
    });
  });
  router.delete("/invitations/:id", sameOrigin, async (req, res) => {
    const result = await db.query("UPDATE regia_invitations SET revoked_at=now() WHERE id::text=$1 AND used_at IS NULL AND revoked_at IS NULL RETURNING id", [req.params.id]);
    res.status(result.rowCount ? 200 : 404).json({ message: "Invito revocato.", error: result.rowCount ? undefined : "Invito non trovato." });
  });
  router.delete("/members/:id", sameOrigin, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("UPDATE regia_accounts SET active=false WHERE id::text=$1 AND role='member' RETURNING id,email", [req.params.id]);
      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Non puoi rimuovere il super admin o un account inesistente." }); return;
      }
      await client.query("DELETE FROM regia_sessions WHERE account_id=$1", [result.rows[0].id]);
      await client.query("UPDATE regia_invitations SET revoked_at=now() WHERE email=$1 AND used_at IS NULL", [result.rows[0].email]);
      await client.query("COMMIT");
      res.json({ message: "Accesso revocato. I dati locali non sono stati eliminati." });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
  return router;
}
