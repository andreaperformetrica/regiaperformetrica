import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { createTeamRouter, teamGuard } from "./team";

const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
  throw new Error("Configura l’autenticazione Clerk prima di avviare Regia.");
}
const app = express();
const httpServer = createServer(app);
app.disable("x-powered-by");

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "8kb" }));
app.use(express.urlencoded({ extended: true, limit: "8kb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
app.use("/api", createTeamRouter());
app.use("/api", (_req, res) => res.status(404).json({ error: "Risorsa non trovata." }));

app.get("/workspace", teamGuard(), async (_req, res) => {
  const source = await readFile(`${root}index.html`, "utf8");
  const authData = JSON.stringify({
    userId: res.locals.account.id,
    migrateLegacy: res.locals.clerkUser.publicMetadata.regiaSeededAdmin === true,
  }).replace(/</g, "\\u003c");
  res.type("html").send(source.replace("<script>", `<script>window.REGIA_AUTH=${authData};</script><script>`));
});

// Never serve the original HTML or workspace sources through a public static root.
app.get(["/index.html", "/server.py", "/README.md", "/.replit"], (_req, res) => res.status(404).end());

if (process.env.NODE_ENV === "production") {
  app.use(express.static(`${root}dist`, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || !isAppRoute(req.path)) {
      res.status(404).send("Pagina non trovata.");
      return;
    }
    res.sendFile(`${root}dist/index.html`, (error) => error && next(error));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: `${root}vite.config.ts`,
    server: {
      middlewareMode: true,
      allowedHosts: true,
      hmr: { server: httpServer },
      fs: { strict: true, allow: [`${root}auth`, `${root}node_modules`] },
    },
    appType: "custom",
  });
  // The explicit filesystem allowlist permits frontend dependencies, not the
  // imported workspace HTML or private project/server files.
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    if (req.method !== "GET" || !isAppRoute(req.path)) {
      res.status(404).send("Pagina non trovata.");
      return;
    }
    try {
      const html = await readFile(`${root}auth/index.html`, "utf8");
      res.type("html").send(await vite.transformIndexHtml(req.originalUrl, html));
    } catch (error) {
      next(error);
    }
  });
}

function isAppRoute(path: string) {
  return path === "/" || path === "/user-portal" || path === "/team" ||
    /^\/sign-(in|up)(\/.*)?$/.test(path);
}

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  // Avoid logging Clerk request payloads, email addresses, invitation URLs or tokens.
  console.error("Regia request failed:", error?.name || "Error", error?.status || 500);
  if (!res.headersSent) {
    const status = error?.type === "entity.parse.failed" ? 400 :
      error?.type === "entity.too.large" ? 413 : 502;
    res.status(status).json({
      error: status === 400 ? "Richiesta non valida." : status === 413 ?
        "Richiesta troppo grande." : "Il servizio di accesso non è disponibile. Riprova tra poco.",
    });
  }
};
app.use(handleError);
httpServer.listen(5000, "0.0.0.0", () => console.log("Regia in ascolto sulla porta 5000."));
