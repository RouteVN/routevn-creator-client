import { describe, expect, it, vi } from "vitest";
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

const template = parse(
  loadViewTemplate("src/pages/animationEditor/animationEditor.view.yaml"),
);

describe("Camera dialog preview lifecycle", () => {
  it.each(["commitCameraEditor", "closeCameraEditor"])(
    "preserves the renderer-owned canvas across opening, moving and %s",
    (close) => {
      const dom = new JSDOM();
      vi.stubGlobal("document", dom.window.document);
      const state = editor.createInitialState();
      editor.addProperty({ state }, { side: "update", property: "camera" });
      const patch = init([attributesModule, propsModule]);
      const host = document.createElement("div");
      document.body.append(host);
      let vnode = host;
      const render = () => {
        vnode = patch(
          vnode,
          parseView({
            h,
            template,
            viewData: editor.selectViewData({ state, i18n: EN_I18N }),
            wireEventListeners: false,
          }),
        );
      };
      render();
      const canvasHost = vnode.elm.querySelector("#canvas");
      const canvas = document.createElement("canvas");
      canvasHost.append(canvas);

      try {
        editor.openCameraEditor({ state }, { side: "update", index: 0 });
        render();
        expect(vnode.elm.querySelector("#canvas")).toBe(canvasHost);
        expect(canvas.isConnected).toBe(true);
        editor.setCameraEditorPose(
          { state },
          { pose: { x: 900, y: 540, scaleX: 1.2, scaleY: 1.2 } },
        );
        render();
        expect(vnode.elm.querySelector("#canvas canvas")).toBe(canvas);
        editor[close]({ state });
        render();
        expect(vnode.elm.querySelector("#canvas canvas")).toBe(canvas);
        expect(canvas.isConnected).toBe(true);
      } finally {
        dom.window.close();
        vi.unstubAllGlobals();
      }
    },
  );
});
