// Run against watch:ios. Exercise real pointer propagation across a shadow root
// and the scene runtime's transition fallback without opening user projects.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const source = `/@fs${process.cwd()}`;
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<button id="outside" style="width:200px;height:60px">Outside</button><div id="host"></div>
<script type="module">
import { Subject } from '${source}/node_modules/rxjs/dist/esm/index.js';
import { mountSceneEditorSubscriptions } from '${source}/src/internal/ui/sceneEditor/runtime.js';
const root = document.querySelector('#host').attachShadow({mode:'open'});
root.innerHTML = '<canvas width="300" height="200" style="background:#888;touch-action:none"></canvas>';
const canvasRoot = root.querySelector('canvas');
const subject = new Subject();
let selected = 'line-1';
const lines = ['line-1','line-2','line-3'];
window.readSelected = () => selected;
window.cleanup = mountSceneEditorSubscriptions({
  subject, render() {}, refs: {},
  graphicsService: {initRouteEngine(){},engineSelectPresentationState:()=>({}),engineSelectRenderState:()=>undefined},
  store: {
    selectSceneId:()=> 'scene-1',selectSelectedSectionId:()=> 'section-1',
    selectSelectedLineId:()=>selected,
    selectSelectedLine:()=>({actions:{screen:{animations:{resourceId:'transition-1'}}}}),
    selectNextLineId:({lineId})=>lines[lines.indexOf(lineId)+1],
    selectPreviousLineId:({lineId})=>lines[lines.indexOf(lineId)-1],
    setSelectedLineId:({selectedLineId})=>selected=selectedLineId,
    selectScene:()=>({sections:[{id:'section-1',lines:lines.map(id=>({id}))}]}),
    selectProjectData:()=>({}),selectIsMuted:()=>true,setPresentationState(){}
  }
});
subject.next({action:'sceneEditor.canvasMounted',payload:{canvasRoot}});
window.fixtureReady = true;
</script>`;

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/canvas-activation-check", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto(`${origin}/canvas-activation-check`);
    await page.waitForFunction(() => window.fixtureReady);
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const unchanged = async () => {
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.readSelected()), "line-1");
    };
    await page.mouse.move(30, 30);
    await page.mouse.down();
    await page.mouse.move(x, y);
    await page.mouse.up();
    await unchanged();

    await canvas.evaluate((canvas) => {
      const pointer = {
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        bubbles: true,
        composed: true,
      };
      for (const type of ["pointerdown", "pointercancel", "pointerup"])
        canvas.dispatchEvent(new PointerEvent(type, pointer));
    });
    await unchanged();

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(30, 30);
    await page.mouse.up();
    // The earlier press was released outside and cannot authorize this release.
    await canvas.evaluate((canvas) =>
      canvas.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          bubbles: true,
          composed: true,
        }),
      ),
    );
    await unchanged();

    await page.mouse.click(x, y);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.readSelected()), "line-2");
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.readSelected()), "line-3");
    await page.evaluate(() => window.cleanup());
    assert.deepEqual(errors, []);
    console.log(
      `${name}: outside press/release, cancellation, outside release, mouse click and touch tap passed`,
    );
  } finally {
    await browser.close();
  }
}
