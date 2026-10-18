import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { JA_I18N, PT_I18N } from "../support/i18n.js";

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

const selectPanelViewData = ({ values, i18n, resourceType = "layouts" }) => {
  const state = createInitialState();
  setValues({ state }, { values });

  return selectViewData({
    state,
    props: {
      itemType: values.type,
      layoutType: "general",
      resourceType,
      layoutsData: EMPTY_TREE,
      charactersData: EMPTY_TREE,
      isInsideSaveLoadSlot: false,
      isInsideDirectedContainer: false,
    },
    constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    i18n,
  });
};

const findSection = (viewData, id) =>
  viewData.config.sections.find((section) => section.id === id);

const findSectionItem = (viewData, type) =>
  viewData.config.sections
    .flatMap((section) => section.items)
    .find((item) => item.type === type);

// Technical values that read the same in every language.
const UNTRANSLATED_WORDS = new Set(["BGM", "MMM", "YYYY"]);

// Every label and tooltip the panel shows, with the panel's own nesting.
const collectPanelText = (sections = []) => {
  const texts = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!node || typeof node !== "object") {
      return;
    }

    for (const key of ["label", "tooltip", "ariaLabel", "title"]) {
      if (typeof node[key] === "string") {
        texts.push(node[key]);
      }
    }
    for (const key of [
      "items",
      "fields",
      "options",
      "attributeItems",
      "popoverForm",
    ]) {
      visit(node[key]);
    }
  };

  sections.forEach((section) => {
    texts.push(section.label);
    if (section.tooltip) {
      texts.push(section.tooltip);
    }
    visit(section.items);
  });
  return texts;
};

describe("layoutEditPanel localized labels", () => {
  it("translates the Blur section label", () => {
    const viewData = selectPanelViewData({
      values: { type: "sprite", name: "Sprite" },
      i18n: PT_I18N,
    });

    expect(findSection(viewData, "blur").label).toBe(
      PT_I18N.layoutEditPanel.blurTitle,
    );
  });

  it("translates the spritesheet Animation select label", () => {
    const viewData = selectPanelViewData({
      values: { type: "spritesheet-animation", name: "Spritesheet Animation" },
      i18n: PT_I18N,
    });
    const animationSelect = findSection(viewData, "spritesheet").items.find(
      (item) => item.name === "spritesheetSelection",
    );

    expect(animationSelect.label).toBe(PT_I18N.layoutEditPanel.animationLabel);
  });

  it("translates the Child Interaction tooltip", () => {
    const viewData = selectPanelViewData({
      values: { type: "container", name: "Container" },
      i18n: PT_I18N,
    });

    expect(findSection(viewData, "childInteraction")).toMatchObject({
      label: PT_I18N.layoutEditPanel.childInteractionTitle,
      tooltip: PT_I18N.layoutEditPanel.childInteractionTooltip,
    });
  });

  it("names the pagination runtime value instead of its path", () => {
    const viewData = selectPanelViewData({
      values: {
        type: "container-ref-save-load-slot",
        name: "Save Slot",
        paginationMode: "paginated",
        paginationSize: 3,
      },
      i18n: PT_I18N,
    });

    expect(findSectionItem(viewData, "pagination-summary").value).toBe(
      "Paginada: Paginação de jogos guardados • 3 por página",
    );
  });

  it("translates the placeholder for text with no content", () => {
    const viewData = selectPanelViewData({
      values: { type: "text", name: "Text", content: [{ text: "" }] },
      i18n: PT_I18N,
    });

    expect(findSectionItem(viewData, "text-content-summary").value).toBe(
      PT_I18N.layoutEditPanel.emptyTextSummary,
    );
    expect(viewData.textContentSummaryParts).toEqual([
      {
        key: "empty",
        type: "text",
        text: PT_I18N.layoutEditPanel.emptyTextSummary,
        muted: true,
      },
    ]);
  });

  it("passes the text editor its variable menu text", () => {
    const viewData = selectPanelViewData({
      values: { type: "text", name: "Text" },
      i18n: PT_I18N,
    });
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(viewData.textContentMenuLabels).toEqual({
      noVariables: PT_I18N.layoutEditPanel.noVariablesMenuItem,
      variableTypes: {
        string: PT_I18N.commandLinePage.string,
        number: PT_I18N.commandLinePage.number,
        boolean: PT_I18N.commandLinePage.boolean,
      },
    });
    expect(view).toContain(":menuLabels=${textContentMenuLabels}");
  });

  it("shows no English label or tooltip in a Japanese panel", () => {
    const elements = [
      { type: "container", name: "Container", direction: "horizontal" },
      {
        type: "sprite",
        name: "Image",
        imageId: "image-1",
        hoverImageId: "image-2",
        clickImageId: "image-3",
        blur: { x: 1, y: 1 },
      },
      { type: "spritesheet-animation", name: "Spritesheet Animation" },
      { type: "particle", name: "Particle" },
      { type: "text", name: "Text", hoverTextStyleId: "style-1" },
      {
        type: "text-revealing-ref-dialogue-content",
        name: "Dialogue Content",
      },
      { type: "text-ref-save-load-slot-date", name: "Save Date" },
      { type: "slider", name: "Slider" },
      { type: "input", name: "Input" },
      { type: "container-ref-save-load-slot", name: "Save Slot" },
      { type: "container-ref-choice-single-item", name: "Choice" },
      { type: "fragment-ref", name: "Fragment" },
      { type: "rect", name: "Rect" },
    ];

    const englishTexts = [
      ...elements.flatMap((values) =>
        collectPanelText(
          selectPanelViewData({ values, i18n: JA_I18N }).config.sections,
        ),
      ),
      ...collectPanelText(
        selectPanelViewData({
          values: { type: "sprite", name: "Control Sprite" },
          i18n: JA_I18N,
          resourceType: "controls",
        }).config.sections,
      ),
    ].filter((text) =>
      (text.match(/[A-Za-z]{3,}/g) ?? []).some(
        (word) => !UNTRANSLATED_WORDS.has(word),
      ),
    );

    expect(englishTexts).toEqual([]);
  });
});
