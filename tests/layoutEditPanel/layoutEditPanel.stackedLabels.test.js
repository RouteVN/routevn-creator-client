import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
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
const layoutEditPanelView = readFileSync(
  new URL(
    "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

const selectTextSections = (values) => {
  const state = createInitialState();
  setValues(
    { state },
    {
      values: {
        type: "text",
        name: "Text",
        ...values,
      },
    },
  );

  const viewData = selectViewData({
    state,
    props: {
      itemType: "text",
      layoutType: "general",
      resourceType: "layouts",
      layoutsData: EMPTY_TREE,
      charactersData: EMPTY_TREE,
      isInsideSaveLoadSlot: false,
      isInsideDirectedContainer: false,
    },
    constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    i18n: EN_I18N,
  });
  return viewData.config.sections;
};

const sliceViewBlock = (startMarker, endMarker) =>
  layoutEditPanelView.slice(
    layoutEditPanelView.indexOf(startMarker),
    layoutEditPanelView.indexOf(endMarker),
  );

describe("layoutEditPanel stacked labels", () => {
  it("labels the Default, Hover, and Clicked text style selects above them", () => {
    const textStylesSection = selectTextSections({
      textStyleId: "style-default",
      hoverTextStyleId: "style-hover",
      clickTextStyleId: "style-click",
    }).find((section) => section.id === "textStyles");

    expect(
      textStylesSection.items.map(({ type, stacked, label, name }) => ({
        type,
        stacked,
        label,
        name,
      })),
    ).toEqual([
      {
        type: "select",
        stacked: true,
        label: "Default",
        name: "textStyleId",
      },
      {
        type: "select",
        stacked: true,
        label: "Hover",
        name: "hoverTextStyleId",
      },
      {
        type: "select",
        stacked: true,
        label: "Clicked",
        name: "clickTextStyleId",
      },
    ]);
  });

  it("labels the Hover and Click sound boxes above them and shows their volume", () => {
    const soundsSection = selectTextSections({
      hoverSoundId: "sound-hover",
      clickSoundId: "sound-click",
      click: { soundVolume: 40 },
    }).find((section) => section.id === "sounds");

    expect(soundsSection.items).toHaveLength(1);
    expect(soundsSection.items[0]).toMatchObject({
      type: "list-bar",
      stacked: true,
      items: [
        {
          name: "hoverSoundId",
          label: "Hover",
          soundId: "sound-hover",
          volumeLabel: "100%",
        },
        {
          name: "clickSoundId",
          label: "Click",
          soundId: "sound-click",
          volumeLabel: "40%",
        },
      ],
    });
  });

  it("renders a stacked select's label above it", () => {
    const selectBlock = sliceViewBlock(
      "$elif item.type == 'select':",
      "$elif item.type == 'anchor-grid':",
    );

    expect(selectBlock).toContain("$if item.stacked:");
    expect(selectBlock).toContain("rtgl-view d=v w=f g=sm:");
    expect(selectBlock).toContain("rtgl-text s=xs c=mu: ${item.label}");
  });

  it("renders a stacked list bar's label above its box", () => {
    const listBarBlock = sliceViewBlock(
      "$elif item.type == 'list-bar':",
      "$elif item.type == 'spritesheet-preview':",
    );
    const [stackedBlock] = listBarBlock.split("$else:\n");

    expect(stackedBlock).toContain("$if item.stacked:");
    expect(stackedBlock).toContain("rtgl-text s=xs c=mu: ${barItem.label}");
    expect(stackedBlock.indexOf("${barItem.label}")).toBeLessThan(
      stackedBlock.indexOf("rtgl-view#listBarItem${i}x${j}x${k}"),
    );
  });
});
