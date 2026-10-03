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
        ? `{...layoutEditorStore,createInitialState:()=>({...layoutEditorStore.createInitialState(),isTouchMode:touch,appWindowMetrics:tablet?{width:1133,height:744}:{width:0,height:0},projectResolution:resolution,canvasZoom:zoom,layout:{id:'layout-one',name:'Layout One'},isPreviewMounted:true})}`
        : "layoutEditorCanvasStore";
    registrations.push(
      `customElements.define(${JSON.stringify(config.schema.componentName)},createComponent({...${JSON.stringify(config)},store:${store}},deps));`,
    );
  }
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "fixture.js");
  await writeFile(
    entry,
    `${imports.join("\n")}\nexport const register=(deps,touch,resolution,tablet,zoom=1)=>{${registrations.join("\n")}};`,
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
register({__rtglI18nRuntime:{locale:'en',getMessages:()=>(${JSON.stringify(EN_I18N)})}},query.get('touch')==='true',JSON.parse(query.get('resolution')),query.get('tablet')==='true',Number(query.get('zoom')??1));
document.querySelector('#page').append(document.createElement('rvn-layout-editor'));
</script>`;
  const openEditor = async (
    browser,
    { touch, tablet, resolution, zoom = 1 },
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
      `http://fixture.test/?touch=${touch}&tablet=${tablet}&zoom=${zoom}&resolution=${encodeURIComponent(JSON.stringify(resolution))}`,
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
  // The canvas and its workspace on screen.
  const measureCanvas = (surface) =>
    surface.evaluate((canvas) => {
      const component = canvas.getRootNode().host;
      const viewport = component.parentElement.parentElement;
      return {
        canvas: canvas.getBoundingClientRect().toJSON(),
        viewport: viewport.getBoundingClientRect().toJSON(),
        touchAction: getComputedStyle(viewport).touchAction,
      };
    });
  const assertCentered = ({ canvas, viewport }, label) =>
    assert.ok(
      Math.abs(
        canvas.left + canvas.width / 2 - (viewport.left + viewport.width / 2),
      ) <= 2 &&
        Math.abs(
          canvas.top + canvas.height / 2 - (viewport.top + viewport.height / 2),
        ) <= 2,
      `${label}: canvas must be centered (${JSON.stringify({ canvas, viewport })})`,
    );
  const assertNoDrift = ({ drift }, label) =>
    assert.ok(
      Math.abs(drift.x) <= 1 && Math.abs(drift.y) <= 1,
      `${label}: the point must stay under the gesture (${JSON.stringify(drift)})`,
    );

  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const { name, touch, tablet } of [
        { name: "desktop", touch: false, tablet: false },
        { name: "tablet landscape", touch: true, tablet: true },
      ]) {
        const resolution = { width: 1920, height: 1080 };
        const label = `${engineName} ${name}`;
        const fitted = await openEditor(browser, { touch, tablet, resolution });
        const fit = await measureCanvas(fitted.surface);
        assertCentered(fit, `${label} fit`);
        // The viewport handles touch itself: the renderer canvas blocks it.
        assert.equal(fit.touchAction, "none");
        await fitted.page.close();

        for (const zoom of [0.5, 2, 4]) {
          const zoomed = await openEditor(browser, {
            touch,
            tablet,
            resolution,
            zoom,
          });
          const geometry = await measureCanvas(zoomed.surface);
          // The surface's 1px margin and borders do not scale.
          assert.ok(
            Math.abs(geometry.canvas.width - fit.canvas.width * zoom) <=
              1 + zoom,
            `${label} zoom ${zoom}: canvas must be ${zoom}x the fitted width (${geometry.canvas.width} vs ${fit.canvas.width})`,
          );
          assertCentered(geometry, `${label} zoom ${zoom}`);
          // The renderer's canvas, drawn at the project resolution and styled
          // to fill its box, must fill the surface past that size too.
          const drawing = await zoomed.surface.evaluate(
            async (surface, { width, height }) => {
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              canvas.style.cssText =
                "width: 100%; height: 100%; display: block;";
              surface.getRootNode().querySelector("#canvas").append(canvas);
              await new Promise((done) => requestAnimationFrame(done));
              return {
                canvas: canvas.getBoundingClientRect().width,
                surface: surface.clientWidth,
              };
            },
            resolution,
          );
          assert.ok(
            Math.abs(drawing.canvas - drawing.surface) <= 2,
            `${label} zoom ${zoom}: the drawing must fill the canvas (${JSON.stringify(drawing)})`,
          );
          assert.deepEqual(zoomed.errors, []);
          await zoomed.page.close();
        }

        const editor = await openEditor(browser, { touch, tablet, resolution });
        // Pinch near the canvas corner to 3x while the midpoint moves: the
        // canvas follows the fingers past the workspace edges.
        const pinch = await editor.surface.evaluate((canvas) => {
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
          // The wrapper the viewport sizes and places; the canvas surface in
          // it has borders that do not scale.
          const content = canvas.getRootNode().host.parentElement;
          const before = content.getBoundingClientRect();
          const start = { x: before.left + 40, y: before.top + 30 };
          const fraction = {
            x: (start.x - before.left) / before.width,
            y: (start.y - before.top) / before.height,
          };
          fire("pointerdown", 1, start.x - 30, start.y);
          fire("pointerdown", 2, start.x + 30, start.y);
          const end = { x: start.x + 60, y: start.y + 40 };
          fire("pointermove", 1, end.x - 90, end.y);
          fire("pointermove", 2, end.x + 90, end.y);
          const after = content.getBoundingClientRect();
          fire("pointerup", 2, end.x + 90, end.y);
          fire("pointerup", 1, end.x - 90, end.y);
          return {
            ratio: after.width / before.width,
            drift: {
              x: after.left + fraction.x * after.width - end.x,
              y: after.top + fraction.y * after.height - end.y,
            },
            reports,
          };
        });
        assert.ok(
          Math.abs(pinch.ratio - 3) < 0.03,
          `${label} pinch: canvas must triple (${pinch.ratio})`,
        );
        assertNoDrift(pinch, `${label} pinch near a corner`);
        assert.deepEqual(pinch.reports, [3]);

        // A trackpad pinch zooms around the pointer, also over the canvas.
        // The wheel leaves the canvas alone and, around it, zooms a step
        // around the pointer as on the scene map.
        const wheel = await editor.surface.evaluate((canvas) => {
          const viewport =
            canvas.getRootNode().host.parentElement.parentElement;
          const send = (target, init) => {
            const event = new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              composed: true,
              ...init,
            });
            target.dispatchEvent(event);
            return event;
          };
          const content = canvas.getRootNode().host.parentElement;
          const measure = (point, run) => {
            const before = content.getBoundingClientRect();
            const fraction = {
              x: (point.x - before.left) / before.width,
              y: (point.y - before.top) / before.height,
            };
            const event = run();
            const after = content.getBoundingClientRect();
            return {
              prevented: event.defaultPrevented,
              moved: [after.left - before.left, after.top - before.top],
              ratio: after.width / before.width,
              drift: {
                x: after.left + fraction.x * after.width - point.x,
                y: after.top + fraction.y * after.height - point.y,
              },
            };
          };
          const start = content.getBoundingClientRect();
          const point = { x: start.left + 30, y: start.top + 30 };
          const pinch = measure(point, () =>
            send(canvas, {
              ctrlKey: true,
              deltaY: Math.log(6) / 0.01,
              clientX: point.x,
              clientY: point.y,
            }),
          );
          viewport.centerContent();
          const overCanvas = measure(point, () =>
            send(canvas, { deltaX: 50, deltaY: 5000 }),
          );
          const corner = viewport.getBoundingClientRect();
          const outside = { x: corner.left + 10, y: corner.top + 10 };
          const step = measure(outside, () =>
            send(viewport, {
              deltaY: 100,
              clientX: outside.x,
              clientY: outside.y,
            }),
          );
          viewport.centerContent();
          return { pinch, overCanvas, step };
        });
        assert.ok(
          Math.abs(wheel.pinch.ratio - 1 / 6) < 0.01,
          `${label} trackpad pinch: canvas must shrink to a sixth (${wheel.pinch.ratio})`,
        );
        assertNoDrift(wheel.pinch, `${label} trackpad pinch`);
        assert.deepEqual(
          [wheel.overCanvas.prevented, ...wheel.overCanvas.moved],
          [false, 0, 0],
          `${label}: the wheel over the canvas must leave it alone`,
        );
        assert.equal(wheel.overCanvas.ratio, 1);
        assert.ok(
          wheel.step.prevented && Math.abs(wheel.step.ratio - 0.9) < 0.01,
          `${label} wheel around the canvas: one step out (${wheel.step.ratio})`,
        );
        assertNoDrift(wheel.step, `${label} wheel around the canvas`);
        assertCentered(
          await measureCanvas(editor.surface),
          `${label} fit after moving`,
        );
        if (!touch) {
          // As on the scene map, a mouse drag pans only while Space is held,
          // over the canvas too, with a grab cursor that blocks the canvas.
          const { page } = editor;
          const box = await editor.surface.boundingBox();
          const center = {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          };
          const readPan = () =>
            editor.surface.evaluate((canvas) => {
              const viewport =
                canvas.getRootNode().host.parentElement.parentElement;
              const layer = viewport.shadowRoot.querySelector("div");
              const content = canvas.getRootNode().host.parentElement;
              const rect = content.getBoundingClientRect();
              return {
                cursor:
                  getComputedStyle(layer).display === "none"
                    ? "none"
                    : getComputedStyle(layer).cursor,
                at: [rect.left, rect.top],
              };
            });
          // A focused tab must not see Space or its repeats: it would switch
          // and re-render the page on every repeat, which flickers.
          await page.locator("rtgl-tabs [data-id=edit]").click();
          await page.locator("rtgl-tabs").evaluate((tabs) => {
            window.tabClicks = 0;
            tabs.addEventListener("item-click", () => (window.tabClicks += 1));
          });
          // macOS WebKit hides the cursor after every key press the page
          // cancels, so Space and its repeats must not be canceled.
          await page.evaluate(() => {
            window.spaceCanceled = [];
            window.addEventListener(
              "keydown",
              (event) => window.spaceCanceled.push(event.defaultPrevented),
              true,
            );
          });
          await page.mouse.move(center.x, center.y);
          const start = await readPan();
          await page.keyboard.down("Space");
          await page.keyboard.down("Space");
          await page.keyboard.down("Space");
          const held = await readPan();
          assert.equal(
            await page.evaluate(() => window.tabClicks),
            0,
            `${label}: Space must not reach the focused tab`,
          );
          assert.deepEqual(
            await page.evaluate(() => {
              const path = [];
              let active = document.activeElement;
              while (active?.shadowRoot?.activeElement) {
                active = active.shadowRoot.activeElement;
                path.push(active.tagName);
              }
              return [...window.spaceCanceled, path.slice(-2).join(" > ")];
            }),
            [false, false, false, "RVN-ZOOM-VIEWPORT > DIV"],
            `${label}: Space is not canceled and focus leaves the tab`,
          );
          await page.mouse.down();
          await page.mouse.move(center.x - 120, center.y - 80, { steps: 4 });
          const dragging = await readPan();
          await page.mouse.up();
          await page.keyboard.up("Space");
          const released = await readPan();
          assert.deepEqual(
            [start.cursor, held.cursor, dragging.cursor, released.cursor],
            ["none", "grab", "grabbing", "none"],
            `${label}: Space pan cursors`,
          );
          assert.deepEqual(
            [
              Math.round(released.at[0] - start.at[0]),
              Math.round(released.at[1] - start.at[1]),
            ],
            [-120, -80],
            `${label}: Space pan`,
          );
        }
        assert.deepEqual(editor.errors, []);
        await editor.page.close();

        if (touch) {
          // Zoomed in, the canvas covers the workspace, so two fingers on it
          // pan, past every edge.
          const panning = await openEditor(browser, {
            touch,
            tablet,
            resolution,
            zoom: 2,
          });
          const pan = await panning.surface.evaluate((canvas) => {
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
            fire("pointerdown", 1, 400, 400);
            fire("pointerdown", 2, 500, 400);
            fire("pointermove", 1, 1300, 1100);
            fire("pointermove", 2, 1400, 1100);
            fire("pointerup", 2, 1400, 1100);
            fire("pointerup", 1, 1300, 1100);
            const after = canvas.getBoundingClientRect();
            return {
              pan: [after.left - before.left, after.top - before.top].map(
                Math.round,
              ),
              ratio: after.width / before.width,
            };
          });
          assert.deepEqual(pan.pan, [900, 700], `${label}: two-finger pan`);
          assert.ok(
            Math.abs(pan.ratio - 1) < 0.01,
            `${label}: a two-finger pan keeps the zoom (${pan.ratio})`,
          );
          await panning.page.close();
        }
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
