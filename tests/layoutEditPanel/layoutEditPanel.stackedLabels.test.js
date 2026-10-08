import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setImagesData,
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

const selectSections = (itemType, values) => {
  const state = createInitialState();
  setValues(
    { state },
    {
      values: {
        type: itemType,
        name: "Element",
        ...values,
      },
    },
  );

  const viewData = selectViewData({
    state,
    props: {
      itemType,
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

const selectTextSections = (values) => selectSections("text", values);

const selectSizeGroup = (itemType, values) =>
  selectSections(itemType, values)
    .flatMap((section) => section.items)
    .find((item) => item.fields?.some((field) => field.name === "width"));

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

  it("labels the typewriter's Effect select above it", () => {
    const revealingSection = selectSections("text-revealing", {
      revealEffect: "typewriter",
    }).find((section) => section.id === "textRevealing");

    expect(
      revealingSection.items.find((item) => item.name === "revealEffect"),
    ).toMatchObject({
      type: "select",
      stacked: true,
      label: "Effect",
    });
  });

  it("labels the indicator's Revealing and Complete above their boxes", () => {
    const indicatorSection = selectSections("text-revealing", {
      indicator: {
        revealing: { imageId: "image-revealing" },
        complete: { imageId: "image-complete" },
      },
    }).find((section) => section.id === "textRevealIndicator");
    const [indicatorBar] = indicatorSection.items;

    expect(indicatorBar).toMatchObject({ type: "list-bar", stacked: true });
    expect(
      indicatorBar.items.map(({ label, imageId }) => ({ label, imageId })),
    ).toEqual([
      { label: "Revealing", imageId: "image-revealing" },
      { label: "Complete", imageId: "image-complete" },
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

  it("labels the Default, Hover, and Click images above cards that name them", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "sprite",
          name: "Element",
          imageId: "image-default",
          hoverImageId: "image-hover",
        },
      },
    );
    setImagesData(
      { state },
      {
        imagesData: {
          items: {
            "image-default": {
              id: "image-default",
              type: "image",
              name: "Image One",
            },
          },
          tree: [{ id: "image-default" }],
        },
      },
    );

    const imagesSection = selectViewData({
      state,
      props: {
        itemType: "sprite",
        layoutType: "general",
        resourceType: "layouts",
        layoutsData: EMPTY_TREE,
        charactersData: EMPTY_TREE,
        isInsideSaveLoadSlot: false,
        isInsideDirectedContainer: false,
      },
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      i18n: EN_I18N,
    }).config.sections.find((section) => section.id === "images");

    expect(imagesSection.items[0]).toMatchObject({
      type: "list-bar",
      stacked: true,
      items: [
        {
          name: "imageId",
          label: "Default",
          imageId: "image-default",
          imageName: "Image One",
        },
        {
          name: "hoverImageId",
          label: "Hover",
          imageId: "image-hover",
          imageName: "image-hover",
        },
      ],
    });
  });

  it("renders a stacked image as a half-width 16:9 card with its name below", () => {
    const listBarBlock = sliceViewBlock(
      "$elif item.type == 'list-bar':",
      "$elif item.type == 'spritesheet-preview':",
    );
    const imageCard = listBarBlock.slice(
      listBarBlock.indexOf("$if barItem.imageId:"),
      listBarBlock.indexOf("$else:"),
    );

    expect(imageCard).toContain("rtgl-view#listBarItem${i}x${j}x${k}");
    // As wide as one of the panel's two columns, such as Position X.
    expect(imageCard).toContain("width: calc((100% - var(--spacing-md)) / 2);");
    expect(imageCard).toContain("aspect-ratio: 16 / 9;");
    expect(imageCard).toContain(
      'rvn-file-image imageId=${barItem.imageId} source="thumbnail" w=f h=f',
    );
    expect(imageCard.indexOf("rvn-file-image")).toBeLessThan(
      imageCard.indexOf("${barItem.imageName}"),
    );
  });

  it("labels the Width and Height values above them", () => {
    const spriteSizeGroup = selectSizeGroup("sprite", {
      width: 320,
      height: 180,
    });

    expect(spriteSizeGroup.stacked).toBe(true);
    expect(
      spriteSizeGroup.fields.map(({ label, name, svg }) => ({
        label,
        name,
        svg,
      })),
    ).toEqual([
      { label: "Width", name: "width", svg: undefined },
      { label: "Height", name: "height", svg: undefined },
    ]);

    const textSizeGroup = selectSizeGroup("text", {
      width: 300,
      widthMode: "fixed",
    });

    expect(textSizeGroup.stacked).toBe(true);
    expect(textSizeGroup.fields.map(({ label }) => label)).toEqual(["Width"]);
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
