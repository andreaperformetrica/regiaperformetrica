import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTeamRouter, teamGuard } from "./team";
import { pool, seedAdmin } from "./store";

const root = fileURLToPath(new URL("../", import.meta.url));
await seedAdmin();
const app = express();
const httpServer = createServer(app);
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.json({ limit: "8kb" }));
app.use(express.urlencoded({ extended: true, limit: "8kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
app.use("/api", await createTeamRouter(pool));
app.use("/api", (_req, res) => res.status(404).json({ error: "Risorsa non trovata." }));

app.get("/workspace", teamGuard(pool), async (_req, res) => {
  const source = await readFile(`${root}index.html`, "utf8");
  const authData = JSON.stringify({
    userId: res.locals.accountRow.storage_id,
    migrateLegacy: res.locals.accountRow.legacy_admin,
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
  return path === "/" || path === "/user-portal" || path === "/team" || path === "/password" ||
    /^\/sign-(in|up)(\/.*)?$/.test(path);
}

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  // Never log password payloads, email addresses, invitation URLs or session tokens.
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
