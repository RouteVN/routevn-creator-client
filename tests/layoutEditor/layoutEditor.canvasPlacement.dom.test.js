// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import * as store from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  defineDisconnectCounter,
  mountViewYaml,
} from "../support/renderViewDom.js";

// jsdom replaces `URL`, so files are read by their path from the repository.
const EN_I18N = yaml.load(readFileSync("src/i18n/en.yaml", "utf8"));

describe("the layout editor's canvas", () => {
  // The canvas shares the app's graphics. Each time it leaves the page, even
  // for a move, it shuts them down and starts them again.
  it("stays in place as a tablet turns", () => {
    const disconnects = defineDisconnectCounter("rvn-layout-editor-canvas");
    const constants = yaml.load(
      readFileSync(
        "src/pages/layoutEditor/layoutEditor.constants.yaml",
        "utf8",
      ),
    );
    const state = store.createInitialState();
    store.setLayout(
      { state },
      { id: "layout-1", layout: { id: "layout-1", layoutType: "general" } },
    );
    store.setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    const view = mountViewYaml("src/pages/layoutEditor/layoutEditor.view.yaml");
    const render = ({ width, height }) => {
      store.setAppWindowMetrics({ state }, { width, height });
      const viewData = store.selectViewData({
        state,
        constants,
        i18n: EN_I18N,
      });
      view.render(viewData);
      return {
        tabletLandscape: viewData.showTabletLandscapeExplorer,
        canvas: view.container.querySelector("#layoutEditorCanvas"),
      };
    };

    const landscape = render({ width: 1133, height: 744 });
    expect(landscape.tabletLandscape).toBe(true);
    expect(landscape.canvas).not.toBeNull();
    const portrait = render({ width: 744, height: 1133 });
    expect(portrait.tabletLandscape).toBe(false);
    expect(portrait.canvas).toBe(landscape.canvas);
    expect(render({ width: 1133, height: 744 }).canvas).toBe(landscape.canvas);
    expect(disconnects.disconnects).toBe(0);
  });
});
