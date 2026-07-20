import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState as createAnimationEditorState,
  selectViewData as selectAnimationEditorViewData,
  setUiConfig as setAnimationEditorUiConfig,
} from "../../src/pages/animationEditor/animationEditor.store.js";
import {
  createInitialState as createParticlesState,
  selectViewData as selectParticlesViewData,
  setUiConfig as setParticlesUiConfig,
} from "../../src/pages/particles/particles.store.js";
import {
  createInitialState as createSliderDialogState,
  selectViewData as selectSliderDialogViewData,
  setUiConfig as setSliderDialogUiConfig,
} from "../../src/components/layoutEditorSliderCreateDialog/layoutEditorSliderCreateDialog.store.js";
import {
  createInitialState as createSpriteDialogState,
  selectViewData as selectSpriteDialogViewData,
  setUiConfig as setSpriteDialogUiConfig,
} from "../../src/components/layoutEditorSpriteCreateDialog/layoutEditorSpriteCreateDialog.store.js";
import {
  createInitialState as createPreviewState,
  selectViewData as selectPreviewViewData,
  setUiConfig as setPreviewUiConfig,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";
import {
  createInitialState as createLayoutEditPanelState,
  selectViewData as selectLayoutEditPanelViewData,
  setUiConfig as setLayoutEditPanelUiConfig,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  createInitialState as createCommandLineBackgroundState,
  selectViewData as selectCommandLineBackgroundViewData,
  setUiConfig as setCommandLineBackgroundUiConfig,
} from "../../src/components/commandLineBackground/commandLineBackground.store.js";
import { EN_I18N } from "../support/i18n.js";

const EMPTY_TREE = { items: {}, tree: [] };

const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

const PREVIEW_CONSTANTS = {
  dialogueForm: { fields: [] },
  nvlForm: { fields: [] },
  choiceForm: { fields: [] },
  historyForm: { fields: [] },
  saveLoadForm: { fields: [] },
};

const createLayoutEditPanelProps = () => ({
  itemType: "container",
  layoutType: "general",
  resourceType: "layouts",
  layoutsData: EMPTY_TREE,
  charactersData: EMPTY_TREE,
  isInsideSaveLoadSlot: false,
  isInsideDirectedContainer: false,
});

const viewCases = [
  {
    name: "animation editor",
    path: "../../src/pages/animationEditor/animationEditor.view.yaml",
    start: "rtgl-dialog#imageSelectorDialog",
    end: "$when: fullImagePreviewVisible",
    explorer: "rvn-base-file-explorer#imageSelectorFileExplorer",
  },
  {
    name: "particles",
    path: "../../src/pages/particles/particles.view.yaml",
    start: "rtgl-dialog#previewImageSelectorDialog",
    end: undefined,
    explorer: "rvn-base-file-explorer#imageSelectorFileExplorer",
  },
  {
    name: "layout editor slider create dialog",
    path: "../../src/components/layoutEditorSliderCreateDialog/layoutEditorSliderCreateDialog.view.yaml",
    start: "rtgl-dialog#imageSelectorDialog",
    end: "$when: fullImagePreviewVisible",
    explorer: "rvn-base-file-explorer#baseFileExplorer",
  },
  {
    name: "layout editor sprite create dialog",
    path: "../../src/components/layoutEditorSpriteCreateDialog/layoutEditorSpriteCreateDialog.view.yaml",
    start: "rtgl-dialog#imageSelectorDialog",
    end: "$when: fullImagePreviewVisible",
    explorer: "rvn-base-file-explorer#baseFileExplorer",
  },
  {
    name: "layout editor preview",
    path: "../../src/components/layoutEditorPreview/layoutEditorPreview.view.yaml",
    start: "rtgl-dialog#imageSelectorDialog",
    end: "$when: fullImagePreviewVisible",
    explorer: "rvn-base-file-explorer#baseFileExplorer",
  },
  {
    name: "layout edit panel",
    path: "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
    start: "rtgl-dialog#imageSelectorDialog",
    end: "rtgl-dialog#soundFormDialog",
    explorer: "rvn-base-file-explorer#imageSelectorFileExplorer",
  },
  {
    name: "command line background",
    path: "../../src/components/commandLineBackground/commandLineBackground.view.yaml",
    start: "$if mode == 'gallery'",
    end: "$if tab == 'image'",
    explorer: "rvn-base-file-explorer#baseFileExplorer",
  },
];

const storeCases = [
  {
    name: "animation editor",
    createState: createAnimationEditorState,
    setUiConfig: setAnimationEditorUiConfig,
    selectViewData: (state) =>
      selectAnimationEditorViewData({
        state,
        i18n: EN_I18N,
      }),
  },
  {
    name: "particles",
    createState: createParticlesState,
    setUiConfig: setParticlesUiConfig,
    selectViewData: (state) =>
      selectParticlesViewData({
        state,
        i18n: EN_I18N,
      }),
  },
  {
    name: "layout editor slider create dialog",
    createState: createSliderDialogState,
    setUiConfig: setSliderDialogUiConfig,
    selectViewData: (state) =>
      selectSliderDialogViewData({
        state,
        constants: {
          sliderCreateForm: {},
        },
      }),
  },
  {
    name: "layout editor sprite create dialog",
    createState: createSpriteDialogState,
    setUiConfig: setSpriteDialogUiConfig,
    selectViewData: (state) =>
      selectSpriteDialogViewData({
        state,
        constants: {
          spriteCreateForm: {},
        },
      }),
  },
  {
    name: "layout editor preview",
    createState: createPreviewState,
    setUiConfig: setPreviewUiConfig,
    selectViewData: (state) =>
      selectPreviewViewData({
        state,
        constants: PREVIEW_CONSTANTS,
      }),
  },
  {
    name: "layout edit panel",
    createState: createLayoutEditPanelState,
    setUiConfig: setLayoutEditPanelUiConfig,
    selectViewData: (state) =>
      selectLayoutEditPanelViewData({
        state,
        props: createLayoutEditPanelProps(),
        constants: LAYOUT_EDIT_PANEL_CONSTANTS,
        i18n: EN_I18N,
      }),
  },
  {
    name: "command line background",
    createState: createCommandLineBackgroundState,
    setUiConfig: setCommandLineBackgroundUiConfig,
    selectViewData: (state) =>
      selectCommandLineBackgroundViewData({
        state,
        i18n: EN_I18N,
      }),
  },
];

const readView = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const sliceBranch = (view, startText, endText) => {
  const start = view.indexOf(startText);
  expect(start).toBeGreaterThan(-1);
  const end = endText ? view.indexOf(endText, start) : view.length;
  expect(end).toBeGreaterThan(start);

  return view.slice(start, end);
};

describe("mobile image selector file explorers", () => {
  it.each(viewCases)(
    "guards the $name file explorer behind touch-mode view data",
    ({ path, start, end, explorer }) => {
      const branch = sliceBranch(readView(path), start, end);
      const guardIndex = branch.indexOf("$if showImageSelectorFileExplorer");
      const explorerIndex = branch.indexOf(explorer);

      expect(guardIndex).toBeGreaterThan(-1);
      expect(explorerIndex).toBeGreaterThan(guardIndex);
    },
  );

  it.each(storeCases)(
    "hides the $name file explorer in touch mode",
    ({ createState, setUiConfig, selectViewData }) => {
      const state = createState();

      expect(selectViewData(state).showImageSelectorFileExplorer).toBe(true);

      setUiConfig(
        { state },
        {
          uiConfig: {
            inputMode: "touch",
          },
        },
      );

      expect(selectViewData(state).showImageSelectorFileExplorer).toBe(false);
    },
  );
});
