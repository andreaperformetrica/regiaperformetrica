import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, checkPassword, tokenHash, newToken, validPassword, validEmail } from "../server/access";

test("passwords are salted, hashed and verified without plaintext storage", async () => {
  const value = newToken();
  const first = await hashPassword(value);
  const second = await hashPassword(value);
  assert.ok(first !== second && !first.includes(value));
  assert.ok(await checkPassword(value, first));
  assert.equal(await checkPassword("different test passphrase", first), false);
  assert.equal(await checkPassword(value, "corrupt"), false);
});
test("password and email validation rejects unsafe or incomplete input", () => {
  assert.ok(validPassword("una frase lunga per test"));
  for(const value of [null, "", "short", "a".repeat(129)]) assert.equal(validPassword(value), false);
  assert.ok(validEmail("member@example.test"));
  for(const value of [null, "", "bad", "x@bad", "<x>@example.test"]) assert.equal(validEmail(value), false);
});
test("session and invitation tokens have enough entropy and are stored by hash", () => {
  const token = newToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.ok(tokenHash(token) !== token && newToken() !== token);
});
