// Real layout-editor and canvas views/stores, without project persistence or GPU
// setup. Check available workspace geometry as the same mounted editor resizes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { chromium, webkit } from "playwright";
import jemplParse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";
import { EN_I18N } from "../support/i18n.js";

const directory = await mkdtemp(join(tmpdir(), "rvn-canvas-height-"));
try {
  const imports = [
    `import createComponent from ${JSON.stringify(resolve("node_modules/@rettangoli/fe/src/createComponent.js"))};`,
  ];
  const registrations = [];
  for (const [folder, name] of [
    ["pages", "layoutEditor"],
    ["components", "layoutEditorCanvas"],
  ]) {
    const prefix = resolve(`src/${folder}/${name}/${name}`);
    const config = {};
    for (const part of ["view", "schema"]) {
      config[part] = yaml.load(
        await readFile(`${prefix}.${part}.yaml`, "utf8"),
      );
    }
    config.view.template = jemplParse(config.view.template);
    config.view.refs = {};
    delete config.schema.methods;
    config.constants = {
      contextMenuItems: [],
      emptyContextMenuItems: [],
      controlContextMenuItems: [],
      controlEmptyContextMenuItems: [],
    };
    imports.push(
      `import * as ${name}Store from ${JSON.stringify(`${prefix}.store.js`)};`,
    );
    const store =
      name === "layoutEditor"
        ? `{...layoutEditorStore,createInitialState:()=>({...layoutEditorStore.createInitialState(),isTouchMode:touch,projectResolution:resolution,layout:{id:'layout-one',name:'Layout One'},isPreviewMounted:true})}`
        : "layoutEditorCanvasStore";
    registrations.push(
      `customElements.define(${JSON.stringify(config.schema.componentName)},createComponent({...${JSON.stringify(config)},store:${store}},deps));`,
    );
  }
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "fixture.js");
  await writeFile(
    entry,
    `${imports.join("\n")}\nexport const register=(deps,touch,resolution)=>{${registrations.join("\n")}};`,
  );
  execFileSync("bun", [
    "build",
    entry,
    "--target",
    "browser",
    "--outfile",
    bundle,
  ]);
  const assets = new Map([
    ["/fixture.js", await readFile(bundle, "utf8")],
    [
      "/ui.js",
      await readFile(
        "node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js",
        "utf8",
      ),
    ],
    ["/theme.css", await readFile("static/public/theme.css", "utf8")],
  ]);
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme.css"><script src="/ui.js"></script>
<style>body{margin:0;padding:32px 0 26px;box-sizing:border-box;height:100dvh;display:flex;flex-direction:column}#page{min-height:0;flex:1}#tabs{height:64px;flex-shrink:0}</style>
<body class="dark"><div id="page"></div><div id="tabs">Tabs</div>
<script type="module">
import {register} from '/fixture.js';
const query=new URLSearchParams(location.search);
register({__rtglI18nRuntime:{locale:'en',getMessages:()=>(${JSON.stringify(EN_I18N)})}},query.get('touch')==='true',JSON.parse(query.get('resolution')));
document.querySelector('#page').append(document.createElement('rvn-layout-editor'));
</script>`;
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const touch of [true, false]) {
        for (const resolution of [
          { width: 1920, height: 1080 },
          { width: 1080, height: 1920 },
        ]) {
          const page = await browser.newPage();
          const errors = [];
          page.on("pageerror", (error) => {
            errors.push(error.message);
            console.error(error.stack);
          });
          await page.route("http://fixture.test/**", (route) => {
            const path = new URL(route.request().url()).pathname;
            return route.fulfill({
              contentType: path.endsWith(".js")
                ? "text/javascript"
                : path.endsWith(".css")
                  ? "text/css"
                  : "text/html",
              body: assets.get(path) ?? html,
            });
          });
          await page.goto(
            `http://fixture.test/?touch=${touch}&resolution=${encodeURIComponent(JSON.stringify(resolution))}`,
          );
          const surface = page.locator(
            'rvn-layout-editor-canvas rtgl-view[bgc="mu"]',
          );
          await surface.waitFor({ state: "visible", timeout: 5000 });
          const originalCanvas = await surface.elementHandle();
          for (const viewport of [
            { width: 1133, height: 744 },
            { width: 744, height: 1133 },
            { width: 600, height: 744 },
            { width: 360, height: 764 },
            { width: 764, height: 360 },
          ]) {
            await page.setViewportSize(viewport);
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
            const geometry = await surface.evaluate((canvas) => {
              const component = canvas.getRootNode().host;
              const background = component.parentElement.parentElement;
              const workspace = background.parentElement;
              const canvasBounds = canvas.getBoundingClientRect();
              const workspaceBounds = workspace.getBoundingClientRect();
              return {
                canvas: canvasBounds.toJSON(),
                workspace: workspaceBounds.toJSON(),
                preview: workspace.children[1].getBoundingClientRect().toJSON(),
              };
            });
            assert.ok(
              await originalCanvas.evaluate((canvas) => canvas.isConnected),
              "Rotation must preserve the mounted canvas",
            );
            assert.ok(geometry.canvas.height > 0, "Canvas must remain visible");
            assert.ok(
              geometry.canvas.width <= geometry.workspace.width + 1,
              "Canvas must fit the workspace width",
            );
            assert.ok(
              Math.abs(
                geometry.canvas.width / geometry.canvas.height -
                  resolution.width / resolution.height,
              ) < 0.02,
              "Canvas aspect ratio must be preserved",
            );
            if (touch) {
              assert.ok(
                geometry.canvas.height <= geometry.workspace.height / 2 + 1,
                `${engineName}: canvas exceeds half the usable editor height`,
              );
              assert.ok(
                geometry.preview.height >= geometry.workspace.height / 2 - 1,
                "Preview must retain at least half the usable editor height",
              );
            } else {
              assert.ok(
                geometry.canvas.height <= viewport.height / 2 + 1,
                "Desktop keeps its existing viewport cap",
              );
            }
          }
          assert.deepEqual(errors, []);
          console.log(
            engineName,
            touch ? "touch" : "desktop",
            resolution,
            "canvas sizing passed",
          );
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
