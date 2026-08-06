/**
 * Hydration correctness check: is the node the user clicks the SAME node the
 * server rendered, and does it respond?
 *
 * Captures a reference to a server-rendered element BEFORE main.js runs, then
 * after boot verifies (a) that element is still in the document (adopted, not
 * replaced) and (b) clicking it drives the app.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const OUT = path.join(path.resolve(import.meta.dirname, ".."), "ssr-poc/out");
const VARIANTS = ["b_lightdom", "c_dsd", "d_dsd_hydrate"];
const PORT = 3250;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const serve = (root, port) =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = decodeURIComponent(req.url.split("?")[0]);
        let file = path.join(root, url);
        if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
        if (!existsSync(file)) return res.writeHead(404).end("nf");
        res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(await readFile(file));
      } catch (e) {
        res.writeHead(500).end(String(e));
      }
    });
    server.listen(port, () => resolve(server));
  });

const run = async (browser, variant, port) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Tag every server-rendered element before the app bundle can touch them.
  await page.addInitScript(() => {
    const tag = () => {
      const app = document.querySelector("rvn-app");
      const scope = app?.shadowRoot || app;
      if (!scope) return;
      scope.querySelectorAll("rtgl-view, rtgl-text, rtgl-button").forEach((n, i) => {
        n.setAttribute("data-server-node", String(i));
      });
      window.__serverNodeCount = scope.querySelectorAll("[data-server-node]").length;
    };
    document.addEventListener("DOMContentLoaded", tag);
  });

  await page.goto(`http://127.0.0.1:${port}/projects/`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(4000);

  const result = await page.evaluate(() => {
    const app = document.querySelector("rvn-app");
    const scope = app?.shadowRoot || app;
    const surviving = scope ? scope.querySelectorAll("[data-server-node]").length : 0;
    return {
      tagged: window.__serverNodeCount ?? 0,
      surviving,
      // Is a server-tagged node actually on screen (not unslotted/hidden)?
      visibleServerNodes: scope
        ? [...scope.querySelectorAll("[data-server-node]")].filter((n) => {
            const r = n.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length
        : 0,
    };
  });

  // Drive the UI: click "Create" and see whether a dialog opens.
  let interactive = false;
  try {
    const createButton = page.locator("rtgl-button", { hasText: "Create" }).first();
    await createButton.click({ timeout: 5000 });
    await page.waitForTimeout(800);
    interactive = await page.evaluate(() => {
      const app = document.querySelector("rvn-app");
      const scope = app?.shadowRoot;
      if (!scope) return false;
      const dialog = scope.querySelector("rvn-project-create-dialog");
      // The dialog primitive marks itself open when shown.
      return Boolean(dialog?.shadowRoot?.querySelector("dialog[open]")) ||
        Boolean(dialog?.querySelector?.("dialog[open]")) ||
        Boolean(document.querySelector("dialog[open]"));
    });
  } catch {
    interactive = false;
  }

  await context.close();
  return { ...result, interactive };
};

const main = async () => {
  const browser = await chromium.launch();
  console.log("variant          tagged  surviving  visible  clickable");
  for (const [i, variant] of VARIANTS.entries()) {
    const port = PORT + i;
    const server = await serve(path.join(OUT, variant), port);
    const r = await run(browser, variant, port);
    console.log(
      `${variant.padEnd(16)} ${String(r.tagged).padEnd(7)} ${String(r.surviving).padEnd(10)} ${String(r.visibleServerNodes).padEnd(8)} ${r.interactive ? "YES" : "no"}`,
    );
    server.close();
  }
  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
