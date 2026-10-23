import { pool, seedAdmin } from "../server/store";

try {
  const ready = await seedAdmin(pool, process.argv.includes("--reset-password"));
  if (!ready) throw new Error("Inserisci REGIA_ADMIN_PASSWORD nei Secrets prima di inizializzare l’account.");
  console.log("Super admin inizializzato. Nessuna password viene mostrata nei log.");
} catch {
  console.error("Configurazione non riuscita: verifica REGIA_ADMIN_EMAIL e REGIA_ADMIN_PASSWORD (almeno 12 caratteri).");
  process.exitCode = 1;
} finally {
  await pool.end();
}
