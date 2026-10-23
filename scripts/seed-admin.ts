import { clerkClient } from "@clerk/express";
import { normalizeEmail, validEmail, verifiedEmail } from "../server/access";

async function seed() {
  const email = process.env.REGIA_ADMIN_EMAIL;
  if (!validEmail(email)) throw new Error("Configura REGIA_ADMIN_EMAIL con l’email del primo amministratore.");
  const origin = process.env.APP_URL || (
    process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN ?
      `https://${process.env.REPLIT_DEV_DOMAIN}` : ""
  );
  if (!origin) throw new Error("Configura APP_URL con l’URL pubblico dell’ambiente da inizializzare.");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("APP_URL deve usare HTTPS.");
  const normalized = normalizeEmail(email);
  const users = await clerkClient.users.getUserList({ emailAddress: [normalized], limit: 100 });
  if (users.data.length) {
    const user = users.data.find((entry) => verifiedEmail(entry) === normalized);
    if (!user) throw new Error("Verifica l’email principale dell’account prima di assegnare privilegi amministrativi.");
    if (user.publicMetadata.regiaSeededAdmin === true) {
      console.log("Amministratore già inizializzato. Nessun privilegio modificato.");
      return;
    }
    await clerkClient.users.updateUserMetadata(user.id, {
      publicMetadata: { regiaAccess: true, regiaRole: "admin", regiaSeededAdmin: true },
    });
    console.log("Account verificato autorizzato come amministratore.");
    return;
  }
  const pending = await clerkClient.invitations.getInvitationList({ status: "pending", query: normalized, limit: 100 });
  if (pending.data.some((entry) => normalizeEmail(entry.emailAddress) === normalized && entry.publicMetadata?.regiaSeededAdmin === true)) {
    console.log("Invito amministratore già in attesa. Nessuna nuova email inviata.");
    return;
  }
  await clerkClient.invitations.createInvitation({
    emailAddress: normalized,
    redirectUrl: `${url.origin}/sign-up`,
    expiresInDays: 7,
    notify: true,
    publicMetadata: { regiaAccess: true, regiaRole: "admin", regiaSeededAdmin: true },
  });
  console.log("Invito amministratore inviato tramite Clerk. Valido per 7 giorni.");
}

seed().catch((error) => {
  console.error("Inizializzazione non riuscita:", error?.errors?.[0]?.code || error?.message || "Errore del servizio.");
  process.exitCode = 1;
});
