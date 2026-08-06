/**
 * Request-time SSR — the "server later" half of the plan.
 *
 * This is the entire backend integration. Note what is NOT here: no DOM shim,
 * no jsdom, no headless browser, no per-request global state, no prop
 * serialization. Just a function call per request.
 *
 *   node ssr-poc/server/server.js
 *   curl -s localhost:3500/projects/ | head -40
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { renderComponent, renderDocument } from "./renderPage.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PUBLIC_DIR = path.join(ROOT, "_site/public");
const PORT = Number(process.env.PORT ?? 3500);

/**
 * Route table. In the real app this would be the exported `src/routes.js`
 * manifest -- one source of truth shared by the client router, the shell
 * generator and this handler.
 */
const ROUTES = [
  { pattern: "/projects", title: "Projects — RouteVN Creator" },
  { pattern: "/authenticate", title: "Sign in — RouteVN Creator" },
  { pattern: "/project", title: "Project — RouteVN Creator" },
];

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const serveStatic = async (urlPath, res) => {
  const file = path.join(PUBLIC_DIR, urlPath.replace(/^\/public/, ""));
  if (!existsSync(file) || statSync(file).isDirectory()) return false;
  res.writeHead(200, {
    "content-type": MIME[path.extname(file)] || "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
  });
  res.end(await readFile(file));
  return true;
};

/** Everything the server knows about this request. */
const environmentFor = (url) => ({
  platform: "web",
  locale: (url.searchParams.get("locale") ?? "en"),
  theme: "dark",
  route: url.pathname.replace(/\/$/, "") || "/",
  query: Object.fromEntries(url.searchParams),
});

const handler = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/public/")) {
    if (await serveStatic(url.pathname, res)) return;
    res.writeHead(404).end("not found");
    return;
  }

  const normalized = url.pathname.replace(/\/$/, "") || "/";
  const route = ROUTES.find((r) => r.pattern === normalized) ?? ROUTES[0];
  const env = environmentFor(url);

  try {
    const started = process.hrtime.bigint();

    // ---- the entire SSR integration -------------------------------------
    const { html, head, stats } = await renderComponent({
      component: "rvn-app",
      props: {},
      env,
    });
    const document = renderDocument({ html, head, env, title: route.title });
    // ---------------------------------------------------------------------

    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "server-timing": `ssr;dur=${ms.toFixed(1)}`,
    });
    res.end(document);

    console.log(
      `${req.method} ${url.pathname} -> 200  ${document.length}b  ` +
        `${stats.componentCount} components  ${ms.toFixed(1)}ms`,
    );
  } catch (error) {
    // A render failure must never take the page down: fall back to the plain
    // SPA shell, which is exactly what ships today.
    console.error(`SSR failed for ${url.pathname}:`, error.message);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      renderDocument({ html: "<rvn-app></rvn-app>", head: "", env, title: route.title }),
    );
  }
};

createServer(handler).listen(PORT, () => {
  console.log(`[ssr] listening on http://127.0.0.1:${PORT}`);
  console.log(`[ssr] routes: ${ROUTES.map((r) => r.pattern).join(", ")}`);
});
