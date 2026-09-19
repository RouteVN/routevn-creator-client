// Real layout inspector -> Actions -> Click -> command dialog, in an isolated
// browser fixture. No project storage or running development server is needed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { chromium, webkit } from "playwright";
import jemplParse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";
import { EN_I18N } from "../support/i18n.js";

const directory = await mkdtemp(join(tmpdir(), "rvn-layout-actions-"));
try {
  const imports = [
    `import createComponent from ${JSON.stringify(resolve("node_modules/@rettangoli/fe/src/createComponent.js"))};`,
    `export { createGlobalUI } from ${JSON.stringify(resolve("node_modules/@rettangoli/ui/src/index.js"))};`,
    `export { Subject } from ${JSON.stringify(resolve("node_modules/rxjs/dist/esm/index.js"))};`,
  ];
  const registrations = [];
  for (const name of [
    "layoutEditPanel",
    "systemActions",
    "systemActionsDialogSurface",
    "commandLineActions",
    "commandLineNextLine",
    "commandLineSectionTransition",
    "commandLineResetStoryAtSection",
  ]) {
    const prefix = resolve(`src/components/${name}/${name}`);
    const config = {};
    for (const part of ["view", "schema", "constants"]) {
      if (existsSync(`${prefix}.${part}.yaml`))
        config[part] = yaml.load(
          await readFile(`${prefix}.${part}.yaml`, "utf8"),
        );
    }
    config.view.template = jemplParse(config.view.template);
    const modules = [];
    for (const part of ["store", "handlers", "methods"]) {
      if (!existsSync(`${prefix}.${part}.js`)) continue;
      imports.push(
        `import * as ${name}_${part} from ${JSON.stringify(`${prefix}.${part}.js`)};`,
      );
      modules.push(`${part}: ${name}_${part}`);
    }
    registrations.push(
      `customElements.define(${JSON.stringify(config.schema.componentName)},createComponent({...${JSON.stringify(config)},${modules.join(",")}},deps));`,
    );
  }
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "fixture.js");
  await writeFile(
    entry,
    `${imports.join("\n")}\nexport const register = deps => {${registrations.join("\n")}};`,
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
    ["/icons.js", await readFile("static/public/rtgl-icons.js", "utf8")],
    ["/theme.css", await readFile("static/public/theme.css", "utf8")],
  ]);
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme.css"><script src="/icons.js"></script><script src="/ui.js"></script>
<body class="dark"><div id="inspector" style="width:300px;height:100vh;overflow:auto;margin-left:auto"></div><rtgl-global-ui></rtgl-global-ui>
<script type="module">
import {register,createGlobalUI,Subject} from '/fixture.js';
const repositoryState={scenes:{items:{scene:{id:'scene',type:'scene',name:'Scene One',sections:{items:{section:{id:'section',type:'section',name:'Section One'}},tree:[{id:'section'}]}}},tree:[{id:'scene'}]}};
register({
 subject:new Subject(),
 uiConfig:{id:new URLSearchParams(location.search).get('mode')},
 appService:{...createGlobalUI(document.querySelector('rtgl-global-ui')),getUserConfig:()=>false},
 projectService:{ensureRepository:async()=>{},getRepositoryState:()=>repositoryState},
 __rtglI18nRuntime:{locale:'en',getMessages:()=>(${JSON.stringify(EN_I18N)})}
});
const panel=document.createElement('rvn-layout-edit-panel');
panel.itemType='rect';panel.mode='layout';panel.layoutType='main-menu';
panel.values={id:'button',width:300,height:60,x:0,y:0,opacity:1,rotation:0,scaleX:1,scaleY:1};
window.updates=[];panel.addEventListener('update',event=>window.updates.push(event.detail));
document.querySelector('#inspector').append(panel);
</script>`;
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of [
        { name: "phone", mode: "touch", width: 360, height: 764 },
        { name: "landscape", mode: "touch", width: 764, height: 360 },
        { name: "tablet", mode: "touch", width: 820, height: 1180 },
        { name: "desktop", mode: "mouse", width: 1280, height: 720 },
      ]) {
        const page = await browser.newPage({
          viewport: { width: scenario.width, height: scenario.height },
          hasTouch: scenario.mode === "touch",
        });
        page.setDefaultTimeout(10000);
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
        await page.goto(`http://fixture.test/?mode=${scenario.mode}`);
        for (const action of [
          "Next Line",
          "Section Transition",
          "Reset Story At Section",
        ]) {
          assert.equal(
            await page
              .locator("rvn-system-actions-dialog-surface rtgl-dialog")
              .count(),
            0,
            "Closed action dialog must not cover the editor",
          );
          await page.locator('rtgl-button[data-id="actions"]').click();
          await page
            .getByText("Click", { exact: true })
            .filter({ visible: true })
            .click();
          await page
            .locator("rvn-command-line-actions")
            .getByText(action, { exact: true })
            .click();
          const submit = page.locator("rvn-system-actions #submitButton");
          await submit.waitFor({ state: "visible" });
          // Opening a form may focus its footer and scroll the outer dialog.
          // Return to the top as a user would to read the form header.
          await page
            .locator("rvn-system-actions-dialog-surface rtgl-dialog")
            .evaluate((el) => {
              el.shadowRoot.querySelector("dialog").scrollTop = 0;
            });
          await page.waitForTimeout(200);
          const box = await submit.boundingBox();
          const panelBox = await page
            .locator("rvn-system-actions-dialog-surface .commandPanel")
            .boundingBox();
          console.log(engineName, scenario.name, action, {
            buttonBottom: box.y + box.height,
            panelBottom: panelBox.y + panelBox.height,
            viewport: scenario.height,
          });
          assert.ok(
            panelBox.y >= 16 &&
              panelBox.y + panelBox.height <= scenario.height - 16,
            `${engineName} ${scenario.name}: panel must fit between viewport margins`,
          );
          assert.ok(
            box.y >= 0 && box.y + box.height <= scenario.height,
            `${engineName} ${scenario.name}: ${action} Submit is outside viewport`,
          );
          assert.ok(
            box.y + box.height <= panelBox.y + panelBox.height,
            `${action} Submit is outside panel`,
          );
          if (scenario.mode === "touch") {
            assert.ok(
              panelBox.y <= 24 &&
                Math.abs(panelBox.height - (scenario.height - 48 - 64) / 2) <=
                  1,
              `${scenario.name}: mobile action dialog must use half the height remaining after the navbar and tabs`,
            );
          }
          const scroller = page.locator(
            'rvn-system-actions-dialog-surface rtgl-view[sv][h="1fg"]',
          );
          await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
          const afterScroll = await submit.boundingBox();
          assert.equal(
            afterScroll.y,
            box.y,
            `${action} Submit moved when scrolling the form`,
          );
          await submit.click({ trial: true });
          if (action === "Next Line") {
            await submit.click();
            await page
              .locator("rvn-system-actions-dialog-surface rtgl-dialog[open]")
              .waitFor({ state: "detached" });
          } else if (action === "Section Transition") {
            await page.keyboard.press("Escape");
          } else {
            await page.mouse.click(2, scenario.height / 2);
          }
          await page
            .locator("rvn-system-actions-dialog-surface rtgl-dialog[open]")
            .waitFor({ state: "detached" });
        }
        assert.equal(
          await page
            .locator("rvn-system-actions-dialog-surface rtgl-dialog")
            .count(),
          0,
          "Dismissed action dialog must not cover the editor",
        );
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
