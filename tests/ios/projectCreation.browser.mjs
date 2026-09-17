import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { chromium, webkit } from "playwright";
import parse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";
import { EN_I18N } from "../support/i18n.js";

// Real dialog, form input events, store and handlers; native filesystem behavior
// is covered by projectStoragePathsNative.swift and physical iPhone validation.
const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const source = `/@fs${process.cwd()}`;
const folder = "src/components/projectCreateDialog/projectCreateDialog";
const view = yaml.load(await readFile(`${folder}.view.yaml`, "utf8"));
view.template = parse(view.template);
const schema = yaml.load(await readFile(`${folder}.schema.yaml`, "utf8"));
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/public/theme.css"><style>body{margin:0}</style>
<script src="/public/@rettangoli/ui@1.22.2/dist/rettangoli-iife-ui.min.js"></script>
<script type="module">
import {createComponent} from '${source}/node_modules/@rettangoli/fe/src/index.js';
import * as store from '${source}/${folder}.store.js';
import * as handlers from '${source}/${folder}.handlers.js';
import * as methods from '${source}/${folder}.methods.js';
const appService={async previewNewProjectLocation({name}){
  await new Promise(resolve=>setTimeout(resolve,150));
  const folderName=name==='Project/One'?'Project-One (2)':name||'Untitled Project';
  return {folderName,displayPath:'On My iPhone / RouteVN Projects / '+folderName};
}};
const deps={appService,__rtglI18nRuntime:{locale:'en',getMessages:()=>(${JSON.stringify(EN_I18N)})}};
customElements.define('rvn-project-create-dialog',createComponent({schema:${JSON.stringify(schema)},view:${JSON.stringify(view)},store,handlers,methods},deps));
window.mount=platform=>{
  document.querySelector('#creationShell')?.remove();
  const shell=document.createElement('rtgl-dialog');shell.id='creationShell';shell.setAttribute('s','md');shell.setAttribute('md-layout','fixed-top');
  const body=document.createElement('rtgl-view');body.slot='content';body.setAttribute('d','v');body.setAttribute('w','f');body.setAttribute('h','f');body.setAttribute('overflow','hidden');
  const dialog=document.createElement('rvn-project-create-dialog');
  dialog.platform=platform;dialog.defaultValues={};
  dialog.addEventListener('submit',event=>window.submitted=event.detail.values);
  body.append(dialog);shell.append(body);document.body.append(shell);shell.setAttribute('open','');
};
window.fixtureReady=true;
</script>`;

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/project-creation-check", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto(`${origin}/project-creation-check`);
    await page
      .waitForFunction(() => window.fixtureReady, undefined, { timeout: 5000 })
      .catch((error) => {
        throw new Error(JSON.stringify(errors), { cause: error });
      });
    for (const platform of ["ios", "android", "web", "tauri"]) {
      await page.evaluate((value) => window.mount(value), platform);
      const name = page.locator('rtgl-input[data-field-name="name"] input');
      await name.waitFor({ state: "visible" });
      const box = await name.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      assert.ok(
        await name.evaluate(
          (input) => input.getRootNode().activeElement === input,
        ),
      );
      const destination = page.locator("#iosProjectLocation");
      if (platform === "ios") {
        await destination
          .getByText("Untitled Project", { exact: true })
          .waitFor();
        await destination.evaluate((element) => {
          const icon = element.querySelector('rtgl-svg[svg="folder"]');
          const initialHeight = element.getBoundingClientRect().height;
          window.locationPreviewFlickers = [];
          window.locationPreviewObserver = new MutationObserver(() => {
            const height = element.getBoundingClientRect().height;
            if (
              !element.contains(icon) ||
              Math.abs(height - initialHeight) > 1
            ) {
              window.locationPreviewFlickers.push({
                text: element.textContent,
                height,
              });
            }
          });
          window.locationPreviewObserver.observe(element, {
            subtree: true,
            childList: true,
            characterData: true,
          });
        });
        await name.pressSequentially("Project/One", { delay: 20 });
        await destination
          .getByText("Project-One (2)", { exact: true })
          .waitFor();
        assert.ok(await destination.isVisible());
        assert.equal(await name.inputValue(), "Project/One");
        assert.ok(
          await name.evaluate(
            (input) => input.getRootNode().activeElement === input,
          ),
        );
        const geometry = await destination.evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          scrollWidth: element.scrollWidth,
        }));
        assert.ok(
          geometry.scrollWidth <= geometry.width + 1,
          JSON.stringify(geometry),
        );
        await name.fill("Project Two");
        await destination.getByText("Project Two", { exact: true }).waitFor();
        const flickers = await page.evaluate(() => {
          window.locationPreviewObserver.disconnect();
          return window.locationPreviewFlickers;
        });
        assert.deepEqual(
          flickers,
          [],
          "The destination must stay visible while typing",
        );
        await page.locator("rtgl-button").filter({ hasText: "Submit" }).click();
        await page.waitForFunction(
          () => window.submitted?.name === "Project Two",
        );
      } else {
        await name.fill("Project/One");
        assert.equal(await destination.count(), 0);
      }
      assert.equal(
        await page.locator("#browseButton").count(),
        platform === "tauri" ? 1 : 0,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: live iOS destination, name input focus, submit and other-platform picker behavior passed`,
    );
  } finally {
    await browser.close();
  }
}
