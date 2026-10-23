import pg from "pg";
import { randomUUID } from "node:crypto";
import { hashPassword, normalizeEmail, validEmail, validPassword } from "./access";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });

export async function seedAdmin(db: pg.Pool = pool, reset = false) {
  const email = process.env.REGIA_ADMIN_EMAIL;
  const password = process.env.REGIA_ADMIN_PASSWORD;
  if (!password) return false;
  if (!validEmail(email) || !validPassword(password)) {
    throw new Error("Configura email amministratore e password di almeno 12 caratteri nei Secrets.");
  }
  const existing = await db.query("SELECT id,password_hash FROM regia_accounts WHERE email=$1", [normalizeEmail(email)]);
  if (existing.rows[0]?.password_hash && !reset) return true;
  const hash = await hashPassword(password);
  const id = randomUUID();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO regia_accounts(id,email,password_hash,role,storage_id,legacy_admin)
       VALUES($1::uuid,$2,$3,'super_admin',$1::text,true) ON CONFLICT(email) DO NOTHING`,
      [id, normalizeEmail(email), hash],
    );
    const updated = await client.query(
      `UPDATE regia_accounts SET password_hash=$2
       WHERE email=$1 AND role='super_admin' AND active=true AND (password_hash IS NULL OR $3)
       RETURNING id`, [normalizeEmail(email), hash, reset],
    );
    if (reset && updated.rows[0]) await client.query("DELETE FROM regia_sessions WHERE account_id=$1", [updated.rows[0].id]);
    await client.query("COMMIT");
    return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
