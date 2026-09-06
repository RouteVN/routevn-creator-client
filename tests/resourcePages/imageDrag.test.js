import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { h } from "snabbdom/build/h.js";
import { init } from "snabbdom/build/init.js";
import { attributesModule } from "snabbdom/build/modules/attributes.js";
import { eventListenersModule } from "snabbdom/build/modules/eventlisteners.js";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import { parse } from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/index.js";
import * as fileImageStore from "../../src/components/fileImage/fileImage.store.js";
import * as fileImageHandlers from "../../src/components/fileImage/fileImage.handlers.js";
import * as cropperStore from "../../src/components/squareImageCropper/squareImageCropper.store.js";
import * as cropperHandlers from "../../src/components/squareImageCropper/squareImageCropper.handlers.js";

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ["fileImage", fileImageStore, fileImageHandlers],
  ["squareImageCropper", cropperStore, cropperHandlers],
])("%s image gestures", (name, store, handlers) => {
  it("cancels native image dragging without inline scripts, preserving preview gestures after rerenders", () => {
    // Inline event handlers are disabled, as they are under Android's CSP.
    const dom = new JSDOM("<body><div id='root'></div></body>");
    vi.stubGlobal("document", dom.window.document);
    dom.window.customElements.define(
      "rtgl-image",
      class extends dom.window.HTMLElement {
        constructor() {
          super();
          // Model the UI component's native image behind its shadow boundary.
          this.attachShadow({ mode: "open" }).append(
            dom.window.document.createElement("img"),
          );
        }
      },
    );
    const view = yaml.load(
      readFileSync(
        new URL(
          `../../src/components/${name}/${name}.view.yaml`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const template = parse(view.template);
    const context = { state: store.createInitialState(), props: {} };
    const boundHandlers = Object.fromEntries(
      Object.entries(handlers).map(([key, handler]) => [
        key,
        (payload) => handler({}, payload),
      ]),
    );
    const patch = init([attributesModule, eventListenersModule]);
    let tree = dom.window.document.querySelector("#root");
    const onPreview = vi.fn();
    const onClick = vi.fn();
    dom.window.document.body.addEventListener("contextmenu", onPreview);
    dom.window.document.body.addEventListener("click", onClick);

    try {
      for (let index = 0; index < 3; index += 1) {
        const src = `https://example.com/image-${index}.png`;
        if (name === "fileImage") {
          store.setSrc(context, { src });
        } else {
          store.setImage(context, {
            imageUrl: src,
            imageWidth: 320,
            imageHeight: 320,
          });
        }
        tree = patch(
          tree,
          parseView({
            h,
            template,
            viewData: store.selectViewData(context),
            refs: view.refs,
            handlers: boundHandlers,
          }),
        );
        const image = tree.elm
          .querySelector("rtgl-image")
          .shadowRoot.querySelector("img");
        const drag = new dom.window.Event("dragstart", {
          bubbles: true,
          composed: true,
          cancelable: true,
        });
        expect(image.dispatchEvent(drag)).toBe(false);
        expect(drag.defaultPrevented).toBe(true);

        const preview = new dom.window.MouseEvent("contextmenu", {
          bubbles: true,
          composed: true,
          cancelable: true,
        });
        expect(image.dispatchEvent(preview)).toBe(true);
        image.dispatchEvent(
          new dom.window.MouseEvent("click", {
            bubbles: true,
            composed: true,
          }),
        );
        expect(onPreview).toHaveBeenCalledTimes(index + 1);
        expect(onClick).toHaveBeenCalledTimes(index + 1);
      }
    } finally {
      dom.window.close();
    }
  });
});
