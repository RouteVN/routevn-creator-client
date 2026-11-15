import { readFileSync } from "node:fs";
import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import {
  handleAddVisualClick,
  handleAfterMount,
  handleBeforeMount,
  handleBreadcumbClick,
  handleCancelEditClick,
  handleEditLayoutClick,
  handleLayerChange,
  handleLayoutChange,
  handleOpacityInput,
  handleSaveVisualClick,
  handleSubmitClick,
  handleVisualListItemClick,
} from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import * as visualStore from "../../src/components/commandLineVisual/commandLineVisual.store.js";
import {
  cancelVisualEdit,
  createInitialState,
  saveVisualEdit,
  selectEditingVisualId,
  selectLayoutVisualItem,
  selectMode,
  selectSelectedVisualIndex,
  selectSelectedVisuals,
  selectViewData,
  selectVisualMedia,
  setAnimations,
  setExistingVisuals,
  setImages,
  setLayouts,
  setTransforms,
  startVisualEdit,
  updateVisualLayer,
  updateVisualOpacity,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const toPlainObject = (value) => JSON.parse(JSON.stringify(value));

const createStoreApi = (state) => ({
  cancelVisualEdit: () => cancelVisualEdit({ state }),
  saveVisualEdit: () => saveVisualEdit({ state }),
  selectEditingVisualId: () => selectEditingVisualId({ state }),
  selectMode: () => selectMode({ state }),
  selectLayoutVisualItem: (payload) =>
    selectLayoutVisualItem({ state }, payload),
  selectVisualMedia: (payload) => selectVisualMedia({ state }, payload),
  selectSelectedVisualIndex: () => selectSelectedVisualIndex({ state }),
  selectSelectedVisuals: () => selectSelectedVisuals({ state }),
  startVisualEdit: (payload) => startVisualEdit({ state }, payload),
  updateVisualLayer: (payload) => updateVisualLayer({ state }, payload),
  updateVisualOpacity: (payload) => updateVisualOpacity({ state }, payload),
});

const indexEvent = (index) => ({
  _event: {
    currentTarget: {
      dataset: { index: String(index) },
    },
  },
});

const createState = () => {
  const state = createInitialState();
  setImages(
    { state },
    {
      images: {
        items: {
          "image-one": {
            id: "image-one",
            type: "image",
            name: "Image One",
            fileId: "file-one",
          },
          "image-two": {
            id: "image-two",
            type: "image",
            name: "Image Two",
            fileId: "file-two",
          },
        },
        tree: [{ id: "image-one" }, { id: "image-two" }],
      },
    },
  );
  setTransforms(
    { state },
    {
      transforms: {
        items: {
          center: { id: "center", type: "transform", name: "Center" },
        },
        tree: [{ id: "center" }],
      },
    },
  );
  setAnimations(
    { state },
    {
      animations: {
        items: {
          fade: {
            id: "fade",
            type: "animation",
            name: "Fade",
            animation: { type: "update" },
          },
        },
        tree: [{ id: "fade" }],
      },
    },
  );
  setExistingVisuals(
    { state },
    {
      visuals: [
        {
          id: "visual-one",
          resourceId: "image-one",
          resourceType: "image",
          transformId: "center",
          layer: 50,
          opacity: 0.5,
          flipX: true,
          animations: { resourceId: "fade" },
        },
        {
          id: "visual-two",
          resourceId: "image-two",
          resourceType: "image",
          transformId: "center",
          layer: 90,
          x: 10,
        },
      ],
    },
  );
  return state;
};

const findVisualIndex = (state, visualId) =>
  selectSelectedVisuals({ state }).findIndex(
    (visual) => visual.id === visualId,
  );

describe("commandLineVisual list and edit view", () => {
  it("lists visuals as read-only rows and builds no edit form", () => {
    const state = createState();
    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.mode).toBe("current");
    expect(viewData.form.fields).toEqual([]);
    expect(viewData.editingVisuals).toEqual([]);
    expect(
      viewData.visualListItems.map((visual) => ({
        displayName: visual.displayName,
        details: visual.details,
        effects: visual.effects,
      })),
    ).toEqual([
      {
        displayName: "Image Two",
        details: [
          { label: "Layout", value: "Custom Layout" },
          { label: "Layer", value: "Foreground" },
          { label: "Transform", value: "Custom" },
        ],
        effects: [],
      },
      {
        displayName: "Image One",
        details: [
          { label: "Layout", value: "Custom Layout" },
          { label: "Layer", value: "Behind Dialogue" },
          { label: "Transform", value: "Center" },
          { label: "Animation", value: "Fade" },
        ],
        effects: ["Opacity", "Flip X"],
      },
    ]);
  });

  it("shows each visual's picture from the canvas, and waits for one it does not have yet", () => {
    const state = createState();
    const props = {
      visualSnapshots: { "visual-one": "data:image/png;base64,b25l" },
    };
    const rows = selectViewData({
      state,
      props,
      i18n: EN_I18N,
    }).visualListItems;
    const pictureOf = (visualId) => {
      const row = rows.find((visual) => visual.id === visualId);
      return { snapshotUrl: row.snapshotUrl, awaits: row.awaitsSnapshot };
    };

    expect(pictureOf("visual-one")).toEqual({
      snapshotUrl: "data:image/png;base64,b25l",
      awaits: false,
    });
    // Its picture is not taken yet: it shows none, not its first resource.
    expect(pictureOf("visual-two")).toEqual({
      snapshotUrl: undefined,
      awaits: true,
    });

    // One the canvas could not take a picture of shows its first resource.
    const [withoutPicture] = selectViewData({
      state,
      props: { visualSnapshots: { "visual-two": undefined } },
      i18n: EN_I18N,
    }).visualListItems;
    expect(withoutPicture.id).toBe("visual-two");
    expect(withoutPicture.awaitsSnapshot).toBe(false);
    expect(withoutPicture.fileId).toBeDefined();

    // Without pictures, as without a canvas, it shows its first resource.
    const [withoutPictures] = selectViewData({
      state,
      props: {},
      i18n: EN_I18N,
    }).visualListItems;
    expect(withoutPictures.awaitsSnapshot).toBe(false);
    expect(withoutPictures.fileId).toBeDefined();
  });

  it("puts the picture first in the list rows and in Edit Visual", async () => {
    const { readFile } = await import("node:fs/promises");
    const view = await readFile(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const lines = view.split("\n");
    const pictureLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes("$if visual.snapshotUrl:"));
    expect(pictureLines).toHaveLength(2);
    for (const { index } of pictureLines) {
      expect(lines.slice(index, index + 6).join("\n")).toMatch(
        /rtgl-image src=\$\{visual\.snapshotUrl\} w=f h=f of=con[\s\S]*\$elif visual\.awaitsSnapshot:/,
      );
    }
  });

  it("localizes the read-only row labels", () => {
    const state = createState();
    const [row] = selectViewData({ state, i18n: JA_I18N }).visualListItems;

    expect(row.displayName).toBe("Image Two");
    expect(row.details).toEqual([
      { label: "レイアウト", value: "カスタムレイアウト" },
      { label: "レイヤー", value: "最前面" },
      { label: "トランスフォーム", value: "カスタム" },
    ]);
  });

  it("opens the clicked visual in the edit view with only its controls", () => {
    const state = createState();
    const render = vi.fn();
    const index = findVisualIndex(state, "visual-one");

    handleVisualListItemClick(
      { store: createStoreApi(state), render },
      indexEvent(index),
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(selectMode({ state })).toBe("edit");
    expect(selectEditingVisualId({ state })).toBe("visual-one");
    expect(viewData.editingVisuals.map((visual) => visual.id)).toEqual([
      "visual-one",
    ]);
    expect(viewData.form.fields).toHaveLength(1);
    expect(viewData.form.fields[0]).toMatchObject({
      id: `visual-${index}`,
      label: "Image One",
    });
    expect(viewData.breadcrumb.map((item) => item.label)).toEqual([
      "Actions",
      "Visuals",
      "Edit Visual",
    ]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("puts the visuals back on Cancel and keeps the edits on Save", () => {
    const state = createState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const deps = { store: createStoreApi(state), render, dispatchEvent };

    handleVisualListItemClick(deps, indexEvent(1));
    handleOpacityInput(deps, {
      _event: {
        currentTarget: { dataset: { index: "1" } },
        detail: { value: 0.25 },
      },
    });
    handleLayerChange(deps, {
      _event: {
        currentTarget: { dataset: { index: "1" } },
        detail: { value: 10 },
      },
    });
    expect(selectSelectedVisuals({ state })[1]).toMatchObject({
      id: "visual-one",
      layer: 10,
      opacity: 0.25,
    });

    handleCancelEditClick(deps);

    expect(selectMode({ state })).toBe("current");
    expect(selectEditingVisualId({ state })).toBeUndefined();
    expect(
      selectSelectedVisuals({ state }).map((visual) => ({
        id: visual.id,
        layer: visual.layer,
        opacity: visual.opacity,
      })),
    ).toEqual([
      { id: "visual-two", layer: 90, opacity: undefined },
      { id: "visual-one", layer: 50, opacity: 0.5 },
    ]);
    const cancelPreview =
      dispatchEvent.mock.lastCall[0].detail.presentationState.visual.items;
    expect(
      cancelPreview.find((item) => item.id === "visual-one"),
    ).toMatchObject({ layer: 50, opacity: 0.5 });

    handleVisualListItemClick(deps, indexEvent(1));
    handleOpacityInput(deps, {
      _event: {
        currentTarget: { dataset: { index: "1" } },
        detail: { value: 0.25 },
      },
    });
    handleSaveVisualClick(deps);

    expect(selectMode({ state })).toBe("current");
    expect(selectEditingVisualId({ state })).toBeUndefined();
    expect(selectSelectedVisuals({ state })[1]).toMatchObject({
      id: "visual-one",
      opacity: 0.25,
    });
  });

  it("discards an open edit when the Visuals breadcrumb is clicked", () => {
    const state = createState();
    const deps = {
      store: createStoreApi(state),
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    handleVisualListItemClick(deps, indexEvent(1));
    handleOpacityInput(deps, {
      _event: {
        currentTarget: { dataset: { index: "1" } },
        detail: { value: 0.9 },
      },
    });
    handleBreadcumbClick(deps, { _event: { detail: { id: "current" } } });

    expect(selectMode({ state })).toBe("current");
    expect(selectSelectedVisuals({ state })[1].opacity).toBe(0.5);
  });
});

// A visual's layout is edited in the scene editor's layout editor, which the
// panel asks for, and the panel opens again where it asked from.
describe("commandLineVisual layout editing", () => {
  // The panel's store, as the component gives it to its handlers.
  const createFullStoreApi = (state) =>
    new Proxy(
      {},
      {
        get: (_target, name) => (payload) =>
          visualStore[name]({ state, i18n: EN_I18N }, payload),
      },
    );

  it("adds a visual as an empty layout and asks for its layout editor at once", () => {
    const state = createState();
    const dispatchEvent = vi.fn();

    handleAddVisualClick({ store: createFullStoreApi(state), dispatchEvent });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe("visual-layout-edit");
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    const { actions, visualId, returnToEditView } = event.detail;
    expect(visualId).toMatch(/^visual-/);
    expect(returnToEditView).toBe(false);
    // The new visual is saved with the others: an empty layout on the
    // screen, with no transform, in the default layer.
    const newItem = actions.visual.items.find((item) => item.id === visualId);
    expect(newItem).toEqual({
      id: visualId,
      layer: 50,
      layout: {
        layoutSchemaVersion: 2,
        elements: { items: {}, tree: [] },
      },
    });
    expect(actions.visual.items.map((item) => item.id)).toEqual([
      "visual-two",
      "visual-one",
      visualId,
    ]);
    expect(selectMode({ state })).toBe("current");
  });

  it("keeps the visual's edits and asks to come back to its edit view from Edit Layout", () => {
    const state = createState();
    const dispatchEvent = vi.fn();
    const deps = {
      store: createFullStoreApi(state),
      render: vi.fn(),
      dispatchEvent,
    };

    handleVisualListItemClick(deps, indexEvent(1));
    handleOpacityInput(deps, {
      _event: {
        currentTarget: { dataset: { index: "1" } },
        detail: { value: 0.25 },
      },
    });
    dispatchEvent.mockClear();
    handleEditLayoutClick(deps, {
      _event: { currentTarget: { dataset: { visualId: "visual-one" } } },
    });

    expect(selectMode({ state })).toBe("current");
    expect(selectEditingVisualId({ state })).toBeUndefined();
    const event = dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe("visual-layout-edit");
    expect(event.detail).toMatchObject({
      visualId: "visual-one",
      returnToEditView: true,
    });
    expect(
      event.detail.actions.visual.items.find(
        (item) => item.id === "visual-one",
      ),
    ).toMatchObject({ opacity: 0.25 });
  });

  it("opens a visual saved with one image as the layout it is saved as", () => {
    const state = createInitialState();
    const collection = (items) => ({
      items: Object.fromEntries(items.map((item) => [item.id, item])),
      tree: items.map((item) => ({ id: item.id })),
    });
    const dispatchEvent = vi.fn();
    const deps = {
      store: createFullStoreApi(state),
      render: vi.fn(),
      dispatchEvent,
      projectService: {
        getState: () => ({
          images: collection([
            {
              id: "image-one",
              type: "image",
              name: "Image One",
              width: 400,
              height: 600,
            },
          ]),
          transforms: collection([
            {
              id: "bottom-left",
              type: "transform",
              name: "Bottom Left",
              x: 300,
              y: 1080,
              anchorX: 0.5,
              anchorY: 1,
            },
          ]),
        }),
        getRepositoryState: () => ({}),
      },
      props: {
        presentationState: {
          visual: {
            items: [
              {
                id: "visual-one",
                resourceId: "image-one",
                resourceType: "image",
                transformId: "bottom-left",
                layer: 50,
                opacity: 0.5,
              },
            ],
          },
        },
      },
    };

    handleBeforeMount(deps);

    // Its placement is in its layout, and the visual is centered on the
    // screen, so it is drawn where it was.
    const [visual] = selectSelectedVisuals({ state });
    expect(visual.resourceId).toBeUndefined();
    expect(visual.transformId).toBeUndefined();
    expect(visual.opacity).toBe(0.5);
    const [{ id: elementId }] = visual.layout.elements.tree;
    expect(visual.layout.elements.items[elementId]).toMatchObject({
      type: "sprite",
      imageId: "image-one",
      x: 300,
      y: 1080,
      anchorX: 0.5,
      anchorY: 1,
    });
    const [row] = selectViewData({ state, i18n: EN_I18N }).visualListItems;
    expect(row.details).toEqual(
      expect.arrayContaining([
        { label: "Layout", value: "Custom Layout" },
        { label: "Transform", value: "Screen Center" },
      ]),
    );

    // Once shown, the canvas draws it converted too, for its picture.
    handleAfterMount(deps);
    const [preview] = dispatchEvent.mock.calls[0];
    expect(preview.type).toBe("temporary-presentation-state-change");
    expect(preview.detail.presentationState.visual.items).toEqual([
      expect.objectContaining({ id: "visual-one", layout: visual.layout }),
    ]);

    // Submit saves it in that form, also when nothing was changed.
    handleSubmitClick(deps);
    const [submit] = dispatchEvent.mock.calls[1];
    expect(submit.type).toBe("submit");
    expect(submit.detail.visual.items).toEqual([
      expect.objectContaining({
        id: "visual-one",
        layer: 50,
        opacity: 0.5,
        layout: visual.layout,
      }),
    ]);
    expect(submit.detail.visual.items[0]).not.toHaveProperty("resourceId");
  });

  it("keeps a visual that would look different as a layout as it is saved, until its layout is edited", () => {
    const state = createInitialState();
    const collection = (items) => ({
      items: Object.fromEntries(items.map((item) => [item.id, item])),
      tree: items.map((item) => ({ id: item.id })),
    });
    const dispatchEvent = vi.fn();
    const deps = {
      store: createFullStoreApi(state),
      render: vi.fn(),
      dispatchEvent,
      projectService: {
        getState: () => ({
          images: collection([
            { id: "image-one", type: "image", name: "Image One" },
          ]),
          animations: collection([
            {
              id: "slide-in",
              type: "animation",
              name: "Slide In",
              animation: {
                type: "transition",
                next: { tween: { x: { keyframes: [] } } },
              },
            },
          ]),
          transforms: collection([
            {
              id: "bottom-left",
              type: "transform",
              name: "Bottom Left",
              x: 300,
              y: 1080,
              anchorX: 0.5,
              anchorY: 1,
            },
          ]),
        }),
        getRepositoryState: () => ({}),
      },
      props: {
        presentationState: {
          visual: {
            items: [
              {
                id: "visual-one",
                resourceId: "image-one",
                resourceType: "image",
                transformId: "bottom-left",
                layer: 50,
                animations: {
                  resourceId: "slide-in",
                  playback: { continuity: "render", speed: 1 },
                },
              },
            ],
          },
        },
      },
    };

    handleBeforeMount(deps);
    handleAfterMount(deps);

    // Its slide would move the whole screen layer: it stays an image, and
    // the canvas is left as it is.
    const [visual] = selectSelectedVisuals({ state });
    expect(visual).toMatchObject({
      resourceId: "image-one",
      transformId: "bottom-left",
    });
    expect(visual).not.toHaveProperty("layout");
    expect(dispatchEvent).not.toHaveBeenCalled();

    // Submit saves it as it was saved.
    handleSubmitClick(deps);
    const [submit] = dispatchEvent.mock.calls[0];
    expect(submit.detail.visual.items[0]).toMatchObject({
      resourceId: "image-one",
      transformId: "bottom-left",
    });
    expect(submit.detail.visual.items[0]).not.toHaveProperty("layout");

    // Edit Layout makes it a custom layout, placed where it was.
    handleEditLayoutClick(deps, {
      _event: { currentTarget: { dataset: { visualId: "visual-one" } } },
    });
    const [edit] = dispatchEvent.mock.calls[1];
    expect(edit.type).toBe("visual-layout-edit");
    const [editedItem] = edit.detail.actions.visual.items;
    expect(editedItem).not.toHaveProperty("resourceId");
    expect(editedItem).not.toHaveProperty("transformId");
    expect(editedItem.animations.resourceId).toBe("slide-in");
    const [{ id: elementId }] = editedItem.layout.elements.tree;
    expect(editedItem.layout.elements.items[elementId]).toMatchObject({
      type: "sprite",
      imageId: "image-one",
      x: 300,
      y: 1080,
    });
  });

  it("leaves the canvas alone when every visual is already a layout", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const deps = {
      store: createFullStoreApi(state),
      render: vi.fn(),
      dispatchEvent,
      projectService: {
        getState: () => ({}),
        getRepositoryState: () => ({}),
      },
      props: {
        visual: {
          items: [
            {
              id: "visual-one",
              layer: 50,
              layout: {
                layoutSchemaVersion: 2,
                elements: { items: {}, tree: [] },
              },
            },
          ],
        },
      },
    };

    handleBeforeMount(deps);
    handleAfterMount(deps);

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("opens in the edit view of the visual it is given, as it comes back from Edit Layout", () => {
    const state = createInitialState();
    const collection = (items) => ({
      items: Object.fromEntries(items.map((item) => [item.id, item])),
      tree: items.map((item) => ({ id: item.id })),
    });
    const deps = {
      store: createFullStoreApi(state),
      render: vi.fn(),
      projectService: {
        getState: () => ({
          images: collection([
            { id: "image-one", type: "image", name: "Image One" },
          ]),
        }),
        getRepositoryState: () => ({}),
      },
      props: {
        visual: {
          items: [
            { id: "visual-one", resourceId: "image-one", layer: 50 },
            { id: "visual-two", resourceId: "image-one", layer: 90 },
          ],
        },
        editVisualId: "visual-one",
      },
    };

    // Before its first render, so it never shows the list first.
    handleBeforeMount(deps);

    expect(selectMode({ state })).toBe("edit");
    expect(selectEditingVisualId({ state })).toBe("visual-one");
    expect(deps.render).not.toHaveBeenCalled();

    // Without one, it opens on the list.
    const listState = createInitialState();
    handleBeforeMount({
      ...deps,
      store: createFullStoreApi(listState),
      props: { visual: deps.props.visual },
    });
    expect(selectMode({ state: listState })).toBe("current");
  });
});

describe("commandLineVisual project layouts", () => {
  it("copies a project layout as it is saved, with its elements as items and a tree", () => {
    const state = createInitialState();
    const savedLayout = {
      id: "title-card",
      type: "layout",
      layoutType: "general",
      name: "Title Card",
      layoutSchemaVersion: 2,
      elements: {
        items: { caption: { type: "text", text: "Hello" } },
        tree: [{ id: "caption" }],
      },
    };
    const deps = {
      store: new Proxy(
        {},
        {
          get: (_target, name) => (payload) =>
            visualStore[name]({ state, i18n: EN_I18N }, payload),
        },
      ),
      render: vi.fn(),
      dispatchEvent: vi.fn(),
      projectService: {
        // The domain state gives a layout's elements in another form.
        getState: () => ({
          layouts: {
            items: {
              "title-card": {
                ...savedLayout,
                elements: {
                  caption: {
                    type: "text",
                    text: "Hello",
                    parentId: null,
                    children: [],
                  },
                },
              },
            },
            tree: [{ id: "title-card" }],
          },
        }),
        getRepositoryState: () => ({
          layouts: {
            items: { "title-card": savedLayout },
            tree: [{ id: "title-card" }],
          },
        }),
      },
      props: {
        visual: {
          items: [
            {
              id: "visual-one",
              resourceId: "title-card",
              resourceType: "layout",
              layer: 50,
            },
          ],
        },
      },
    };

    handleBeforeMount(deps);
    handleLayoutChange(deps, {
      _event: {
        currentTarget: { dataset: { index: "0" } },
        detail: { value: "custom" },
      },
    });

    expect(selectSelectedVisuals({ state })[0].layout.elements).toEqual(
      savedLayout.elements,
    );
  });
});

describe("commandLineVisual list view", () => {
  it("opens visuals from the list rows and keeps the edit controls out of the list", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const listBlock = view.slice(
      view.indexOf("$if mode == 'current':"),
      view.indexOf("$if mode == 'edit':"),
    );

    expect(listBlock).toContain("$for visual, i in visualListItems:");
    expect(listBlock).toContain("rtgl-view#visualItem${i} data-index=");
    expect(listBlock).not.toContain("rtgl-form#form");
    expect(listBlock).not.toContain("rtgl-select#layer");
    expect(view).toContain("handler: handleVisualListItemClick");
    expect(view).toContain("$for visual, i in editingVisuals:");
    expect(view).toContain("rtgl-button#cancelEditButton");
    expect(view).toContain("rtgl-button#saveVisualButton");
  });
});

describe("commandLineVisual layout choice", () => {
  const titleCardLayout = {
    id: "title-card",
    type: "layout",
    layoutType: "general",
    name: "Title Card",
    layoutSchemaVersion: 2,
    elements: {
      items: {
        frame: { type: "sprite", imageId: "image-two", x: 100, y: 50 },
        caption: { type: "text", text: "Hello" },
      },
      tree: [{ id: "frame" }, { id: "caption" }],
    },
  };

  const createLayoutState = () => {
    const state = createState();
    setLayouts(
      { state },
      {
        layouts: {
          items: {
            menus: { id: "menus", type: "folder", name: "Menus" },
            "title-card": titleCardLayout,
            "dialogue-box": {
              id: "dialogue-box",
              type: "layout",
              layoutType: "dialogue-adv",
              name: "Dialogue Box",
            },
          },
          tree: [
            { id: "menus", children: [{ id: "title-card" }] },
            { id: "dialogue-box" },
          ],
        },
      },
    );
    return state;
  };

  const createDeps = (state) => ({
    store: new Proxy(
      {},
      {
        get: (_target, name) => (payload) =>
          visualStore[name]({ state, i18n: EN_I18N }, payload),
      },
    ),
    render: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  const layoutEvent = (index, value) => ({
    _event: {
      currentTarget: { dataset: { index: String(index) } },
      detail: { value },
    },
  });

  const findEditingVisual = (state) =>
    selectViewData({ state, i18n: EN_I18N }).editingVisuals[0];

  it("offers a custom layout and the project's general layouts", () => {
    const state = createLayoutState();

    expect(
      selectViewData({ state, i18n: EN_I18N }).defaultValues.layoutOptions,
    ).toEqual([
      { value: "custom", label: "Custom Layout" },
      { value: "title-card", label: "Menus > Title Card" },
    ]);
    expect(
      selectViewData({ state, i18n: JA_I18N }).defaultValues.layoutOptions[0]
        .label,
    ).toBe("カスタムレイアウト");
  });

  it("shows a project layout by reference and offers Edit Layout only for a custom one", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");

    handleVisualListItemClick(deps, indexEvent(index));
    expect(findEditingVisual(state)).toMatchObject({
      layoutValue: "custom",
      isCustomLayout: true,
    });

    handleLayoutChange(deps, layoutEvent(index, "title-card"));

    const visual = selectSelectedVisuals({ state })[index];
    expect(visual).toMatchObject({
      id: "visual-one",
      resourceId: "title-card",
      resourceType: "layout",
      layer: 50,
      opacity: 0.5,
    });
    expect(visual).not.toHaveProperty("layout");
    expect(findEditingVisual(state)).toMatchObject({
      layoutValue: "title-card",
      isCustomLayout: false,
      displayName: "Title Card",
    });
    // The preview gets the reference, not a copy of the layout.
    const event = deps.dispatchEvent.mock.calls.at(-1)[0];
    expect(event.type).toBe("temporary-presentation-state-change");
    const previewItem = event.detail.presentationState.visual.items.find(
      (item) => item.id === "visual-one",
    );
    expect(previewItem).toMatchObject({
      resourceId: "title-card",
      resourceType: "layout",
    });
    expect(previewItem).not.toHaveProperty("layout");
  });

  it("starts a custom layout from a copy of the project layout it showed", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");

    handleVisualListItemClick(deps, indexEvent(index));
    handleLayoutChange(deps, layoutEvent(index, "title-card"));
    handleLayoutChange(deps, layoutEvent(index, "custom"));

    const visual = selectSelectedVisuals({ state })[index];
    expect(visual).not.toHaveProperty("resourceId");
    expect(visual).not.toHaveProperty("resourceType");
    expect(visual.layout.elements).toEqual(titleCardLayout.elements);
    expect(visual.layout.elements.items.frame).not.toBe(
      titleCardLayout.elements.items.frame,
    );
    expect(findEditingVisual(state)).toMatchObject({
      layoutValue: "custom",
      isCustomLayout: true,
    });

    // The component runs its store actions on a draft, as here.
    const linkedState = createLayoutState();
    visualStore.updateVisualLayout(
      { state: linkedState },
      { index, layoutId: "title-card" },
    );
    const nextState = produce(linkedState, (draft) => {
      visualStore.updateVisualLayout(
        { state: draft },
        { index, layoutId: "custom" },
      );
    });
    expect(nextState.selectedVisuals[index].layout.elements).toEqual(
      titleCardLayout.elements,
    );

    // Choosing Custom Layout again keeps the visual's own layout.
    const ownLayout = visual.layout;
    handleLayoutChange(deps, layoutEvent(index, "custom"));
    expect(selectSelectedVisuals({ state })[index].layout).toBe(ownLayout);
  });

  it("brings back the visual's own custom layout when Custom Layout is chosen again", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");

    handleVisualListItemClick(deps, indexEvent(index));
    handleLayoutChange(deps, layoutEvent(index, "custom"));
    const ownLayout = toPlainObject(selectSelectedVisuals({ state })[index]);
    expect(ownLayout.layout.elements.items.content).toMatchObject({
      type: "sprite",
      imageId: "image-one",
    });

    handleLayoutChange(deps, layoutEvent(index, "title-card"));
    handleLayoutChange(deps, layoutEvent(index, "custom"));

    const visual = selectSelectedVisuals({ state })[index];
    expect(visual.layout).toEqual(ownLayout.layout);
    expect(visual).not.toHaveProperty("resourceId");
    expect(visual).not.toHaveProperty("resourceType");

    // The same on a draft, as the component runs its store actions.
    const draftState = produce(createLayoutState(), (draft) => {
      visualStore.updateVisualLayout(
        { state: draft },
        { index, layoutId: "custom" },
      );
    });
    const linkedState = produce(draftState, (draft) => {
      visualStore.updateVisualLayout(
        { state: draft },
        { index, layoutId: "title-card" },
      );
    });
    const restoredState = produce(linkedState, (draft) => {
      visualStore.updateVisualLayout(
        { state: draft },
        { index, layoutId: "custom" },
      );
    });
    expect(restoredState.selectedVisuals[index].layout).toEqual(
      draftState.selectedVisuals[index].layout,
    );

    // A panel opened again does not keep it.
    visualStore.updateVisualLayout(
      { state },
      { index, layoutId: "title-card" },
    );
    visualStore.setExistingVisuals(
      { state },
      { visuals: toPlainObject(state.selectedVisuals) },
    );
    visualStore.updateVisualLayout({ state }, { index, layoutId: "custom" });
    expect(selectSelectedVisuals({ state })[index].layout.elements).toEqual(
      titleCardLayout.elements,
    );
  });

  it("puts the project layout back on Cancel", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");

    handleVisualListItemClick(deps, indexEvent(index));
    handleLayoutChange(deps, layoutEvent(index, "title-card"));
    handleCancelEditClick(deps);

    expect(selectSelectedVisuals({ state })[index]).toMatchObject({
      resourceId: "image-one",
      resourceType: "image",
    });
  });

  it("says which layout each visual in the list shows", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");

    handleVisualListItemClick(deps, indexEvent(index));
    handleLayoutChange(deps, layoutEvent(index, "title-card"));
    handleSaveVisualClick(deps);

    const rows = selectViewData({ state, i18n: EN_I18N }).visualListItems;
    const layoutDetail = (visualId) =>
      rows
        .find((row) => row.id === visualId)
        .details.find((detail) => detail.label === "Layout").value;
    expect(layoutDetail("visual-one")).toBe("Title Card");
    expect(layoutDetail("visual-two")).toBe("Custom Layout");
  });

  it("submits a project layout by reference and a custom layout as the visual's own", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");

    handleVisualListItemClick(deps, indexEvent(index));
    handleLayoutChange(deps, layoutEvent(index, "title-card"));
    handleSaveVisualClick(deps);
    deps.dispatchEvent.mockClear();
    handleSubmitClick(deps);

    const { items } = deps.dispatchEvent.mock.calls[0][0].detail.visual;
    const linked = items.find((item) => item.id === "visual-one");
    expect(linked).toMatchObject({
      resourceId: "title-card",
      resourceType: "layout",
      transformId: "center",
    });
    expect(linked).not.toHaveProperty("layout");
    // A visual saved with one image gets a custom layout that shows it.
    const custom = items.find((item) => item.id === "visual-two");
    expect(custom).not.toHaveProperty("resourceId");
    expect(custom.layout.elements.items.content).toMatchObject({
      type: "sprite",
      imageId: "image-two",
    });
  });

  it("names a custom layout that shows no resource Custom Layout", () => {
    const state = createLayoutState();
    const deps = createDeps(state);

    handleAddVisualClick(deps);

    const rowNames = (i18n) =>
      selectViewData({ state, i18n }).visualListItems.map(
        (row) => row.displayName,
      );
    expect(rowNames(EN_I18N)).toContain("Custom Layout");
    expect(rowNames(JA_I18N)).toContain("カスタムレイアウト");
  });

  it("shows Edit Layout in the view only for a custom layout", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "rtgl-select#layoutSelect${visual.controlId} data-index=${visual.visualIndex}",
    );
    expect(view).toMatch(
      /\$if visual\.isCustomLayout:\n\s+- rtgl-button#editLayoutButton/,
    );
  });
});
