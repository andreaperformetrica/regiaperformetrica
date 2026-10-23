import test from "node:test";
import assert from "node:assert/strict";
import { accountFor, normalizeEmail, validEmail, type ClerkUserLike } from "../server/access";

const base: ClerkUserLike = {
  id: "test_user",
  firstName: "Test",
  lastName: "Member",
  primaryEmailAddressId: "primary",
  emailAddresses: [{ id: "primary", emailAddress: "Member@Example.test", verification: { status: "verified" } }],
  publicMetadata: {},
};

test("a verified account without an invitation cannot access Regia", () => {
  assert.equal(accountFor(base), null);
});

test("only a true backend authorization grants access", () => {
  assert.equal(accountFor({ ...base, publicMetadata: { regiaAccess: "true", regiaRole: "admin" } }), null);
  assert.equal(accountFor({ ...base, publicMetadata: { regiaAccess: false, regiaRole: "admin" } }), null);
  const account = accountFor({ ...base, publicMetadata: { regiaAccess: true } });
  assert.equal(account?.email, "member@example.test");
  assert.equal(account?.isAdmin, false);
});

test("admin role requires authorized access and a verified primary email", () => {
  assert.equal(accountFor({ ...base, publicMetadata: { regiaAccess: true, regiaRole: "admin" } })?.isAdmin, true);
  assert.equal(accountFor({
    ...base,
    publicMetadata: { regiaAccess: true, regiaRole: "admin" },
    emailAddresses: [{ ...base.emailAddresses[0], verification: { status: "unverified" } }],
  }), null);
  assert.equal(accountFor({ ...base, primaryEmailAddressId: "missing", publicMetadata: { regiaAccess: true } }), null);
});

test("email input is normalized and invalid payloads are rejected", () => {
  assert.equal(normalizeEmail("  Member@Example.test "), "member@example.test");
  assert.ok(validEmail("member@example.test"));
  for (const input of [undefined, null, {}, "", "missing-domain", "x@bad", "<x>@example.test", "a b@example.test", "a".repeat(255) + "@example.test"]) {
    assert.equal(validEmail(input), false);
  }
});
