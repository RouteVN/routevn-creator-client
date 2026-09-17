import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

// Run with watch:ios serving this checkout on port 3004. The fixture uses real
// Lexical editors and toolbar handlers; only the UIKit caret bridge is emulated.
const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const source = `/@fs${process.cwd()}`;
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0}#scroll{position:fixed;top:80px;bottom:0;width:390px;overflow-y:auto}#host{padding-bottom:600px}</style>
<div id="scroll"><div id="host"></div></div><script type="module">
import {LexicalSceneDocumentEditorElement} from '${source}/src/primitives/lexicalSceneDocumentEditor.js';
import {handleToolbarItemPointerDown,handleToolbarItemPointerUp} from '${source}/src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.handlers.js';
import {installIOSSceneEditorKeyboard} from '${source}/src/deps/clients/ios/sceneEditorKeyboard.js';
customElements.define('rvn-lexical-scene-document-editor',LexicalSceneDocumentEditorElement);
const host=document.querySelector('#host');
const shadow=new URLSearchParams(location.search).has('light-dom')?host:host.attachShadow({mode:'open'});
const realSelection=typeof shadow.getSelection==='function'?shadow.getSelection.bind(shadow):window.getSelection.bind(window);
const owners=Array.from({length:2},(_,section)=>{
  const owner=document.createElement('rvn-lexical-scene-document-editor');
  shadow.append(owner);
  owner.lines=Array.from({length:6},(_,line)=>({id:'section-'+section+'-line-'+line,actions:{dialogue:{content:[{text:'Example dialogue line '+line}]}}}));
  owner.hasPreviousSectionLine=section>0;owner.hasNextSectionLine=section<1;
  owner.selectionActive=false;
  return owner;
});
const activate=(section,line,offset=2)=>{
  owners.forEach((owner,index)=>owner.selectionActive=index===section);
  const owner=owners[section];
  owner.selectedLineId=owner.state.lines[line].id;
  owner.focusLine({lineId:owner.selectedLineId,cursorPosition:offset});
};
owners.forEach((owner,section)=>owner.addEventListener('selected-line-changed',event=>{
  const {isBoundaryNavigation,navigationDirection}=event.detail;
  if(!isBoundaryNavigation)return;
  const next=section+(navigationDirection==='down'?1:-1);
  if(next<0||next>=owners.length)return;
  requestAnimationFrame(()=>activate(next,navigationDirection==='down'?0:5,0));
}));
const viewport=new EventTarget();Object.assign(viewport,{width:390,height:464,offsetTop:0,offsetLeft:0});
Object.defineProperty(window,'visualViewport',{value:viewport});
window.webkit={messageHandlers:{RouteVNIOS:{postMessage(message){
  if(message.method!=='getCaretRect')throw new Error('Unexpected native request');
  const rect=realSelection().getRangeAt(0).getBoundingClientRect();
  queueMicrotask(()=>window.__routeVNIOSBridgeResult({id:message.id,ok:true,value:{x:rect.x,y:rect.y,width:2,height:rect.height,viewWidth:390}}));
}}}};
window.emulateLegacySelection=()=>{
  const read=()=>new Proxy(realSelection(),{get(target,key){
    if(key==='getComposedRanges')return undefined;
    if(key==='getRangeAt')return ()=>{const range=document.createRange();range.setStart(document.body,0);range.collapse(true);return range};
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  Object.defineProperty(shadow,'getSelection',{value:undefined});
  window.getSelection=read;document.getSelection=read;
};
window.pressArrow=direction=>{
  let repeat={};let pressed;
  const store={selectArrowRepeatState:()=>repeat,clearArrowRepeatState:()=>{repeat={}},setArrowRepeatState:value=>repeat=value,setArrowRepeatIntervalId:value=>Object.assign(repeat,value),setPressedActionId:value=>pressed=value.actionId,selectPressedActionId:()=>pressed,clearPressedActionId:()=>{pressed=undefined}};
  const currentTarget=document.createElement('div');currentTarget.dataset.actionId='arrow-'+direction;
  currentTarget.setPointerCapture=()=>{};currentTarget.releasePointerCapture=()=>{};
  const event={currentTarget,pointerId:1,preventDefault(){},stopPropagation(){}};
  const deps={store,render(){}};
  handleToolbarItemPointerDown(deps,{_event:event});handleToolbarItemPointerUp(deps,{_event:event});
};
window.readCaret=()=>{
  const owner=owners.find(owner=>owner.isEditorActiveElement());
  const range=realSelection().getRangeAt(0);
  return {section:owners.indexOf(owner),line:owner.getLineIdFromRange(range),selected:owner.selectedLineId,offset:range.startOffset};
};
installIOSSceneEditorKeyboard();
window.activate=activate;window.owners=owners;window.fixtureReady=true;
</script>`;

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const variants = engineName === "chromium" ? [false, true] : [false];
    for (const legacy of variants) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/section-navigation-check*", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      );
      // WebKit cannot expose its shadow caret to this JS-only bridge fixture.
      // Exercise its native Selection.modify path in light DOM; Chromium also
      // runs the hidden-shadow-selection emulation used to reproduce iOS 16.
      const query = engineName === "webkit" ? "?light-dom" : "";
      await page.goto(`${origin}/section-navigation-check${query}`);
      await page.waitForFunction(
        () =>
          window.fixtureReady &&
          window.owners.every((owner) =>
            owner.hasLine(owner.state.lines[5].id),
          ),
      );
      if (legacy) await page.evaluate(() => window.emulateLegacySelection());
      await page.evaluate(() => {
        window.activate(0, 5);
        // Match the software keyboard opening after focus on the phone.
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForTimeout(200);
      const press = async (direction) => {
        await page.evaluate((value) => window.pressArrow(value), direction);
        await page.waitForTimeout(150);
        return page.evaluate(() => window.readCaret());
      };
      for (let line = 0; line < 5; line++) {
        const caret = await press("down");
        assert.equal(
          caret.line,
          `section-1-line-${line}`,
          JSON.stringify({ engineName, legacy, caret }),
        );
        assert.equal(caret.selected, caret.line);
      }
      assert.equal((await press("up")).line, "section-1-line-3");
      for (let line = 2; line >= 0; line--) {
        assert.equal((await press("up")).line, `section-1-line-${line}`);
      }
      assert.equal((await press("up")).line, "section-0-line-5");

      await page.evaluate(() => window.activate(1, 0));
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        for (let index = 0; index < 4; index++) window.pressArrow("down");
        window.pressArrow("up");
      });
      await page.waitForTimeout(200);
      const rapid = await page.evaluate(() => window.readCaret());
      assert.equal(rapid.line, "section-1-line-3");
      assert.equal(rapid.selected, rapid.line);
      if (legacy) {
        await page.evaluate(() => {
          const lines = window.owners[0].lines;
          lines[5].actions.dialogue.content = [
            { text: "Example wrapped dialogue ".repeat(30) },
          ];
          window.owners[0].lines = lines;
        });
        await page.waitForTimeout(150);
        await page.evaluate(() => window.activate(0, 5, 0));
        await page.waitForTimeout(200);
        const wrapped = await press("down");
        assert.equal(wrapped.section, 0);
        assert.equal(wrapped.line, "section-0-line-5");
        assert.ok(
          wrapped.offset > 0,
          "Down must move within the wrapped line before crossing sections",
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `${engineName} legacy=${legacy}: cross-section Down/Up, reversal and rapid arrows passed`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
