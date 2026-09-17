// Real Transforms page controls, command API, and model validation.
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

const directory = await mkdtemp(join(tmpdir(), "rvn-default-avatar-"));
try {
  const imports = [
    `import createComponent from ${JSON.stringify(resolve("node_modules/@rettangoli/fe/src/createComponent.js"))};`,
    `export {createCommandApi} from ${JSON.stringify(resolve("src/deps/services/shared/commandApi.js"))};`,
    `export {createProjectRepository} from ${JSON.stringify(resolve("src/deps/services/shared/projectRepository.js"))};`,
  ];
  const registrations = [];
  for (const [folder, name] of [
    ["components", "resizablePanel"],
    ["components", "detailView"],
    ["components", "baseFileExplorer"],
    ["components", "catalogResourcesView"],
    ["components", "mobileSheet"],
    ["pages", "transforms"],
  ]) {
    const prefix = resolve(`src/${folder}/${name}/${name}`);
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
    `${imports.join("\n")}\nexport const register=deps=>{${registrations.join("\n")}};`,
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
  const html = `<!doctype html><link rel="stylesheet" href="/theme.css"><script src="/icons.js"></script><script src="/ui.js"></script>
<style>html,body {height:100%;margin:0} rvn-transforms {display:block;height:100%}</style>
<script type="module">
import {register,createCommandApi,createProjectRepository} from '/fixture.js';
const repository=await createProjectRepository({
 projectId:'project-one',events:[],historyLoaded:true,
 store:{appendEvents:async()=>{},loadMaterializedViewCheckpoint:async()=>undefined,saveMaterializedViewCheckpoint:async()=>{},deleteMaterializedViewCheckpoint:async()=>{}}
});
const actor={userId:'user-one',clientId:'client-one'};
const session={getActor:()=>actor,submitCommand:async()=>({valid:true})};
let commandIndex=0;
const commandApi=createCommandApi({
 idGenerator:()=> 'command-'+(++commandIndex),now:()=>1,
 getCurrentProjectId:()=> 'project-one',getCurrentRepository:async()=>repository,getCachedRepository:()=>repository,
 ensureCommandSessionForProject:async()=>session,getOrCreateLocalActor:()=>actor,
 storyBasePartitionFor:()=> 'm',storyScenePartitionFor:()=> 'm',scenePartitionFor:()=> 's:test',resourceTypePartitionFor:()=> 'm'
});
for(const id of ['one','two'])await commandApi.createTransform({transformId:id,data:{type:'transform',name:'Transform '+id,x:0,y:0,scaleX:1,scaleY:1,anchorX:0,anchorY:0,rotation:0}});
const listeners=new Set();
window.projectState=repository.getState();
const projectService={
 getRepositoryState:()=>repository.getState(),
 subscribeProjectState:(fn)=>{listeners.add(fn);fn({repositoryState:repository.getState()});return()=>listeners.delete(fn)},
 setDefaultDialogueAvatarTransform:async({transformId})=>{
  const result=await commandApi.setDefaultDialogueAvatarTransform({transformId});
  if(result.valid===false)throw new Error(JSON.stringify(result));
  window.projectState=repository.getState();
  for(const fn of listeners)fn({repositoryState:repository.getState()});
  return result;
 }
};
register({projectService,appService:{getUserConfig:()=>undefined,setUserConfig:()=>{},showToast:({message})=>{throw new Error(message)}},__rtglI18nRuntime:{locale:'en',getMessages:()=>(${JSON.stringify(EN_I18N)})},uiConfig:{}});
document.body.append(document.createElement('rvn-transforms'));
window.ready=true;
</script>`;
  for (const [name, engine] of Object.entries({ webkit, chromium })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
      });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => {
        errors.push(error.message);
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
      await page.goto("http://fixture.test/");
      await page.waitForFunction(() => window.ready);
      const cards = page.locator("rvn-catalog-resources-view");
      const first = cards.locator('[data-item-id="one"]');
      const second = cards.locator('[data-item-id="two"]');
      const badge = { name: "Default Dialogue Avatar Transform", exact: true };
      const detail = page.locator("rvn-detail-view#detailView");
      const defaultField = detail.getByText(
        "Default Dialogue Avatar Transform",
        { exact: true },
      );
      await first.click();
      assert.equal(await defaultField.count(), 0);
      assert.equal(
        await page
          .getByRole("button", { name: "Set as Default", exact: true })
          .count(),
        0,
      );
      await first.click({ button: "right" });
      await page
        .getByText("Set as Default Avatar Transform", { exact: true })
        .click();
      await page.waitForFunction(
        () =>
          window.projectState.project.defaultDialogueAvatarTransformId ===
          "one",
      );
      await first.getByRole("img", badge).waitFor({ state: "visible" });
      await page
        .locator('rvn-base-file-explorer [data-item-id="one"]')
        .getByRole("img", badge)
        .waitFor({ state: "visible" });
      await defaultField.waitFor({ state: "visible" });
      await detail
        .getByText("Yes", { exact: true })
        .waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#detailHeader").getByRole("img", badge).count(),
        0,
      );
      const titleBounds = await first
        .getByText("Transform one", { exact: true })
        .boundingBox();
      const iconBounds = await first.getByRole("img", badge).boundingBox();
      assert.ok(iconBounds.x >= titleBounds.x + titleBounds.width);
      await second.click({ button: "right" });
      await page
        .getByText("Set as Default Avatar Transform", { exact: true })
        .click();
      await page.waitForFunction(
        () =>
          window.projectState.project.defaultDialogueAvatarTransformId ===
          "two",
      );
      await first.getByRole("img", badge).waitFor({ state: "detached" });
      await second.getByRole("img", badge).waitFor({ state: "visible" });
      await first.click();
      await defaultField.waitFor({ state: "detached" });
      await second.click();
      await defaultField.waitFor({ state: "visible" });
      await second.click({ button: "right" });
      await page
        .getByText("Clear Default Avatar Transform", { exact: true })
        .waitFor({ state: "visible" });
      await page.screenshot({
        path: join(tmpdir(), `rvn-default-avatar-${name}.png`),
      });
      await page
        .getByText("Clear Default Avatar Transform", { exact: true })
        .click();
      await page.waitForFunction(
        () =>
          !Object.hasOwn(
            window.projectState.project,
            "defaultDialogueAvatarTransformId",
          ),
      );
      await second.getByRole("img", badge).waitFor({ state: "detached" });
      await page
        .locator('rvn-base-file-explorer [data-item-id="two"]')
        .getByRole("img", badge)
        .waitFor({ state: "detached" });
      await defaultField.waitFor({ state: "detached" });
      assert.equal(await page.getByRole("img", badge).count(), 0);
      // The explorer's item-specific menu also works without selecting the target first.
      await page
        .locator('rvn-base-file-explorer [data-item-id="one"]')
        .click({ button: "right" });
      await page
        .getByText("Set as Default Avatar Transform", { exact: true })
        .click();
      await page.waitForFunction(
        () =>
          window.projectState.project.defaultDialogueAvatarTransformId ===
          "one",
      );
      await first.getByRole("img", badge).waitFor({ state: "visible" });
      assert.deepEqual(errors, []);
      console.log(
        `${name}: right-click set, replace and clear; conditional default detail field and list indicators passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
