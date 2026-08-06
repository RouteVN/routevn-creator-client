/**
 * CI gate: boots the real client over server-rendered HTML and asserts that
 * every component ADOPTED its markup instead of falling back to CSR.
 *
 * This is the only test that can prove the invariant end to end, because a
 * hydration mismatch is not an error -- it silently re-renders and looks
 * correct. Without this gate SSR quietly stops paying for itself and nobody
 * notices: you keep shipping the bytes and lose all the benefit.
 *
 * Exit code 1 on any mismatch, unadopted tree, or missing pre-JS paint.
 *
 *   node ssr-poc/tests/hydration-parity.mjs
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "ssr-poc/out");
const VARIANT = "e_nested_dsd";
const PORT = 3411;
const ROUTE = process.argv[2] || "/projects";
// The server render is seeded with a project id; the client must be given the
// same one via the query string or the two diverge by construction.
const QUERY = process.argv[3] ?? (ROUTE.startsWith("/project/") ? "?p=demo-project" : "");
const BOOT_WAIT_MS = 4000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const serve = (root, port) =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
        if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
        if (!existsSync(file)) return res.writeHead(404).end("not found");
        res.writeHead(200, {
          "content-type": MIME[path.extname(file)] || "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(await readFile(file));
      } catch (error) {
        res.writeHead(500).end(String(error));
      }
    });
    server.listen(port, () => resolve(server));
  });

const checks = [];
const check = (name, pass, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const main = async () => {
  if (!existsSync(path.join(OUT, VARIANT))) {
    console.error(`[parity] ${OUT}/${VARIANT} missing -- run: node ssr-poc/build.js`);
    process.exit(1);
  }

  const server = await serve(path.join(OUT, VARIANT), PORT);
  const browser = await chromium.launch();
  const url = `http://127.0.0.1:${PORT}${ROUTE.replace(/\/$/, "")}/${QUERY}`;

  console.log(`[parity] ${VARIANT} @ ${url}\n`);

  // --- 1. the server output must paint with the app bundle blocked ---------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route("**/public/main.js*", (route) => route.abort());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);

    const preJs = await page.evaluate(() => {
      const app = document.querySelector("rvn-app");
      const scope = app?.shadowRoot ?? app;
      const views = scope ? [...scope.querySelectorAll("rtgl-view")] : [];
      const box = app?.getBoundingClientRect();
      return {
        views: views.length,
        upgraded: views[0] ? Boolean(views[0].shadowRoot) : false,
        width: box ? Math.round(box.width) : 0,
        height: box ? Math.round(box.height) : 0,
      };
    });

    check("server markup paints without main.js", preJs.views > 0 && preJs.upgraded,
      `${preJs.views} rtgl-view, primitives upgraded=${preJs.upgraded}`);
    check("prerendered shell fills the viewport", preJs.width >= 1400 && preJs.height >= 800,
      `${preJs.width}x${preJs.height}`);
    await ctx.close();
  }

  // --- 2. the client must adopt it, not rebuild it -------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // Tag server nodes before the app bundle can touch them, so we can prove
    // the SAME element objects survived hydration.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const app = document.querySelector("rvn-app");
        const scope = app?.shadowRoot ?? app;
        scope?.querySelectorAll("rtgl-view, rtgl-text").forEach((n, i) =>
          n.setAttribute("data-server-node", String(i)));
      });
    });

    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(BOOT_WAIT_MS);

    const state = await page.evaluate(() => {
      const app = document.querySelector("rvn-app");
      const shadow = app?.shadowRoot;
      const target = shadow?.querySelector("[data-rtgl-render-target]");
      return {
        ssr: globalThis.__rtglSsr ?? null,
        renderTargets: shadow ? shadow.querySelectorAll("[data-rtgl-render-target]").length : 0,
        survivingServerNodes: shadow ? shadow.querySelectorAll("[data-server-node]").length : 0,
        targetRoots: target ? target.children.length : 0,
        strayTemplates: shadow ? shadow.querySelectorAll("template[shadowrootmode]").length : 0,
      };
    });

    const ssr = state.ssr ?? { hydrated: 0, mismatched: 0, reasons: [] };

    check("hydration ran", ssr.hydrated > 0, `hydrated=${ssr.hydrated}`);
    check("zero hydration mismatches", ssr.mismatched === 0,
      ssr.mismatched ? `${ssr.mismatched}: ${(ssr.reasons ?? []).join(" | ")}` : "0");
    check("server DOM was adopted, not replaced", state.survivingServerNodes > 0,
      `${state.survivingServerNodes} server nodes still live`);
    check("no duplicated tree in the render target", state.targetRoots <= 2,
      `${state.targetRoots} roots`);
    check("declarative templates were consumed by the parser", state.strayTemplates === 0,
      `${state.strayTemplates} stray`);
    check("no console errors during boot", consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "));

    await ctx.close();
  }

  await browser.close();
  server.close();

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n[parity] ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    console.error(`[parity] FAILED: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
  console.log("[parity] OK");
};

main().catch((error) => {
  console.error("[parity] error:", error);
  process.exit(1);
});
