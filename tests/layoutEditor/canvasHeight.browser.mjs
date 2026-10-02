// Real layout-editor and canvas views/stores, without project persistence or GPU
// setup. Check available workspace geometry as the same mounted editor resizes.
// Touch layouts stack the panels under the canvas (half height); desktop and
// tablet landscape keep them in a right panel, so the canvas fills the
// workspace height and is vertically centered.
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
  imports.push(
    `import { ZoomViewportElement } from ${JSON.stringify(resolve("src/primitives/zoomViewport.js"))};`,
  );
  const registrations = [
    `customElements.define("rvn-zoom-viewport", ZoomViewportElement);`,
  ];
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
        ? `{...layoutEditorStore,createInitialState:()=>({...layoutEditorStore.createInitialState(),isTouchMode:touch,appWindowMetrics:tablet?{width:1133,height:744}:{width:0,height:0},projectResolution:resolution,canvasZoom:zoom,isCanvasPanMode:pan,layout:{id:'layout-one',name:'Layout One'},isPreviewMounted:true})}`
        : "layoutEditorCanvasStore";
    registrations.push(
      `customElements.define(${JSON.stringify(config.schema.componentName)},createComponent({...${JSON.stringify(config)},store:${store}},deps));`,
    );
  }
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "fixture.js");
  await writeFile(
    entry,
    `${imports.join("\n")}\nexport const register=(deps,touch,resolution,tablet,zoom=1,pan=false)=>{${registrations.join("\n")}};`,
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
register({__rtglI18nRuntime:{locale:'en',getMessages:()=>(${JSON.stringify(EN_I18N)})}},query.get('touch')==='true',JSON.parse(query.get('resolution')),query.get('tablet')==='true',Number(query.get('zoom')??1),query.get('pan')==='true');
document.querySelector('#page').append(document.createElement('rvn-layout-editor'));
</script>`;
  const openEditor = async (
    browser,
    { touch, tablet, resolution, zoom = 1, pan = false },
  ) => {
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
    await page.setViewportSize({ width: 1133, height: 744 });
    await page.goto(
      `http://fixture.test/?touch=${touch}&tablet=${tablet}&zoom=${zoom}&pan=${pan}&resolution=${encodeURIComponent(JSON.stringify(resolution))}`,
    );
    const surface = page.locator(
      'rvn-layout-editor-canvas rtgl-view[bgc="mu"]',
    );
    await surface.waitFor({ state: "visible", timeout: 5000 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    return { page, surface, errors };
  };
  // Geometry of the canvas inside its scrolling workspace, scrolled to the
  // start and to the end.
  const measureZoomedCanvas = (surface) =>
    surface.evaluate((canvas) => {
      const component = canvas.getRootNode().host;
      const background = component.parentElement.parentElement;
      const bounds = () => ({
        canvas: canvas.getBoundingClientRect().toJSON(),
        background: background.getBoundingClientRect().toJSON(),
      });
      background.scrollTo(0, 0);
      const start = bounds();
      background.scrollTo(background.scrollWidth, background.scrollHeight);
      const end = bounds();
      const panLayer = component.parentElement.querySelector("#canvasPanLayer");
      const touchAction = getComputedStyle(background).touchAction;
      return {
        start,
        end,
        scrollable:
          background.scrollWidth > background.clientWidth ||
          background.scrollHeight > background.clientHeight,
        touchAction,
        panLayer: panLayer && {
          bounds: panLayer.getBoundingClientRect().toJSON(),
        },
      };
    });

  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const { name, touch, tablet } of [
        { name: "desktop", touch: false, tablet: false },
        { name: "tablet landscape", touch: true, tablet: true },
      ]) {
        const resolution = { width: 1920, height: 1080 };
        const fitted = await openEditor(browser, { touch, tablet, resolution });
        const fit = await measureZoomedCanvas(fitted.surface);
        assert.equal(fit.scrollable, false, "A fitted canvas must not scroll");
        await fitted.page.close();

        const zoomed = await openEditor(browser, {
          touch,
          tablet,
          resolution,
          zoom: 2,
          pan: touch,
        });
        const geometry = await measureZoomedCanvas(zoomed.surface);
        const label = `${engineName} ${name} zoom 2`;
        assert.ok(
          Math.abs(geometry.start.canvas.width - fit.start.canvas.width * 2) <=
            2,
          `${label}: canvas must be twice the fitted width (${geometry.start.canvas.width} vs ${fit.start.canvas.width})`,
        );
        assert.ok(geometry.scrollable, `${label}: workspace must scroll`);
        // Every edge must be reachable: auto margins, not justify-content,
        // center the canvas, so its overflow stays scrollable.
        assert.ok(
          geometry.start.canvas.top >= geometry.start.background.top - 1 &&
            geometry.start.canvas.left >= geometry.start.background.left - 1,
          `${label}: top-left edge must be reachable (${JSON.stringify(geometry.start)})`,
        );
        assert.ok(
          geometry.end.canvas.bottom <= geometry.end.background.bottom + 1 &&
            geometry.end.canvas.right <= geometry.end.background.right + 1,
          `${label}: bottom-right edge must be reachable (${JSON.stringify(geometry.end)})`,
        );
        if (touch) {
          assert.ok(geometry.panLayer, `${label}: pan mode adds a pan layer`);
          assert.ok(
            Math.abs(
              geometry.panLayer.bounds.width - geometry.end.canvas.width,
            ) <= 1 &&
              Math.abs(
                geometry.panLayer.bounds.height - geometry.end.canvas.height,
              ) <= 1,
            `${label}: the pan layer must cover the canvas`,
          );
        } else {
          assert.equal(geometry.panLayer, null, "Desktop pans by scrolling");
        }
        // The viewport handles touch itself: the renderer canvas blocks it.
        assert.equal(geometry.touchAction, "none");
        assert.deepEqual(zoomed.errors, []);
        await zoomed.page.close();

        // Pinch from 100 px to 200 px apart while the midpoint moves 40 px.
        const pinched = await openEditor(browser, {
          touch,
          tablet,
          resolution,
        });
        const pinch = await pinched.surface.evaluate((canvas) => {
          const viewport =
            canvas.getRootNode().host.parentElement.parentElement;
          const reports = [];
          viewport.addEventListener("zoom-change", (event) =>
            reports.push(event.detail.zoom),
          );
          const fire = (type, pointerId, x, y) =>
            canvas.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                pointerId,
                pointerType: "touch",
                isPrimary: pointerId === 1,
                clientX: x,
                clientY: y,
              }),
            );
          const before = canvas.getBoundingClientRect();
          const start = {
            x: before.left + before.width / 2,
            y: before.top + before.height / 2,
          };
          const fraction = {
            x: (start.x - before.left) / before.width,
            y: (start.y - before.top) / before.height,
          };
          fire("pointerdown", 1, start.x - 50, start.y);
          fire("pointerdown", 2, start.x + 50, start.y);
          const end = { x: start.x + 40, y: start.y + 20 };
          fire("pointermove", 1, end.x - 100, end.y);
          fire("pointermove", 2, end.x + 100, end.y);
          const after = canvas.getBoundingClientRect();
          fire("pointerup", 2, end.x + 100, end.y);
          fire("pointerup", 1, end.x - 100, end.y);
          return {
            ratio: after.width / before.width,
            drift: {
              x: after.left + fraction.x * after.width - end.x,
              y: after.top + fraction.y * after.height - end.y,
            },
            reports,
          };
        });
        const pinchLabel = `${engineName} ${name} pinch`;
        assert.ok(
          Math.abs(pinch.ratio - 2) < 0.02,
          `${pinchLabel}: canvas must double (${pinch.ratio})`,
        );
        assert.ok(
          Math.abs(pinch.drift.x) <= 1 && Math.abs(pinch.drift.y) <= 1,
          `${pinchLabel}: the pinched point must stay under the fingers (${JSON.stringify(pinch.drift)})`,
        );
        assert.deepEqual(pinch.reports, [2]);

        // A trackpad pinch zooms around the pointer.
        const wheel = await pinched.surface.evaluate((canvas) => {
          const viewport =
            canvas.getRootNode().host.parentElement.parentElement;
          const before = canvas.getBoundingClientRect();
          const point = { x: before.left + 30, y: before.top + 30 };
          const fraction = {
            x: (point.x - before.left) / before.width,
            y: (point.y - before.top) / before.height,
          };
          viewport.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              ctrlKey: true,
              deltaY: -Math.log(1.5) / 0.01,
              clientX: point.x,
              clientY: point.y,
            }),
          );
          const after = canvas.getBoundingClientRect();
          return {
            ratio: after.width / before.width,
            drift: {
              x: after.left + fraction.x * after.width - point.x,
              y: after.top + fraction.y * after.height - point.y,
            },
          };
        });
        assert.ok(
          Math.abs(wheel.ratio - 1.5) < 0.02,
          `${engineName} ${name} trackpad pinch: canvas must grow 1.5x (${wheel.ratio})`,
        );
        assert.ok(
          Math.abs(wheel.drift.x) <= 1 && Math.abs(wheel.drift.y) <= 1,
          `${engineName} ${name} trackpad pinch: the pointer must stay over the same point (${JSON.stringify(wheel.drift)})`,
        );
        assert.deepEqual(pinched.errors, []);
        await pinched.page.close();

        if (touch) {
          // In pan mode one finger on the canvas pans.
          const panning = await openEditor(browser, {
            touch,
            tablet,
            resolution,
            zoom: 2,
            pan: true,
          });
          const pan = await panning.surface.evaluate((canvas) => {
            const host = canvas.getRootNode().host;
            const viewport = host.parentElement.parentElement;
            const layer = host.parentElement.querySelector("#canvasPanLayer");
            viewport.scrollTo(100, 50);
            const fire = (type, x, y) =>
              layer.dispatchEvent(
                new PointerEvent(type, {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  pointerId: 1,
                  pointerType: "touch",
                  isPrimary: true,
                  clientX: x,
                  clientY: y,
                }),
              );
            fire("pointerdown", 400, 400);
            fire("pointermove", 340, 420);
            fire("pointerup", 340, 420);
            return [viewport.scrollLeft, viewport.scrollTop];
          });
          assert.deepEqual(
            pan,
            [160, 30],
            `${engineName} ${name}: pan mode must scroll with one finger`,
          );
          await panning.page.close();
        }

        const small = await openEditor(browser, {
          touch,
          tablet,
          resolution,
          zoom: 0.5,
        });
        const half = await measureZoomedCanvas(small.surface);
        const centerOffset = (axis, size) =>
          Math.abs(
            half.start.canvas[axis] +
              half.start.canvas[size] / 2 -
              (half.start.background[axis] + half.start.background[size] / 2),
          );
        assert.ok(
          centerOffset("left", "width") <= 2 &&
            centerOffset("top", "height") <= 2,
          `${engineName} ${name} zoom 0.5: canvas must stay centered`,
        );
        await small.page.close();
        console.log(engineName, name, "canvas zoom passed");
      }

      for (const { name, touch, tablet } of [
        { name: "touch", touch: true, tablet: false },
        { name: "desktop", touch: false, tablet: false },
        { name: "tablet landscape", touch: true, tablet: true },
      ]) {
        const rightPanel = !touch || tablet;
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
            `http://fixture.test/?touch=${touch}&tablet=${tablet}&resolution=${encodeURIComponent(JSON.stringify(resolution))}`,
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
            // The metrics are fixed for this fixture, so only check the
            // viewports where the layout can really be tablet landscape.
            if (
              tablet &&
              !(viewport.width >= 768 && viewport.width > viewport.height)
            ) {
              continue;
            }
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
                preview: workspace.children[1]
                  ?.getBoundingClientRect()
                  .toJSON(),
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
            if (rightPanel) {
              assert.equal(
                geometry.preview,
                undefined,
                "The preview lives in the right panel, not under the canvas",
              );
              assert.ok(
                geometry.canvas.height <= geometry.workspace.height + 1,
                `${engineName}: canvas exceeds the workspace height`,
              );
              assert.ok(
                Math.abs(
                  geometry.canvas.top +
                    geometry.canvas.height / 2 -
                    (geometry.workspace.top + geometry.workspace.height / 2),
                ) <= 2,
                `${engineName} ${name} ${JSON.stringify(viewport)}: canvas must be vertically centered in the workspace (canvas ${JSON.stringify(geometry.canvas)}, workspace ${JSON.stringify(geometry.workspace)})`,
              );
              // Whichever dimension limits the canvas, it should fill it: either
              // the width of the workspace or most of its height.
              assert.ok(
                geometry.canvas.width >= geometry.workspace.width - 2 ||
                  geometry.canvas.height >= geometry.workspace.height * 0.9,
                `${engineName}: canvas should fill the workspace`,
              );
            } else {
              assert.ok(
                geometry.canvas.height <= geometry.workspace.height / 2 + 1,
                `${engineName}: canvas exceeds half the usable editor height`,
              );
              assert.ok(
                geometry.preview.height >= geometry.workspace.height / 2 - 1,
                "Preview must retain at least half the usable editor height",
              );
            }
          }
          assert.deepEqual(errors, []);
          console.log(engineName, name, resolution, "canvas sizing passed");
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
