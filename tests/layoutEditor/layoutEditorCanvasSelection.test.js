import { describe, expect, it } from "vitest";
import { createLayoutEditorRenderedElements } from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasRender.js";
import {
  LAYOUT_EDITOR_SELECTION_METADATA_KEY,
  createLayoutEditorSelectionElementMapper,
  extractLayoutEditorSelectionOccurrences,
  resolveLayoutEditorCanvasHitPath,
  selectLayoutEditorCanvasHit,
  selectLayoutEditorCanvasHover,
  selectNextLayoutEditorCanvasHit,
} from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasSelection.js";

const bounds = (x = 0, y = 0, width = 10, height = 10) => ({
  x,
  y,
  width,
  height,
  corners: [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ],
});

describe("layoutEditorCanvasSelection", () => {
  it("keeps fragment descendants owned by the current layout fragment reference", () => {
    const mapElement = createLayoutEditorSelectionElementMapper({
      layoutId: "layout-main",
    });
    const element = mapElement({
      element: {
        id: "fragment-ref--fragment-child",
        type: "rect",
      },
      ancestry: [
        {
          layoutId: "layout-main",
          node: { id: "outer" },
        },
        {
          layoutId: "layout-main",
          node: { id: "fragment-ref" },
        },
        {
          layoutId: "fragment-layout",
          node: { id: "fragment-child" },
        },
      ],
    });

    expect(element[LAYOUT_EDITOR_SELECTION_METADATA_KEY]).toEqual({
      ownerItemId: "fragment-ref",
      authoredPath: ["outer", "fragment-ref"],
    });
  });

  it("extracts a clean rendered tree and an explicit occurrence sidecar", () => {
    const extracted = extractLayoutEditorSelectionOccurrences([
      {
        id: "repeat-instance-2",
        type: "container",
        [LAYOUT_EDITOR_SELECTION_METADATA_KEY]: {
          ownerItemId: "repeat",
          authoredPath: ["repeat"],
        },
        children: [
          {
            id: "child-instance-2",
            type: "rect",
            [LAYOUT_EDITOR_SELECTION_METADATA_KEY]: {
              ownerItemId: "child",
              authoredPath: ["repeat", "child"],
            },
          },
        ],
      },
    ]);

    expect(extracted.occurrencesById).toEqual({
      "repeat-instance-2": {
        occurrenceId: "repeat-instance-2",
        ownerItemId: "repeat",
        authoredPath: ["repeat"],
      },
      "child-instance-2": {
        occurrenceId: "child-instance-2",
        ownerItemId: "child",
        authoredPath: ["repeat", "child"],
      },
    });
    expect(extracted.occurrenceIdsByOwner).toEqual({
      repeat: ["repeat-instance-2"],
      child: ["child-instance-2"],
    });
    expect(extracted.elements).not.toHaveProperty(
      `0.${LAYOUT_EDITOR_SELECTION_METADATA_KEY}`,
    );
    expect(extracted.elements).not.toHaveProperty(
      `0.children.0.${LAYOUT_EDITOR_SELECTION_METADATA_KEY}`,
    );
  });

  it("resolves normal, deep, and repeated double-click hierarchy targets", () => {
    const occurrencesById = {
      a: {
        ownerItemId: "a",
        authoredPath: ["a"],
      },
      b: {
        ownerItemId: "b",
        authoredPath: ["a", "b"],
      },
      c: {
        ownerItemId: "c",
        authoredPath: ["a", "b", "c"],
      },
    };
    const hitResolution = resolveLayoutEditorCanvasHitPath({
      hits: [
        {
          path: [
            { id: "a", type: "container", bounds: bounds(0, 0, 100, 100) },
            { id: "b", type: "container", bounds: bounds(10, 10, 80, 80) },
            { id: "c", type: "rect", bounds: bounds(20, 20, 40, 40) },
          ],
        },
      ],
      occurrencesById,
    });

    expect(selectLayoutEditorCanvasHit(hitResolution)).toMatchObject({
      itemId: "a",
      occurrenceId: "a",
    });
    expect(
      selectLayoutEditorCanvasHit(hitResolution, { deepSelect: true }),
    ).toMatchObject({
      itemId: "c",
      occurrenceId: "c",
    });
    expect(
      selectNextLayoutEditorCanvasHit(hitResolution, { selectedItemId: "a" }),
    ).toMatchObject({ itemId: "b" });
    expect(
      selectNextLayoutEditorCanvasHit(hitResolution, { selectedItemId: "b" }),
    ).toMatchObject({ itemId: "c" });
    expect(
      selectNextLayoutEditorCanvasHit(hitResolution, {
        selectedItemId: "unrelated",
      }),
    ).toMatchObject({ itemId: "b" });
  });

  it("does not hover an ancestor while the selected descendant is under the pointer", () => {
    const hitResolution = {
      blocked: false,
      path: [
        { itemId: "outer", occurrenceId: "outer-instance" },
        { itemId: "text", occurrenceId: "text-instance" },
      ],
    };

    expect(
      selectLayoutEditorCanvasHover(hitResolution, {
        selectedOccurrenceId: "text-instance",
      }),
    ).toBeUndefined();
    expect(
      selectLayoutEditorCanvasHover(hitResolution, {
        deepSelect: true,
        selectedOccurrenceId: "outer-instance",
      }),
    ).toMatchObject({
      itemId: "text",
      occurrenceId: "text-instance",
    });
  });

  it("lets editor chrome own the gesture and skips other unowned branches", () => {
    const chromeHit = resolveLayoutEditorCanvasHitPath({
      hits: [
        {
          path: [
            {
              id: "selected-border-resize-left",
              type: "rect",
              bounds: bounds(),
            },
          ],
        },
        {
          path: [{ id: "owned", type: "rect", bounds: bounds() }],
        },
      ],
      occurrencesById: {
        owned: {
          ownerItemId: "owned",
          authoredPath: ["owned"],
        },
      },
    });
    const backgroundHit = resolveLayoutEditorCanvasHitPath({
      hits: [
        {
          path: [{ id: "synthetic-background", bounds: bounds() }],
        },
        {
          path: [{ id: "owned", bounds: bounds() }],
        },
      ],
      occurrencesById: {
        owned: {
          ownerItemId: "owned",
          authoredPath: ["owned"],
        },
      },
    });

    expect(chromeHit).toEqual({ blocked: true, path: [] });
    expect(selectLayoutEditorCanvasHit(backgroundHit)).toMatchObject({
      itemId: "owned",
    });
  });

  it("resolves content beneath the selected move surface for nested clicks", () => {
    const hitResolution = resolveLayoutEditorCanvasHitPath({
      hits: [
        {
          path: [
            {
              id: "selected-border-group",
              type: "container",
              bounds: bounds(),
            },
            { id: "selected-border", type: "rect", bounds: bounds() },
          ],
        },
        {
          path: [
            { id: "parent", type: "container", bounds: bounds() },
            { id: "child", type: "text", bounds: bounds() },
          ],
        },
      ],
      occurrencesById: {
        parent: {
          ownerItemId: "parent",
          authoredPath: ["parent"],
        },
        child: {
          ownerItemId: "child",
          authoredPath: ["parent", "child"],
        },
      },
    });

    expect(
      selectNextLayoutEditorCanvasHit(hitResolution, {
        selectedItemId: "parent",
      }),
    ).toMatchObject({
      itemId: "child",
      occurrenceId: "child",
    });
  });

  it("uses the renderer's front-to-back hit order for overlapping siblings", () => {
    const hitResolution = resolveLayoutEditorCanvasHitPath({
      hits: [
        {
          path: [{ id: "front", type: "rect", bounds: bounds() }],
        },
        {
          path: [{ id: "back", type: "rect", bounds: bounds() }],
        },
      ],
      occurrencesById: {
        front: {
          ownerItemId: "front",
          authoredPath: ["front"],
        },
        back: {
          ownerItemId: "back",
          authoredPath: ["back"],
        },
      },
    });

    expect(selectLayoutEditorCanvasHit(hitResolution)).toMatchObject({
      itemId: "front",
      occurrenceId: "front",
    });
  });

  it("builds fragment occurrence ownership without exposing metadata to graphics", () => {
    const rendered = createLayoutEditorRenderedElements({
      layoutState: {
        id: "layout-main",
        layoutType: "general",
        elements: {
          items: {
            outer: {
              type: "container",
              x: 0,
              y: 0,
              width: 200,
              height: 100,
            },
            "fragment-ref": {
              type: "fragment-ref",
              fragmentLayoutId: "fragment-layout",
              x: 0,
              y: 0,
              width: 100,
              height: 50,
            },
          },
          tree: [
            {
              id: "outer",
              children: [{ id: "fragment-ref" }],
            },
          ],
        },
      },
      repositoryState: {
        layouts: {
          items: {
            "fragment-layout": {
              id: "fragment-layout",
              type: "layout",
              isFragment: true,
              elements: {
                items: {
                  "fragment-child": {
                    type: "rect",
                    x: 0,
                    y: 0,
                    width: 50,
                    height: 20,
                  },
                },
                tree: [{ id: "fragment-child" }],
              },
            },
          },
        },
        images: { items: {} },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      },
      previewData: {},
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
    });

    expect(rendered.occurrencesById["fragment-ref--fragment-child"]).toEqual({
      occurrenceId: "fragment-ref--fragment-child",
      ownerItemId: "fragment-ref",
      authoredPath: ["outer", "fragment-ref"],
    });
    expect(rendered.elements[0].children[0].children[0]).not.toHaveProperty(
      LAYOUT_EDITOR_SELECTION_METADATA_KEY,
    );
  });

  it("keeps the selected repeated occurrence separate from its authored owner", () => {
    const rendered = createLayoutEditorRenderedElements({
      layoutState: {
        id: "layout-history",
        layoutType: "history",
        elements: {
          items: {
            row: {
              type: "container-ref-history-line",
              x: 0,
              y: 0,
              width: 100,
              height: 40,
            },
            child: {
              type: "rect",
              x: 0,
              y: 0,
              width: 20,
              height: 10,
            },
          },
          tree: [{ id: "row", children: [{ id: "child" }] }],
        },
      },
      repositoryState: {
        layouts: { items: {} },
        images: { items: {} },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      },
      previewData: {
        historyDialogue: [
          { characterName: "A", text: "First" },
          { characterName: "B", text: "Second" },
          { characterName: "C", text: "Third" },
        ],
      },
      selectedItemId: "child",
      selectedOccurrenceId: "child-instance-2",
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
    });

    expect(rendered.occurrenceIdsByOwner.child).toEqual([
      "child-instance-0",
      "child-instance-1",
      "child-instance-2",
    ]);
    expect(rendered.selectedElementMetrics.id).toBe("child-instance-2");
  });
});
