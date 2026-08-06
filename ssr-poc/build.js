/**
 * Generates SSR prototype variants into ssr-poc/out/.
 * Never writes to _site. Assets are symlinked from the real build.
 *
 *   A  baseline      current shell, empty <rvn-app>            (control)
 *   B  light-dom     server HTML as plain children of <rvn-app>
 *   C  dsd           server HTML inside <template shadowrootmode="open">
 *   D  dsd-hydrate   C + hydration flag consumed by a patched fe runtime
 */

import { mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { renderComponentTree } from "./lib/render.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "ssr-poc/out");
const UI_VERSION = "1.13.1";

// node ssr-poc/build.js [route]   e.g. /project/variables
const ROUTE = process.argv[2] || "/projects";
const ROUTE_DIR = ROUTE.replace(/^\//, "");

/**
 * Without this, <rvn-app> is an unknown element (display: inline) and the whole
 * prerendered tree collapses to a ~14px strip. This exact rule already ships in
 * static/ios/index.html -- it is simply missing from the web shell.
 */
const APP_HOST_CSS = `
      rvn-app {
        display: block;
        height: var(--rvn-app-viewport-height, 100vh);
        min-height: 0;
      }`;

const head = ({ hostCss, preload }) => `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RouteVN Creator</title>${
      preload
        ? `\n    <link rel="preload" as="script" href="/public/@rettangoli/ui@${UI_VERSION}/dist/rettangoli-iife-ui.min.js" />`
        : ""
    }
    <link rel="stylesheet" href="/public/theme.css" />${
      hostCss ? `\n    <style>${hostCss}\n    </style>` : ""
    }
    <script src="/public/windowChrome.js" defer></script>
    <script src="/public/rtgl-icons.js"></script>
    <script src="/public/@rettangoli/ui@${UI_VERSION}/dist/rettangoli-iife-ui.min.js"></script>
    <script type="module" src="/public/main.js"></script>`;

const doc = ({ hostCss, preload, body }) => `<!doctype html>
<html lang="en">
  <head>
${head({ hostCss, preload })}
  </head>
  <body class="dark">
${body}
    <rtgl-global-ui></rtgl-global-ui>
  </body>
</html>
`;

const VARIANTS = {
  // Control: exactly what ships today, plus a doctype and title so the only
  // difference measured is the prerendered body.
  a_baseline: () => doc({
    hostCss: null,
    preload: false,
    body: "    <rvn-app></rvn-app>",
  }),

  // Server markup as ordinary light-DOM children. rtgl-* primitives are already
  // defined by the blocking head script, so this paints at parse time. When
  // main.js boots and rvn-app calls attachShadow, these children become
  // unslotted and stop rendering -- they self-erase with no teardown code.
  b_lightdom: (html) => doc({
    hostCss: APP_HOST_CSS,
    preload: true,
    body: `    <rvn-app>${html}</rvn-app>`,
  }),

  // Declarative shadow DOM. rvn-app comes from the DEFERRED module bundle, so at
  // parse time it is an unknown element and the parser attaches this template as
  // a real shadow root. componentDom.js does `host.shadowRoot ?? attachShadow`
  // and looks for [data-rtgl-render-target], so the client should adopt it.
  c_dsd: (html, inner) => doc({
    hostCss: APP_HOST_CSS,
    preload: true,
    body: `    <rvn-app><template shadowrootmode="open"><div data-rtgl-render-target style="display: contents">${inner}</div></template></rvn-app>`,
  }),

  // Same markup as C, flagged so a patched fe runtime can attempt a hydrating
  // first patch instead of appending. Identical output to C until the runtime
  // patch is applied.
  d_dsd_hydrate: (html, inner) => doc({
    hostCss: APP_HOST_CSS,
    preload: true,
    body: `    <rvn-app data-rtgl-hydrate="true"><template shadowrootmode="open"><div data-rtgl-render-target style="display: contents">${inner}</div></template></rvn-app>`,
  }),
  // Every fe component gets its OWN declarative shadow root, so each one can
  // adopt its own server output instead of only the root hydrating.
  e_nested_dsd: (html, inner, nested) => doc({
    hostCss: APP_HOST_CSS,
    preload: true,
    body: `    <rvn-app data-rtgl-hydrate="true"><template shadowrootmode="open"><div data-rtgl-render-target style="display: contents">${nested}</div></template></rvn-app>`,
  }),
};

/**
 * The environment the SERVER knows, plus inert stand-ins for the services
 * handlers reach for. `platform` is the important one: every store that cares
 * hardcodes "tauri" as its default and expects a handler to correct it from
 * appService.getPlatform().
 */
const createServerDeps = () => {
  const noop = () => {};
  const nullService = new Proxy({}, { get: () => () => undefined });
  return {
    // Known values where the server genuinely knows the answer; a no-op
    // function for everything else, so an unstubbed method degrades to
    // undefined instead of throwing and losing the whole component.
    appService: new Proxy(
      {
        getPlatform: () => "web",
        getPath: () => "/projects",
        getPayload: () => ({}),
        getCurrentProjectId: () => "",
        getUserConfig: () => ({}),
        getTheme: () => "dark",
        getLocale: () => "en",
      },
      { get: (target, key) => target[key] ?? (() => undefined) },
    ),
    projectService: nullService,
    apiService: nullService,
    graphicsService: nullService,
    audioService: nullService,
    subject: { subscribe: noop, dispatchCall: () => noop, next: noop },
    uiConfig: { id: "normal", inputMode: "pointer", navigation: "sidebar" },
    globalUI: { emit: noop, once: noop, on: noop },
  };
};

const main = async () => {
  console.log("[poc] rendering component tree in bare Node...");
  const { html, inner, stats } = await renderComponentTree({
    root: ROOT,
    rootTag: "rvn-app",
    serverDeps: createServerDeps(),
    seedRoot: { setCurrentRoute: { route: ROUTE, payload: { p: "demo-project" } } },
  });

  const nestedResult = await renderComponentTree({
    root: ROOT,
    rootTag: "rvn-app",
    nestedShadow: true,
    serverDeps: createServerDeps(),
    seedRoot: { setCurrentRoute: { route: ROUTE, payload: { p: "demo-project" } } },
  });
  const nested = nestedResult.inner;
  console.log(`[poc] nested-shadow variant: ${nestedResult.html.length} bytes`);

  console.log(`[poc] ${stats.componentCount} fe components rendered, ${html.length} bytes`);
  console.log(`[poc] tree: ${stats.rendered.join(" > ")}`);
  if (stats.failed.length) console.log("[poc] FAILED:", stats.failed);
  console.log(`[poc] handleBeforeMount ran: ${stats.beforeMountRan.join(", ") || "none"}`);
  if (stats.beforeMountFailed.length) {
    console.log("[poc] handleBeforeMount threw (degraded to defaults):");
    for (const f of stats.beforeMountFailed) console.log(`         ${f.tag}: ${f.reason}`);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const publicSrc = path.join(ROOT, "_site/public");
  if (!existsSync(publicSrc)) {
    throw new Error("_site/public not found -- run `bun run build:web` first.");
  }

  // Each variant gets its own document root so it can be served AT /projects/.
  // That matters: the client router reads window.location.pathname, and a path
  // the 29 route patterns do not match falls through to an empty view with a
  // sidebar -- which would make every variant converge on the wrong state.
  // Variant D needs a main.js built from a hydration-patched framework.
  // Build it with: node ssr-poc/hydration/apply.js on
  //                rtgl fe build -s src/setup.web.js -o ssr-poc/hydration/build/main.js
  //                node ssr-poc/hydration/apply.js off
  const hydrateBundle = path.join(ROOT, "ssr-poc/hydration/build/main.js");
  const hasHydrateBundle = existsSync(hydrateBundle);

  for (const [name, render] of Object.entries(VARIANTS)) {
    const root = path.join(OUT, name);
    const dir = path.join(root, ROUTE_DIR);
    mkdirSync(dir, { recursive: true });

    if ((name === "d_dsd_hydrate" || name === "e_nested_dsd") && hasHydrateBundle) {
      // Mirror _site/public entry by entry so main.js can be swapped without
      // touching the real build.
      const publicDir = path.join(root, "public");
      mkdirSync(publicDir, { recursive: true });
      for (const entry of readdirSync(publicSrc)) {
        if (entry === "main.js") continue;
        symlinkSync(path.join(publicSrc, entry), path.join(publicDir, entry));
      }
      symlinkSync(hydrateBundle, path.join(publicDir, "main.js"));
    } else {
      // Share the real build's assets rather than copying 4.8 MB per variant.
      symlinkSync(publicSrc, path.join(root, "public"), "dir");
    }

    const out = render(html, inner, nested);
    writeFileSync(path.join(dir, "index.html"), out);
    const note =
      (name === "d_dsd_hydrate" || name === "e_nested_dsd") ? (hasHydrateBundle ? "  [hydrating bundle]" : "  [NO HYDRATE BUNDLE - same as C]") : "";
    console.log(`[poc] ${name.padEnd(16)} ${String(out.length).padStart(6)} bytes${note}`);
  }

  writeFileSync(path.join(OUT, "shell.html"), html);
  console.log(`[poc] wrote ${OUT}  (route ${ROUTE})`);
};

main().catch((error) => {
  console.error("[poc] FAILED:", error);
  process.exit(1);
});
