// Run with node tests/layoutEditor/dialogueAvatar.browser.mjs.
// Real preview, image picker, and canvas in an isolated fixture; no project data.
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

const directory = await mkdtemp(join(tmpdir(), "rvn-dialogue-avatar-"));
try {
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "fixture.js");
  const imports = [
    `import createComponent from ${JSON.stringify(resolve("node_modules/@rettangoli/fe/src/createComponent.js"))};`,
    `export { createLayoutEditorAssetReferences } from ${JSON.stringify(resolve("src/components/layoutEditorCanvas/support/layoutEditorCanvasRender.js"))};`,
  ];
  const registrations = [];
  for (const name of [
    "fileImage",
    "spritesheetPreview",
    "baseFileExplorer",
    "imageSelector",
    "layoutEditorPreview",
  ]) {
    const prefix = resolve(`src/components/${name}/${name}`);
    const config = {};
    for (const part of ["view", "schema", "constants"]) {
      if (existsSync(`${prefix}.${part}.yaml`)) {
        config[part] = yaml.load(
          await readFile(`${prefix}.${part}.yaml`, "utf8"),
        );
      }
    }
    config.view.template = jemplParse(config.view.template);
    const modules = [];
    for (const part of ["store", "handlers", "methods"]) {
      if (existsSync(`${prefix}.${part}.js`)) {
        imports.push(
          `import * as ${name}_${part} from ${JSON.stringify(`${prefix}.${part}.js`)};`,
        );
        modules.push(`${part}: ${name}_${part}`);
      }
    }
    registrations.push(
      `customElements.define(${JSON.stringify(config.schema.componentName)},createComponent({...${JSON.stringify(config)},${modules.join(",")}},deps));`,
    );
  }
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
    ["/icons.js", await readFile("static/public/rtgl-icons.js", "utf8")],
    [
      "/ui.js",
      await readFile(
        "node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js",
        "utf8",
      ),
    ],
    [
      "/graphics.js",
      await readFile(
        "node_modules/route-graphics/dist/RouteGraphics.js",
        "utf8",
      ),
    ],
    ["/theme.css", await readFile("static/public/theme.css", "utf8")],
  ]);
  const html = `<!doctype html><link rel="stylesheet" href="/theme.css"><script src="/icons.js"></script><script src="/ui.js"></script>
<div style="display:flex;gap:20px;padding:20px"><div id="form" style="width:440px;flex-shrink:0"></div><div id="preview"></div></div>
<script type="module">
import {register,createLayoutEditorAssetReferences} from '/fixture.js';
import createRouteGraphics,{createAssetBufferManager,containerPlugin,spritePlugin,spritesheetAnimationPlugin,rectPlugin} from '/graphics.js';
const i18n=${JSON.stringify(EN_I18N)};
const layoutState={id:'layout-1',layoutType:'dialogue-adv',elements:{items:{panel:{id:'panel',type:'rect',x:0,y:160,width:400,height:100,fill:'#404050'}},tree:[{id:'panel'}]}};
const repositoryState={
 characters:{items:{'character-1':{id:'character-1',type:'character',name:'Character One',fileId:'sprite-file',sprites:{items:{
  'sprite-1':{id:'sprite-1',type:'image',name:'Smile',fileId:'sprite-file',width:80,height:100},
  faces:{id:'faces',type:'folder',name:'Faces'},
  'sheet-1':{id:'sheet-1',type:'spritesheet',name:'Blink',fileId:'sheet-file',width:160,height:50,jsonData:{frames:{blink:{frame:{x:0,y:0,w:80,h:100},sourceSize:{w:80,h:100},spriteSourceSize:{x:0,y:0,w:80,h:100}}},meta:{size:{w:80,h:100},scale:'1'}},animations:{idle:{frames:['blink'],fps:12}}}
 },tree:[{id:'sprite-1'},{id:'faces',children:[{id:'sheet-1'}]}]}},
 'character-2':{id:'character-2',type:'character',name:'Character Two',sprites:{items:{'sprite-2':{id:'sprite-2',type:'image',name:'Wave',fileId:'sprite-file',width:80,height:100}},tree:[{id:'sprite-2'}]}},
 cast:{id:'cast',type:'folder',name:'Cast'},'character-3':{id:'character-3',type:'character',name:'Character Three'}
 },tree:[{id:'character-1'},{id:'character-2'},{id:'cast',children:[{id:'character-3'}]}]},
 transforms:{items:{portraits:{id:'portraits',type:'folder',name:'Portraits'},'transform-1':{id:'transform-1',type:'transform',name:'Right',x:240,y:180,anchorX:0.5,anchorY:1,scaleX:1.5,scaleY:1.5}},tree:[{id:'portraits',children:[{id:'transform-1'}]}]},
 images:{items:{backgrounds:{id:'backgrounds',type:'folder',name:'Backgrounds'},'image-1':{id:'image-1',type:'image',name:'Background One',fileId:'background-file',width:80,height:100}},tree:[{id:'backgrounds',children:[{id:'image-1'}]}]}
};
const image=document.createElement('canvas');image.width=80;image.height=100;
const paint=image.getContext('2d');paint.fillStyle='#40b883';paint.fillRect(0,0,80,100);
const imageUrl=image.toDataURL();
const graphics=createRouteGraphics();
await graphics.init({width:400,height:280,backgroundColor:0x111122,rendererPreference:'webgl',plugins:{elements:[containerPlugin,spritePlugin,spritesheetAnimationPlugin,rectPlugin],audio:[]},eventHandler(){}});
document.querySelector('#preview').append(graphics.canvas);
const manager=createAssetBufferManager();await manager.load({'sprite-file':{url:imageUrl,type:'image/png'},'background-file':{url:imageUrl,type:'image/png'},'sheet-file':{url:imageUrl,type:'image/png'}});await graphics.loadAssets(manager.getBufferMap());
register({projectService:{ensureRepository:async()=>{},getRepositoryState:()=>repositoryState,getFileContent:async()=>({url:imageUrl})},__rtglI18nRuntime:{locale:'en',getMessages:()=>i18n},uiConfig:{}});
const preview=document.createElement('rvn-layout-editor-preview');preview.layoutState=layoutState;
preview.addEventListener('preview-data-change',event=>{
 window.previewData=event.detail.previewData;
 const result=createLayoutEditorAssetReferences({layoutState,repositoryState,previewData:window.previewData});
 window.renderedElements=result.renderedElements;
 graphics.render({elements:result.renderedElements,animations:[],audio:[]});
});
document.querySelector('#form').append(preview);
window.reopen=()=>{preview.initialPreviewData=structuredClone(window.previewData);};
window.avatarBounds=()=>{
 const element=graphics.findElementByLabel('layout-editor-preview-character-sprite-base');
 if(!element)return;
 const {x,y,width,height}=element.getBounds();
 return {x,y,width,height};
};
window.ready=true;
</script>`;
  for (const [name, engine] of Object.entries({ webkit, chromium })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1100, height: 1100 },
      });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("http://fixture.test/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        let contentType = "text/html";
        if (path.endsWith(".js")) contentType = "text/javascript";
        if (path.endsWith(".css")) contentType = "text/css";
        return route.fulfill({ contentType, body: assets.get(path) ?? html });
      });
      await page.goto("http://fixture.test/");
      await page.waitForFunction(() => window.ready);
      const avatar = page.getByText("Character Avatar", { exact: true });
      const transform = page.getByText("Transform", { exact: true });
      const customSpeaker = page.getByText("Custom Speaker Name", {
        exact: true,
      });
      await avatar.waitFor({ state: "visible" });
      const avatarBox = await avatar.boundingBox();
      const transformBox = await transform.boundingBox();
      const speakerBox = await customSpeaker.boundingBox();
      assert.ok(avatarBox.x < transformBox.x);
      assert.ok(Math.abs(avatarBox.y - transformBox.y) < 2);
      assert.ok(avatarBox.y > speakerBox.y);
      await page
        .getByRole("button", { name: "Select sprite", exact: true })
        .click();
      const characters = page.getByRole("listbox", {
        name: "Characters",
        exact: true,
      });
      await characters.waitFor({ state: "visible" });
      assert.equal(
        await page.getByRole("button", { name: "OK", exact: true }).count(),
        0,
      );
      assert.equal(
        await characters
          .getByRole("option", { name: "Smile", exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: join(tmpdir(), `rvn-dialogue-characters-${name}.png`),
      });
      await characters
        .getByRole("option", { name: "Character One", exact: true })
        .press("Enter");
      const picker = page.getByRole("listbox", { name: "Character Sprites" });
      await picker.waitFor({ state: "visible" });
      assert.equal(
        await picker.getByRole("option", { name: "Wave", exact: true }).count(),
        0,
      );
      await picker
        .getByText("Character One > Faces", { exact: true })
        .waitFor({ state: "visible" });
      await picker
        .getByRole("option", { name: "Blink", exact: true })
        .locator("canvas")
        .waitFor({ state: "visible" });
      await page.screenshot({
        path: join(tmpdir(), `rvn-dialogue-sprites-${name}.png`),
      });
      await picker.getByRole("option", { name: "Smile", exact: true }).click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.waitForFunction(
        () =>
          window.previewData?.dialogue.character.sprite?.items[0]
            ?.resourceId === "sprite-1",
      );
      await page.getByText("Select transform", { exact: true }).click();
      const section = page.getByText("Portraits", { exact: true });
      await section.waitFor({ state: "visible" });
      assert.equal(
        await section.evaluate((el) =>
          Boolean(el.closest('[role="option"],button')),
        ),
        false,
      );
      await page.getByText("Right", { exact: true }).click();
      await page.waitForFunction(
        () => window.renderedElements.at(-1)?.x === 240,
      );
      assert.deepEqual(
        await page.evaluate(() => window.previewData.dialogue.character.sprite),
        {
          transformId: "transform-1",
          items: [{ id: "base", resourceId: "sprite-1" }],
        },
      );
      await page.evaluate(() => window.reopen());
      await page
        .getByRole("button", { name: "Right", exact: true })
        .waitFor({ state: "visible" });
      const avatarPicker = page.getByRole("button", {
        name: "Select sprite",
        exact: true,
      });
      await avatarPicker.locator("img").waitFor({ state: "visible" });
      await avatarPicker.click();
      await characters.waitFor({ state: "visible" });
      assert.equal(
        await characters
          .getByRole("option", { name: "Character One", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await characters
        .getByRole("option", { name: "Character One", exact: true })
        .click();
      assert.equal(
        await picker
          .getByRole("option", { name: "Smile", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      const backToCharacters = page.getByRole("button", {
        name: "Characters",
        exact: true,
      });
      await backToCharacters.press("Enter");
      await characters.getByRole("option", { name: /Character Two$/ }).click();
      await picker
        .getByRole("option", { name: "Wave", exact: true })
        .waitFor({ state: "visible" });
      assert.equal(
        await picker
          .getByRole("option", { name: "Smile", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "OK", exact: true })
          .isDisabled(),
        true,
      );
      await picker.getByRole("option", { name: "Wave", exact: true }).click();
      await backToCharacters.click();
      await characters
        .getByRole("option", { name: /Character Three$/ })
        .click();
      await picker
        .getByText(EN_I18N.resourcePages.selectorEmptyMessage, { exact: true })
        .waitFor({ state: "visible" });
      assert.equal(
        await page
          .getByRole("button", { name: "OK", exact: true })
          .isDisabled(),
        true,
      );
      await backToCharacters.press("Enter");
      await characters
        .getByRole("option", { name: "Character One", exact: true })
        .click();
      await picker.getByRole("option", { name: "Blink", exact: true }).click();
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(
          () =>
            window.previewData.dialogue.character.sprite.items[0].resourceId,
        ),
        "sprite-1",
      );
      await avatarPicker.click();
      await characters.getByRole("option", { name: /Character Two$/ }).click();
      await picker.getByRole("option", { name: "Wave", exact: true }).click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.waitForFunction(
        () =>
          window.previewData.dialogue.character.sprite.items[0].resourceId ===
          "sprite-2",
      );
      await page.getByText("Select image", { exact: true }).click();
      const images = page.getByRole("listbox", { name: "Images", exact: true });
      await images
        .getByRole("option", { name: "Background One", exact: true })
        .click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.waitForFunction(
        () => window.previewData.backgroundImageId === "image-1",
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.previewData.dialogue.character.sprite.items[0].resourceId,
        ),
        "sprite-2",
      );
      await page.screenshot({
        path: join(tmpdir(), `rvn-dialogue-avatar-${name}.png`),
      });
      assert.equal(
        await page.getByRole("button", { name: "Remove", exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .locator('[slot="dialogueCharacterAvatar"]')
          .getByText("Wave", { exact: true })
          .count(),
        0,
      );
      await avatarPicker.click({ button: "right" });
      await page.getByText("Remove", { exact: true }).click();
      await page.waitForFunction(
        () => window.previewData.dialogue.character.sprite.items.length === 0,
      );
      assert.equal(
        await page.evaluate(
          () => window.previewData.dialogue.character.sprite.transformId,
        ),
        "transform-1",
      );
      assert.equal(
        await page.evaluate(() => window.previewData.backgroundImageId),
        "image-1",
      );
      await avatarPicker.click();
      await characters
        .getByRole("option", { name: "Character One", exact: true })
        .click();
      await picker.getByRole("option", { name: "Blink", exact: true }).click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.waitForFunction(
        () =>
          window.renderedElements.at(-1)?.children?.[0]?.type ===
          "spritesheet-animation",
      );
      assert.deepEqual(
        await page.evaluate(() => {
          const { width, height } = window.renderedElements.at(-1).children[0];
          return { width, height };
        }),
        { width: 160, height: 50 },
      );
      await page.waitForFunction(() => window.avatarBounds()?.width === 240);
      assert.deepEqual(await page.evaluate(() => window.avatarBounds()), {
        x: 120,
        y: 105,
        width: 240,
        height: 75,
      });
      assert.deepEqual(errors, []);
      console.log(
        `${name}: character-first avatar picker, character switching, animated previews, transform sections, canvas, restore, cancel, background selection, clearing, and authored spritesheet dimensions with anchors passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
