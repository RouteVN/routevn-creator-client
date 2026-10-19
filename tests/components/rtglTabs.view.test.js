import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import * as particleEditorStore from "../../src/pages/particleEditor/particleEditor.store.js";
import * as platformDetailsStore from "../../src/pages/platformDetails/platformDetails.store.js";
import * as textStyleEditorStore from "../../src/pages/textStyleEditor/textStyleEditor.store.js";
import * as transformEditorStore from "../../src/pages/transformEditor/transformEditor.store.js";
import { FR_I18N } from "../support/i18n.js";

const SRC = new URL("../../src/", import.meta.url).pathname;
const LAYOUT_EDITOR_CONSTANTS = yaml.load(
  readFileSync(
    join(SRC, "pages/layoutEditor/layoutEditor.constants.yaml"),
    "utf8",
  ),
);

const listViews = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listViews(path);
    }
    return entry.name.endsWith(".view.yaml") ? [path] : [];
  });

describe("rtgl-tabs", () => {
  // Without an aria-label, Rettangoli names every tab group "Tabs" in
  // English for screen readers.
  it("names every tab group in the app's language", () => {
    const tabLines = listViews(SRC).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => line.includes("rtgl-tabs#"))
        .map((line) => ({ path: path.slice(SRC.length), line: line.trim() })),
    );

    expect(tabLines.length).toBeGreaterThan(0);
    expect(
      tabLines.filter(({ line }) => !/ aria-label="\$\{\w+\}"/.test(line)),
    ).toEqual([]);
  });

  it.each([
    [layoutEditorStore, "Panneaux de l’éditeur de mise en page"],
    [textStyleEditorStore, "Panneaux de l’éditeur de style de texte"],
    [particleEditorStore, "Panneaux de l’éditeur de particules"],
    [transformEditorStore, "Panneaux de l’éditeur de transformation"],
  ])("names an editor's Edit and Preview tabs (%#)", (store, label) => {
    const viewData = store.selectViewData({
      state: store.createInitialState(),
      constants: LAYOUT_EDITOR_CONSTANTS,
      i18n: FR_I18N,
    });

    expect(viewData.editorPanelsLabel).toBe(label);
  });

  it("names the release platform tabs", () => {
    const viewData = platformDetailsStore.selectViewData({
      state: platformDetailsStore.createInitialState(),
      i18n: FR_I18N,
    });

    expect(viewData.platformTabsLabel).toBe("Plateformes de publication");
  });
});
