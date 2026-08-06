/**
 * Measures the SSR prototype variants in real Chromium.
 *
 * Answers three questions the design rests on:
 *   Q1 does server-rendered markup paint BEFORE main.js executes?
 *   Q2 does a declarative shadow root on a not-yet-upgraded custom element
 *      render its contents (and do rtgl-* inside it upgrade and style)?
 *   Q3 does the client's first patch ADOPT that DOM or DUPLICATE it?
 */

import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "ssr-poc/out");
const SHOTS = path.join(ROOT, "ssr-poc/shots");
const PORT = 3199;
const CPU_THROTTLE = 4;
const VARIANTS = ["a_baseline", "b_lightdom", "c_dsd", "d_dsd_hydrate", "e_nested_dsd"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const serve = (root, port) =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = decodeURIComponent(req.url.split("?")[0]);
        let file = path.join(root, url);
        if (existsSync(file) && statSync(file).isDirectory()) {
          file = path.join(file, "index.html");
        }
        if (!existsSync(file)) {
          res.writeHead(404).end("not found");
          return;
        }
        const body = await readFile(file);
        res.writeHead(200, {
          "content-type": MIME[path.extname(file)] || "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(body);
      } catch (error) {
        res.writeHead(500).end(String(error));
      }
    });
    server.listen(port, () => resolve(server));
  });

/** Paint metrics with main.js allowed to run normally. */
const measureBoot = async (browser, variant, port) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  await page.goto(`http://127.0.0.1:${port}/projects/`, {
    waitUntil: "load",
    timeout: 60000,
  });

  // Give the app time to boot (IndexedDB + collab + i18n) before inspecting.
  await page.waitForTimeout(4000);

  const paint = await page.evaluate(() =>
    Object.fromEntries(
      performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)]),
    ),
  );

  // Q3: did the client adopt the server tree or append a second copy?
  // The decisive signal is the number of ELEMENT CHILDREN of the render
  // target: parseView always produces exactly one root <div style=display:
  // contents>, so 2 means snabbdom appended its tree beside the server's
  // instead of diffing against it.
  const dom = await page.evaluate(() => {
    const app = document.querySelector("rvn-app");
    const shadow = app?.shadowRoot;
    const target = shadow?.querySelector("[data-rtgl-render-target]");
    return {
      hasShadow: Boolean(shadow),
      renderTargets: shadow
        ? shadow.querySelectorAll("[data-rtgl-render-target]").length
        : 0,
      targetRoots: target ? target.children.length : 0,
      lightChildren: app ? app.children.length : 0,
      shadowViews: shadow ? shadow.querySelectorAll("rtgl-view").length : 0,
      // Set by the patched runtime in variant D.
      ssr: globalThis.__rtglSsr || null,
      visibleText: (document.body.innerText || "").trim().replace(/\s+/g, " ").slice(0, 90),
    };
  });

  await page.screenshot({ path: path.join(SHOTS, `${variant}-booted.png`) });
  await context.close();
  return { paint, dom };
};

/**
 * Q1/Q2: block main.js entirely. Whatever paints is what the server produced,
 * upgraded only by the blocking rtgl-* UI bundle.
 */
const measurePreJs = async (browser, variant, port) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.route("**/public/main.js*", (route) => route.abort());

  await page.goto(`http://127.0.0.1:${port}/projects/`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const app = document.querySelector("rvn-app");
    const shadow = app?.shadowRoot;
    const scope = shadow || app;
    const rect = app?.getBoundingClientRect();
    const views = scope ? scope.querySelectorAll("rtgl-view") : [];
    const first = views[0];
    const firstRect = first?.getBoundingClientRect();
    return {
      appUpgraded: app ? app.constructor.name !== "HTMLElement" : false,
      hasShadow: Boolean(shadow),
      appBox: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      viewCount: views.length,
      // If rtgl-view upgraded, it has its own shadow root and real layout.
      firstViewUpgraded: first ? Boolean(first.shadowRoot) : false,
      firstViewBox: firstRect
        ? { w: Math.round(firstRect.width), h: Math.round(firstRect.height) }
        : null,
      renderedText: (document.body.innerText || "").trim().slice(0, 80),
    };
  });

  await page.screenshot({ path: path.join(SHOTS, `${variant}-prejs.png`) });
  await context.close();
  return state;
};

const main = async () => {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const results = {};

  for (const [index, variant] of VARIANTS.entries()) {
    const port = PORT + index;
    const server = await serve(path.join(OUT, variant), port);
    process.stdout.write(`\n[measure] ${variant}  (:${port}/projects/)\n`);

    const preJs = await measurePreJs(browser, variant, port);
    const booted = await measureBoot(browser, variant, port);
    results[variant] = { preJs, booted };

    console.log(`  PRE-JS  app box ........ ${preJs.appBox ? `${preJs.appBox.w}x${preJs.appBox.h}` : "n/a"}`);
    console.log(`          shadow root .... ${preJs.hasShadow}`);
    console.log(`          rtgl-view count  ${preJs.viewCount}  (first upgraded: ${preJs.firstViewUpgraded}, box ${preJs.firstViewBox ? `${preJs.firstViewBox.w}x${preJs.firstViewBox.h}` : "n/a"})`);
    console.log(`  BOOTED  FP ............. ${booted.paint["first-paint"] ?? "-"} ms`);
    console.log(`          FCP ............ ${booted.paint["first-contentful-paint"] ?? "-"} ms`);
    console.log(`          render targets . ${booted.dom.renderTargets}`);
    console.log(`          target roots ... ${booted.dom.targetRoots}  (expect 1; 2 = appended, not adopted)`);
    console.log(`          shadow rtgl-view ${booted.dom.shadowViews}`);
    console.log(`          light children . ${booted.dom.lightChildren}`);
    console.log(`          visible text ... ${JSON.stringify(booted.dom.visibleText)}`);
    if (booted.dom.ssr) {
      console.log(`          hydration ...... hydrated=${booted.dom.ssr.hydrated} mismatched=${booted.dom.ssr.mismatched}`);
      if (booted.dom.ssr.reasons?.length) {
        console.log(`          mismatch why ... ${booted.dom.ssr.reasons.slice(0, 3).join(" | ")}`);
      }
    }

    server.close();
  }

  console.log("\n===================== SUMMARY =====================");
  console.log(
    ["variant", "FP", "FCP", "pre-JS UI", "render target", "hydration"].map((s) => s.padEnd(15)).join(""),
  );
  for (const [variant, r] of Object.entries(results)) {
    const painted =
      r.preJs.viewCount > 0 && r.preJs.firstViewUpgraded ? "PAINTED" : "blank";
    const baselineRoots = results.a_baseline.booted.dom.targetRoots;
    const extra = r.booted.dom.targetRoots - baselineRoots;
    const dup = extra > 0 ? `+${extra} STALE` : "clean";
    console.log(
      [
        variant,
        `${r.booted.paint["first-paint"] ?? "-"}ms`,
        `${r.booted.paint["first-contentful-paint"] ?? "-"}ms`,
        painted,
        dup,
        r.booted.dom.ssr
          ? `h=${r.booted.dom.ssr.hydrated} m=${r.booted.dom.ssr.mismatched}`
          : "-",
      ]
        .map((s) => String(s).padEnd(15))
        .join(""),
    );
  }

  await browser.close();
};

main().catch((error) => {
  console.error("[measure] FAILED:", error);
  process.exit(1);
});
