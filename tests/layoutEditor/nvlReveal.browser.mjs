// Run with node tests/layoutEditor/nvlReveal.browser.mjs.
// Uses the client projection and published engine/renderer with real next-line clicks.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import {
  createNvlDialogueProject,
  NVL_LINE_TEXT,
} from "../support/nvlDialogue.js";

const assets = new Map([
  [
    "/engine.js",
    await readFile("node_modules/route-engine-js/dist/RouteEngine.js", "utf8"),
  ],
  [
    "/graphics.js",
    await readFile("node_modules/route-graphics/dist/RouteGraphics.js", "utf8"),
  ],
]);

for (const [browserName, browserType] of Object.entries({ chromium, webkit })) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const revealEffect of ["typewriter", "softWipe"]) {
      const page = await browser.newPage({
        viewport: { width: 820, height: 580 },
      });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const project = createNvlDialogueProject(revealEffect);
      const html = `<!doctype html><body style="margin:0;background:#151515;color:white"><div id="canvas"></div><button id="next">Next line</button>
<script type="module">
import createRouteEngine, {createEffectsHandler} from '/engine.js';
import createRouteGraphics, {containerPlugin,textRevealingPlugin} from '/graphics.js';
const graphics=createRouteGraphics();
let engine;
const callbacks=new Set();
const ticker={add:callback=>callbacks.add(callback),remove:callback=>callbacks.delete(callback)};
let previousTime=performance.now();
const tick=time=>{const deltaMS=time-previousTime;previousTime=time;[...callbacks].forEach(callback=>callback({deltaMS}));requestAnimationFrame(tick);};
requestAnimationFrame(tick);
const effects=createEffectsHandler({getEngine:()=>engine,routeGraphics:graphics,ticker});
await graphics.init({width:800,height:500,backgroundColor:0x151515,rendererPreference:'webgl',plugins:{elements:[containerPlugin,textRevealingPlugin],audio:[]},eventHandler:effects.createRouteGraphicsEventHandler()});
document.querySelector('#canvas').append(graphics.canvas);
engine=createRouteEngine({handlePendingEffects:effects});
engine.init({initialState:{projectData:${JSON.stringify(project)}}});
document.querySelector('#next').addEventListener('click',()=>engine.handleActions({nextLine:{}}));
const collect=nodes=>nodes.flatMap(node=>node.type==='text-revealing'?[node]:collect(node.children??[]));
window.readLines=()=>collect(engine.selectRenderState().elements).map(element=>{
  let renderedText='', masks=0;
  const visit=node=>{
    if(!node) return;
    if(typeof node.text==='string') renderedText+=node.text;
    if(node.mask) masks++;
    (node.children??[]).forEach(visit);
  };
  visit(graphics.findElementByLabel(element.id));
  return {id:element.id,effect:element.revealEffect??'typewriter',renderedText,masks};
});
window.fixtureReady=true;
</script>`;
      await page.route("http://fixture.test/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({
          contentType: path.endsWith(".js") ? "text/javascript" : "text/html",
          body: assets.get(path) ?? html,
        });
      });
      await page.goto("http://fixture.test/");
      await page.waitForFunction(() => window.fixtureReady);
      let previousPixels;
      for (let index = 0; index < NVL_LINE_TEXT.length; index += 1) {
        const count = index === 3 ? 1 : index + 1;
        await page.waitForFunction((count) => {
          const lines = window.readLines();
          return (
            lines.length === count &&
            (lines.at(-1).renderedText.length > 0 || lines.at(-1).masks > 0)
          );
        }, count);
        const revealing = await page.evaluate(() => window.readLines());
        assert.deepEqual(
          revealing.map((line) => line.effect),
          Array.from({ length: count }, (_, i) =>
            i === count - 1 ? revealEffect : "none",
          ),
        );
        for (let prior = 0; prior < count - 1; prior++) {
          assert.equal(revealing[prior].renderedText, NVL_LINE_TEXT[prior]);
          assert.equal(revealing[prior].masks, 0);
        }
        if (revealEffect === "typewriter")
          assert.ok(
            revealing.at(-1).renderedText.length < NVL_LINE_TEXT[index].length,
          );
        else assert.ok(revealing.at(-1).masks > 0);
        if (index > 0 && index < 3) {
          assert.deepEqual(
            await page.screenshot({
              clip: { x: 0, y: 0, width: 800, height: index * 100 },
            }),
            previousPixels,
          );
        }
        await page.getByRole("button", { name: "Next line" }).click();
        await page.waitForFunction((expected) => {
          const lines = window.readLines();
          return (
            lines.at(-1).effect === "none" &&
            lines.at(-1).renderedText === expected
          );
        }, NVL_LINE_TEXT[index]);
        previousPixels = await page.screenshot({
          clip: { x: 0, y: 0, width: 800, height: count * 100 },
        });
        if (index < NVL_LINE_TEXT.length - 1)
          await page.getByRole("button", { name: "Next line" }).click();
      }
      assert.deepEqual(errors, []);
      console.log(
        `${browserName} ${revealEffect}: only newest line reveals; previous pixels stay unchanged; page clear starts fresh`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
