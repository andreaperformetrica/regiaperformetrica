import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { clerkClient } from "@clerk/express";
import { createTeamRouter, teamGuard } from "../server/team";

function fixture() {
  const user = (id: string, metadata: Record<string, unknown>) => ({
    id, firstName: id, lastName: null, primaryEmailAddressId: id,
    emailAddresses: [{ id, emailAddress: `${id}@example.test`, verification: { status: "verified" } }],
    publicMetadata: { unrelatedSetting: "preserved", ...metadata },
  });
  const users = [
    user("admin", { regiaAccess: true, regiaRole: "admin" }),
    user("member", { regiaAccess: true, regiaRole: "member" }),
    user("outsider", {}),
  ];
  const invites: any[] = [{ id: "inv_pending", emailAddress: "pending@example.test", publicMetadata: { regiaAccess: true }, status: "pending", createdAt: 1, url: "DO-NOT-EXPOSE" }];
  let mails = 0;
  const client = {
    users: {
      getUser: async (id: string) => users.find((entry) => entry.id === id)!,
      getUserList: async (params: any) => {
        const data = params.emailAddress ? users.filter((entry) => params.emailAddress.includes(entry.emailAddresses[0].emailAddress)) : users;
        return { data: data.slice(params.offset || 0, (params.offset || 0) + (params.limit || 100)), totalCount: data.length };
      },
      updateUserMetadata: async (id: string, params: any) => {
        const target = users.find((entry) => entry.id === id)!;
        Object.assign(target.publicMetadata, params.publicMetadata);
        return target;
      },
    },
    invitations: {
      getInvitationList: async (params: any) => {
        const data = invites.filter((entry) => entry.status === params.status && (!params.query || entry.emailAddress === params.query));
        return { data: data.slice(params.offset || 0, (params.offset || 0) + (params.limit || 100)), totalCount: data.length };
      },
      createInvitation: async (params: any) => {
        mails++;
        const invitation = { id: "inv_new", ...params, status: "pending", createdAt: 2, url: "DO-NOT-EXPOSE" };
        invites.push(invitation);
        return invitation;
      },
      revokeInvitation: async (id: string) => {
        invites.find((entry) => entry.id === id).status = "revoked";
      },
    },
  } as unknown as typeof clerkClient;
  return { client, users, invites, get mails() { return mails; } };
}

async function withApi(run: (api: any, data: ReturnType<typeof fixture>) => Promise<void>) {
  const data = fixture();
  const app = express();
  app.use(express.json());
  // Test-only session resolver; the running app always uses Clerk getAuth().
  app.use("/api", createTeamRouter(data.client, teamGuard(data.client, (req: any) => req.get("x-test-user") || null)));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const api = async (path: string, user?: string, method = "GET", body?: unknown, requestOrigin: string | null = origin) => {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user ? { "x-test-user": user } : {}),
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try { await run(api, data); } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("API denies anonymous, uninvited and non-admin management access", async () => withApi(async (api) => {
  assert.equal((await api("/me")).status, 401);
  assert.equal((await api("/me", "outsider")).status, 403);
  assert.equal((await api("/me", "member")).status, 200);
  assert.equal((await api("/team", "member")).status, 403);
  assert.equal((await api("/invitations", "member", "POST", { email: "new@example.test" })).status, 403);
}));

test("team list excludes outsiders and never exposes invitation tokens", async () => withApi(async (api) => {
  const result = await api("/team", "admin");
  assert.equal(result.status, 200);
  assert.equal(result.body.members.length, 2);
  assert.equal(result.body.invitations.length, 1);
  assert.ok(!JSON.stringify(result.body).includes("DO-NOT-EXPOSE"));
}));

test("mutations reject missing/cross-site Origin and malformed email", async () => withApi(async (api, data) => {
  assert.equal((await api("/invitations", "admin", "POST", { email: "new@example.test" }, null)).status, 403);
  assert.equal((await api("/invitations", "admin", "POST", { email: "new@example.test" }, "https://evil.test")).status, 403);
  assert.equal((await api("/invitations", "admin", "POST", { email: "invalid" })).status, 400);
  assert.equal(data.mails, 0);
}));

test("admin invitation uses fixed member permissions and no token is returned", async () => withApi(async (api, data) => {
  const result = await api("/invitations", "admin", "POST", { email: "NEW@EXAMPLE.TEST", regiaRole: "admin" });
  assert.equal(result.status, 201);
  assert.equal(data.mails, 1);
  const created = data.invites.at(-1);
  assert.equal(created.emailAddress, "new@example.test");
  assert.equal(created.publicMetadata.regiaRole, "member");
  assert.equal(created.publicMetadata.regiaAccess, true);
  assert.equal(created.expiresInDays, 7);
  assert.equal(new URL(created.redirectUrl).pathname, "/sign-up");
  assert.ok(!JSON.stringify(result.body).includes("DO-NOT-EXPOSE"));
}));

test("duplicate invitation is rejected without sending a new email", async () => withApi(async (api, data) => {
  assert.equal((await api("/invitations", "admin", "POST", { email: "pending@example.test" })).status, 409);
  assert.equal(data.mails, 0);
}));

test("existing verified account is enabled without pretending an email was sent", async () => withApi(async (api, data) => {
  const result = await api("/invitations", "admin", "POST", { email: "outsider@example.test" });
  assert.equal(result.status, 200);
  assert.match(result.body.message, /Non è stata inviata/);
  assert.equal(data.mails, 0);
  assert.equal((await api("/me", "outsider")).status, 200);
  assert.equal(data.users[2].publicMetadata.unrelatedSetting, "preserved");
}));

test("revocation removes member access immediately and preserves admin access", async () => withApi(async (api) => {
  assert.equal((await api("/members/admin", "admin", "DELETE")).status, 409);
  assert.equal((await api("/members/member", "admin", "DELETE")).status, 200);
  assert.equal((await api("/me", "member")).status, 403);
}));

test("pending invitations can be revoked and cannot be reused in management", async () => withApi(async (api, data) => {
  assert.equal((await api("/invitations/inv_pending", "admin", "DELETE")).status, 200);
  assert.equal(data.invites[0].status, "revoked");
  assert.equal((await api("/invitations/inv_pending", "admin", "DELETE")).status, 404);
}));
