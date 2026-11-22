// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import * as store from "../../src/components/visualLayoutEditor/visualLayoutEditor.store.js";
import {
  defineDisconnectCounter,
  mountViewYaml,
} from "../support/renderViewDom.js";

const createRepositoryState = () => ({
  project: { resolution: { width: 1920, height: 1080 } },
  scenes: {
    items: {
      "scene-1": {
        sections: {
          items: {
            "section-1": {
              lines: {
                items: {
                  "line-1": {
                    actions: {
                      visual: {
                        items: [
                          {
                            id: "card",
                            layout: {
                              layoutSchemaVersion: 2,
                              elements: {
                                items: {
                                  title: {
                                    type: "text",
                                    name: "Title",
                                    text: "Hello",
                                  },
                                },
                                tree: [{ id: "title" }],
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

// jsdom replaces `URL`, so files are read by their path from the repository.
const EN_I18N = yaml.load(readFileSync("src/i18n/en.yaml", "utf8"));

describe("the visual layout editor's canvas", () => {
  // The canvas shares the app's graphics. Each time it leaves the page, even
  // for a move, it shuts them down and starts them again, which lost the
  // scene's images, or left the canvas loading, after a rotation.
  it("stays in place as the screen turns and the panels change", () => {
    const disconnects = defineDisconnectCounter("rvn-layout-editor-canvas");
    const props = {
      sceneId: "scene-1",
      sectionId: "section-1",
      lineId: "line-1",
      visualId: "card",
    };
    const state = store.createInitialState();
    store.setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    store.loadVisualLayout(
      { state },
      { repositoryState: createRepositoryState(), ...props },
    );
    const view = mountViewYaml(
      "src/components/visualLayoutEditor/visualLayoutEditor.view.yaml",
    );
    const render = () => {
      view.render(store.selectViewData({ state, props, i18n: EN_I18N }));
      return view.container.querySelector("#layoutEditorCanvas");
    };

    // Portrait: the Elements list under the canvas.
    const canvas = render();
    expect(canvas).not.toBeNull();
    // Portrait: the element's panel under the canvas.
    store.setSelectedItemId({ state }, { itemId: "title" });
    store.closeMobileFileExplorer({ state });
    expect(render()).toBe(canvas);
    // Landscape: the Elements pane on the left, the panel on the right.
    store.setTouchLandscape({ state }, { isTouchLandscape: true });
    expect(render()).toBe(canvas);
    // Back to portrait, and to the list.
    store.setTouchLandscape({ state }, { isTouchLandscape: false });
    expect(render()).toBe(canvas);
    store.openMobileFileExplorer({ state });
    expect(render()).toBe(canvas);
    expect(disconnects.disconnects).toBe(0);
  });
});
