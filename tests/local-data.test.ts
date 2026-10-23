import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const localCode = source.slice(source.indexOf("const LS_PREFIX="), source.indexOf("const norm=")) +
  "\nglobalThis.saved = LS;";

function storage(initial: Record<string, string> = {}) {
  const values = { ...initial };
  Object.defineProperties(values, {
    getItem: { value: (key: string) => values[key] ?? null },
    setItem: { value: (key: string, value: string) => { values[key] = String(value); } },
  });
  return values;
}

function load(localStorage: ReturnType<typeof storage>, userId: string, migrateLegacy = false) {
  const context: any = { window: { REGIA_AUTH: { userId, migrateLegacy } }, localStorage };
  runInNewContext(localCode, context);
  return context.saved;
}

test("an invited member cannot read pre-login data or another account's data", () => {
  const store = storage({ "regia.localdata": '{"private":"old"}' });
  const one = load(store, "one");
  const two = load(store, "two");
  assert.equal(one.get("localdata", null), null);
  one.set("localdata", { private: "one" });
  assert.equal(two.get("localdata", null), null);
  assert.equal(load(store, "one").get("localdata", null).private, "one");
});

test("initial admin copies legacy data and preferences once, preserving originals", () => {
  const store = storage({ "regia.localdata": '{"tasks":[]}', "regia.me": '"old-member"', "regia.user.other.localdata": '"other"' });
  const admin = load(store, "admin", true);
  assert.equal(admin.get("me", null), "old-member");
  assert.equal(store["regia.localdata"], '{"tasks":[]}');
  admin.set("me", "new-member");
  assert.equal(load(store, "admin", true).get("me", null), "new-member");
  assert.equal(admin.get("user.other.localdata", null), null);
});

test("existing account data is never overwritten by the legacy migration", () => {
  const store = storage({
    "regia.localdata": '{"source":"old"}',
    "regia.user.admin.localdata": '{"source":"new"}',
  });
  assert.equal(load(store, "admin", true).get("localdata", null).source, "new");
});
