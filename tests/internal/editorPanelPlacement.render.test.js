import { describe, expect, it } from "vitest";
import { h } from "snabbdom/build/h.js";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import jemplParse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";
import * as particleEditorStore from "../../src/pages/particleEditor/particleEditor.store.js";
import * as textStyleEditorStore from "../../src/pages/textStyleEditor/textStyleEditor.store.js";
import * as transformEditorStore from "../../src/pages/transformEditor/transformEditor.store.js";
import { loadViewTemplate } from "../support/renderView.js";
import { EN_I18N } from "../support/i18n.js";

// The keys from the root down to the element with `id`. The virtual DOM
// keeps an element only while every key on that path stays the same.
const findKeyPath = (vnode, id, path = []) => {
  const keys = [...path, vnode.key];
  if (vnode.key === id) {
    return keys;
  }
  for (const child of vnode.children ?? []) {
    if (typeof child === "object") {
      const found = findKeyPath(child, id, keys);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
};

describe("editor panels on phones", () => {
  it.each([
    ["particleEditor", particleEditorStore, "particleForm"],
    ["transformEditor", transformEditorStore, "transformInspector"],
    ["textStyleEditor", textStyleEditorStore, "textStyleForm"],
  ])(
    "keeps %s's Edit panel through a switch to Preview and back",
    (page, store, editElementId) => {
      const template = jemplParse(
        loadViewTemplate(`src/pages/${page}/${page}.view.yaml`),
      );
      const state = store.createInitialState();
      store.setUiConfig({ state }, { uiConfig: { id: "touch" } });
      store.setAppWindowMetrics({ state }, { width: 390, height: 844 });
      const keyPathIn = (mode) => {
        store.setRightPanelMode({ state }, { mode });
        const viewData = store.selectViewData({ state, i18n: EN_I18N });
        expect(viewData.showMobilePanels).toBe(true);
        return findKeyPath(
          parseView({ h, template, viewData, refs: {}, handlers: {} }),
          editElementId,
        );
      };

      const inEdit = keyPathIn("edit");
      expect(inEdit).toBeDefined();
      // Preview hides the Edit panel and the header with undo and redo; the
      // elements stay, so the form keeps its scroll and local state.
      expect(keyPathIn("preview")).toEqual(inEdit);
      expect(keyPathIn("edit")).toEqual(inEdit);
    },
  );
});
