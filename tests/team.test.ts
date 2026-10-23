import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import express from "express";
import pg from "pg";
import { createTeamRouter, teamGuard } from "../server/team";
import { hashPassword, newToken } from "../server/access";

test("email/password, invitations and revocation work end to end with real sessions", async (t) => {
  if(process.env.NODE_ENV === "production") throw new Error("Tests require a development database.");
  const schema = "regia_test_" + randomUUID().replaceAll("-", "");
  const control = new pg.Pool({connectionString:process.env.DATABASE_URL});
  const db = new pg.Pool({connectionString:process.env.DATABASE_URL, options:`-c search_path=${schema}`});
  await control.query(`CREATE SCHEMA ${schema}`);
  const server = createServer();
  try {
    await db.query(await readFile(new URL("../server/schema.sql",import.meta.url),"utf8"));
    const rootId=randomUUID(),password=newToken(),memberPassword=newToken();
    await db.query("INSERT INTO regia_accounts(id,email,password_hash,role,storage_id,legacy_admin) VALUES($1::uuid,$2,$3,'super_admin',$1::text,true)",[rootId,"root@example.test",await hashPassword(password)]);
    const app=express();app.set("trust proxy",1);app.use(express.json());
    app.use("/api",await createTeamRouter(db));
    app.get("/workspace",teamGuard(db),(_req,res)=>res.json({ok:true}));
    server.on("request",app);
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const api=async(path:string,method="GET",body?:unknown,cookie="",source=origin)=>{
      const response=await fetch(origin+path,{method,headers:{"Content-Type":"application/json",Origin:source,...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status,body:await response.json(),cookie:response.headers.get("set-cookie")?.split(";")[0]||"",headers:response.headers};
    };
    let rootCookie="",memberCookie="",invitePath="";
    await t.test("anonymous workspace and account requests are denied",async()=>{
      assert.equal((await api("/workspace")).status,401);assert.equal((await api("/api/me")).status,401);
    });
    await t.test("cross-origin login is rejected and credentials are checked",async()=>{
      assert.equal((await api("/api/auth/login","POST",{email:"root@example.test",password},"","https://evil.test")).status,403);
      assert.equal((await api("/api/auth/login","POST",{email:"root@example.test",password:"not the right password"})).status,401);
    });
    await t.test("super admin can log in using an HttpOnly SameSite cookie",async()=>{
      const result=await api("/api/auth/login","POST",{email:"ROOT@EXAMPLE.TEST",password});
      assert.equal(result.status,200);assert.equal(result.body.user.isAdmin,true);
      assert.match(result.headers.get("set-cookie")!,/HttpOnly/);assert.match(result.headers.get("set-cookie")!,/SameSite=Lax/);
      rootCookie=result.cookie;assert.equal((await api("/workspace","GET",undefined,rootCookie)).status,200);
      assert.ok(!(await db.query("SELECT token_hash FROM regia_sessions")).rows.some(r=>rootCookie.includes(r.token_hash)));
    });
    await t.test("admin invitation returns a link, not a fake email delivery claim",async()=>{
      const result=await api("/api/invitations","POST",{email:"member@example.test",role:"super_admin"},rootCookie);
      assert.equal(result.status,201);assert.match(result.body.message,/Non è stata inviata/);invitePath=result.body.invitationPath;
      const list=await api("/api/team","GET",undefined,rootCookie);
      assert.equal(list.body.invitations.length,1);assert.ok(!JSON.stringify(list.body).includes("#token="));
    });
    await t.test("invalid and short-password activations are denied",async()=>{
      assert.equal((await api("/api/auth/activate","POST",{token:newToken(),password:memberPassword})).status,400);
      assert.equal((await api("/api/auth/activate","POST",{token:invitePath.split("=")[1],password:"short"})).status,400);
    });
    await t.test("an invitation can be accepted exactly once; privileges cannot be supplied",async()=>{
      const body={token:invitePath.split("=")[1],password:memberPassword,name:"Test member",role:"super_admin"};
      assert.equal((await api("/api/auth/activate","POST",body)).status,200);
      assert.equal((await api("/api/auth/activate","POST",body)).status,400);
      const login=await api("/api/auth/login","POST",{email:"member@example.test",password:memberPassword});
      assert.equal(login.status,200);assert.equal(login.body.user.isAdmin,false);memberCookie=login.cookie;
      assert.equal((await api("/api/team","GET",undefined,memberCookie)).status,403);
      assert.equal((await api("/api/invitations","POST",{email:"other@example.test"},memberCookie)).status,403);
    });
    await t.test("password reset preserves account storage identity and invalidates old sessions",async()=>{
      const original=(await db.query("SELECT storage_id FROM regia_accounts WHERE email='member@example.test'")).rows[0].storage_id;
      const reset=await api("/api/invitations","POST",{email:"member@example.test"},rootCookie);
      const replacement=newToken();
      assert.equal((await api("/api/auth/activate","POST",{token:reset.body.invitationPath.split("=")[1],password:replacement})).status,200);
      assert.equal((await api("/api/me","GET",undefined,memberCookie)).status,401);
      assert.equal((await db.query("SELECT storage_id FROM regia_accounts WHERE email='member@example.test'")).rows[0].storage_id,original);
      const fresh=await api("/api/auth/login","POST",{email:"member@example.test",password:replacement});memberCookie=fresh.cookie;
    });
    await t.test("revoked invitations cannot activate accounts",async()=>{
      const result=await api("/api/invitations","POST",{email:"other@example.test"},rootCookie);
      assert.equal((await api("/api/invitations/"+result.body.id,"DELETE",undefined,rootCookie)).status,200);
      assert.equal((await api("/api/auth/activate","POST",{token:result.body.invitationPath.split("=")[1],password:memberPassword})).status,400);
    });
    await t.test("member revocation invalidates sessions and protects the super admin",async()=>{
      assert.equal((await api("/api/members/"+rootId,"DELETE",undefined,rootCookie)).status,409);
      const id=(await db.query("SELECT id FROM regia_accounts WHERE email='member@example.test'")).rows[0].id;
      assert.equal((await api("/api/members/"+id,"DELETE",undefined,rootCookie)).status,200);
      assert.equal((await api("/api/me","GET",undefined,memberCookie)).status,401);
    });
    await t.test("change password and logout revoke existing sessions",async()=>{
      const nextPassword=newToken();
      assert.equal((await api("/api/auth/password","POST",{oldPassword:password,password:nextPassword},rootCookie)).status,200);
      assert.equal((await api("/api/me","GET",undefined,rootCookie)).status,401);
      const fresh=await api("/api/auth/login","POST",{email:"root@example.test",password:nextPassword});rootCookie=fresh.cookie;
      assert.equal((await api("/api/auth/logout","POST",{},rootCookie)).status,200);
      assert.equal((await api("/api/me","GET",undefined,rootCookie)).status,401);
    });
    await t.test("repeated invalid login attempts are limited",async()=>{
      let status=0;for(let i=0;i<11;i++)status=(await api("/api/auth/login","POST",{email:"unknown@example.test",password:"invalid test password"})).status;
      assert.equal(status,429);
    });
  } finally {
    if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
    await db.end();await control.query(`DROP SCHEMA ${schema} CASCADE`);await control.end();
  }
});
