import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from "node:crypto";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim());
export const validPassword = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 12 && value.length <= 128 && Buffer.byteLength(value) <= 512;
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, result) => error ? reject(error) : resolve(result));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt-v1:${salt.toString("hex")}:${(await scrypt(password, salt)).toString("hex")}`;
}

export async function checkPassword(password: string, encoded: string) {
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(await scrypt(password, Buffer.from(match[1], "hex")), Buffer.from(match[2], "hex"));
}

export type AccountRow = {
  id: string; email: string; name: string; role: "super_admin" | "member";
  active: boolean; storage_id: string; legacy_admin: boolean; password_hash: string | null;
};
export const accountFor = (row: AccountRow) => ({
  id: row.id, email: row.email, name: row.name || row.email,
  role: row.role, isAdmin: row.role === "super_admin",
});
