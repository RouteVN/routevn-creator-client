import { describe, expect, it } from "vitest";
import { createLayoutThumbnailSource } from "../../src/internal/layoutPreview.js";

// A Save/Load Slot container is repeated once per save slot. With a
// visibility condition that is false, jempl renders each slot as {}, which
// Route Graphics cannot parse: the layout editor canvas and the layout's
// thumbnail then failed with "Width or height is missing".

const EMPTY_COLLECTION = { items: {}, tree: [] };
const REPOSITORY_STATE = {
  project: { resolution: { width: 1280, height: 720 } },
  images: EMPTY_COLLECTION,
  fonts: EMPTY_COLLECTION,
  colors: EMPTY_COLLECTION,
  textStyles: EMPTY_COLLECTION,
  sounds: EMPTY_COLLECTION,
  particles: EMPTY_COLLECTION,
  layouts: EMPTY_COLLECTION,
  variables: EMPTY_COLLECTION,
};

const createLayout = (preview) => ({
  id: "layout-1",
  type: "layout",
  layoutType: "save-load",
  elements: {
    items: {
      list: { id: "list", type: "container", x: 0, y: 0 },
      title: {
        id: "title",
        type: "rect",
        x: 0,
        y: 0,
        width: 400,
        height: 40,
      },
      slots: {
        id: "slots",
        type: "container-ref-save-load-slot",
        x: 0,
        y: 50,
        width: 400,
        height: 200,
        $when: "runtime.autoMode == true",
      },
      slotBackground: {
        id: "slotBackground",
        type: "rect",
        x: 0,
        y: 0,
        width: 300,
        height: 60,
      },
    },
    tree: [
      {
        id: "list",
        children: [
          { id: "title" },
          { id: "slots", children: [{ id: "slotBackground" }] },
        ],
      },
    ],
  },
  preview,
});

const collectElements = (elements, found = []) => {
  for (const element of elements) {
    found.push(element);
    collectElements(element.children ?? [], found);
  }
  return found;
};

const renderLayout = (preview) =>
  collectElements(
    createLayoutThumbnailSource({
      item: createLayout(preview),
      repositoryState: REPOSITORY_STATE,
    }).renderState.elements,
  );

const slotBackgrounds = (elements) =>
  elements.filter(
    (element) =>
      element.type === "rect" && element.width === 300 && element.height === 60,
  );

describe("a layout preview with a hidden Save/Load Slot", () => {
  it("draws no slots, and no element without a type, while the condition is false", () => {
    const elements = renderLayout({ runtime: { autoMode: false } });

    expect(elements.filter((element) => !element.type)).toEqual([]);
    expect(slotBackgrounds(elements)).toEqual([]);
    expect(
      elements.filter(
        (element) => element.type === "rect" && element.width === 400,
      ),
    ).toHaveLength(1);
  });

  it("draws the slots while the condition is true", () => {
    const elements = renderLayout({ runtime: { autoMode: true } });

    expect(elements.filter((element) => !element.type)).toEqual([]);
    expect(slotBackgrounds(elements).length).toBeGreaterThan(0);
  });
});
