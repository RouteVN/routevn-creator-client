import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { h } from "snabbdom/build/h.js";
import { init } from "snabbdom/build/init.js";
import { attributesModule } from "snabbdom/build/modules/attributes.js";
import { propsModule } from "snabbdom/build/modules/props.js";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import { parse } from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/index.js";
import * as editor from "../../src/pages/animationEditor/animationEditor.store.js";
import { EN_I18N } from "../support/i18n.js";
import { loadViewTemplate } from "../support/renderView.js";

afterEach(() => vi.unstubAllGlobals());

it("opens and reopens mobile keyframe dialogs with the real Zoom popover mounted", async () => {
  const dom = new JSDOM("<body><div id='root'></div></body>");
  for (const name of [
    "document",
    "window",
    "HTMLElement",
    "Node",
    "CustomEvent",
  ]) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  vi.stubGlobal(
    "CSSStyleSheet",
    class {
      replaceSync() {}
    },
  );
  const { default: createPopover } = await import(
    "../../node_modules/@rettangoli/ui/src/primitives/popover.js"
  );
  dom.window.customElements.define("rtgl-popover", createPopover({}));
  const template = parse(
    loadViewTemplate("src/pages/animationEditor/animationEditor.view.yaml"),
  );
  const patch = init([attributesModule, propsModule]);
  let tree = dom.window.document.querySelector("#root");
  const state = editor.createInitialState();
  state.isTouchMode = true;
  const context = { state, i18n: EN_I18N };
  const render = () => {
    tree = patch(
      tree,
      parseView({
        h,
        template,
        viewData: editor.selectViewData(context),
        wireEventListeners: false,
      }),
    );
  };

  try {
    for (const [side, property] of [
      ["update", "x"],
      ["prev", "alpha"],
      ["next", "camera"],
    ]) {
      editor.openDialog(context, {
        dialogType: side === "update" ? "update" : "transition",
      });
      editor.addProperty(context, { side, property });
      if (state.tweenBySection[side][property].keyframes.length === 0) {
        editor.addKeyframe(context, {
          side,
          property,
          value: 1,
          duration: 1000,
          easing: "linear",
          relative: false,
        });
      }
      render();
      const zoom = dom.window.document.querySelector("#timelineZoomPopover");
      const slider = zoom.querySelector("#timelineZoomSlider");
      expect(slider).not.toBeNull();
      // The published popover keeps caller-owned content in the light DOM.
      expect(zoom.querySelector("#timelineZoomContent").parentElement).toBe(
        zoom,
      );
      const authored = structuredClone(state.tweenBySection);
      for (let cycle = 0; cycle < 2; cycle++) {
        const selection = { side, property, index: 0 };
        editor.setSelectedKeyframe(context, selection);
        editor.setPopover(context, {
          mode: "keyframeMenu",
          payload: selection,
        });
        render();
        editor.setPopover(context, {
          mode: "editKeyframe",
          payload: selection,
        });
        expect(render).not.toThrow();
        const dialog = dom.window.document.querySelector(
          "#editKeyframeDialog[open]",
        );
        expect(dialog).not.toBeNull();
        const form = dialog.querySelector("#editKeyframeForm");
        expect(form.defaultValues).toEqual(
          editor.selectSelectedKeyframeFormValues(context),
        );
        expect(
          form.form.fields.map((field) => field.name ?? field.slot),
        ).toEqual(
          expect.arrayContaining([
            "delay",
            "duration",
            "easing",
            property === "camera" ? "camera-value" : "value",
          ]),
        );
        expect(zoom.querySelector("#timelineZoomSlider")).toBe(slider);
        editor.closePopover(context);
        expect(render).not.toThrow();
        expect(
          dom.window.document.querySelector("#editKeyframeDialog"),
        ).toBeNull();
        expect(state.tweenBySection).toEqual(authored);
      }
    }
  } finally {
    dom.window.close();
  }
});
