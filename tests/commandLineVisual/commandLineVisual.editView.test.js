import { readFileSync } from "node:fs";
import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import {
  handleAddVisualClick,
  handleAddVisualFormAction,
  handleAddVisualPopoverClose,
  handleAfterMount,
  handleBeforeMount,
  handleBreadcumbClick,
  handleCancelEditClick,
  handleDropdownMenuClickItem,
  handleLayoutImageClick,
  handleLayoutSelectConfirmClick,
  handleLayoutSelectItemClick,
  handleLayoutTypeChange,
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

// Changes a visual's layout the way the panel does: Layout Type for a custom
// layout, the layout gallery for a project layout.
const handleLayoutChange = (deps, payload) => {
  const { index } = payload._event.currentTarget.dataset;
  const { value } = payload._event.detail;
  if (value === "custom") {
    handleLayoutTypeChange(deps, payload);
    return;
  }

  const visual = deps.store.selectSelectedVisuals()[Number(index)];
  deps.store.openLayoutSelect({ visualId: visual.id });
  handleLayoutSelectItemClick(deps, {
    _event: { currentTarget: { dataset: { resourceId: value } } },
  });
  handleLayoutSelectConfirmClick(deps);
};

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
          { label: "Transform", value: "Custom" },
        ],
        effects: [],
      },
      {
        displayName: "Image One",
        details: [
          { label: "Layout", value: "Custom Layout" },
          { label: "Transform", value: "Center" },
          { label: "Animation", value: "Fade" },
        ],
        effects: ["Opacity", "Flip X"],
      },
    ]);
    // Each row sits under its layer, front layer first; a layer without a
    // visual has no heading.
    expect(
      viewData.visualListGroups.map((group) => ({
        label: group.label,
        visuals: group.visuals.map((visual) => [
          visual.listIndex,
          visual.displayName,
        ]),
      })),
    ).toEqual([
      { label: "Foreground", visuals: [[0, "Image Two"]] },
      { label: "Behind Dialogue", visuals: [[1, "Image One"]] },
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
      .filter(({ line }) => /\$(el)?if visual\.snapshotUrl:/.test(line));
    expect(pictureLines).toHaveLength(2);
    for (const { index } of pictureLines) {
      expect(lines.slice(index, index + 6).join("\n")).toMatch(
        /rtgl-image src=\$\{visual\.snapshotUrl\} w=f h=f of=con[\s\S]*\$elif visual\.awaitsSnapshot:/,
      );
    }
  });

  it("localizes the read-only row labels", () => {
    const state = createState();
    const viewData = selectViewData({ state, i18n: JA_I18N });
    const [row] = viewData.visualListItems;

    expect(viewData.visualListGroups[0].label).toBe("最前面");
    expect(row.displayName).toBe("Image Two");
    expect(row.details).toEqual([
      { label: "レイアウト", value: "カスタムレイアウト" },
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
    // The Edit Visual page has no title.
    expect(viewData.form.fields[0].id).toBe(`visual-${index}`);
    expect(viewData.form.fields[0].label).toBeUndefined();
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
    visualStore.updateVisualLayer({ state }, { index: 1, layer: 10 });
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

  const addButtonClick = {
    _event: {
      currentTarget: {
        getBoundingClientRect: () => ({ left: 12, bottom: 340 }),
      },
    },
  };
  const addVisualSubmit = (layer) => ({
    _event: { detail: { actionId: "submit", values: { layer } } },
  });

  it("asks for the layer in a popover under Add Visual before adding anything", () => {
    const state = createState();
    const deps = {
      store: createFullStoreApi(state),
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    const visualCount = selectSelectedVisuals({ state }).length;

    handleAddVisualClick(deps, addButtonClick);

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.addVisualPopover).toEqual({
      isOpen: true,
      position: { x: 12, y: 340 },
    });
    expect(viewData.addVisualForm.title).toBe("Add Visual");
    expect(viewData.addVisualForm.fields.map((field) => field.name)).toEqual([
      "layoutType",
      "layoutId",
      "layer",
    ]);
    expect(selectSelectedVisuals({ state })).toHaveLength(visualCount);
    expect(deps.dispatchEvent).not.toHaveBeenCalled();

    // Closing the popover adds nothing.
    handleAddVisualPopoverClose(deps);
    expect(
      selectViewData({ state, i18n: EN_I18N }).addVisualPopover.isOpen,
    ).toBe(false);
    expect(selectSelectedVisuals({ state })).toHaveLength(visualCount);
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("adds the visual on the chosen layer", () => {
    const state = createState();
    const deps = {
      store: createFullStoreApi(state),
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    handleAddVisualClick(deps, addButtonClick);
    handleAddVisualFormAction(deps, addVisualSubmit(70));

    const { actions, visualId } = deps.dispatchEvent.mock.calls[0][0].detail;
    expect(
      actions.visual.items.find((item) => item.id === visualId),
    ).toMatchObject({ layer: 70 });
    expect(
      selectViewData({ state, i18n: EN_I18N }).addVisualPopover.isOpen,
    ).toBe(false);
  });

  it("adds a visual as an empty layout and asks for its layout editor at once", () => {
    const state = createState();
    const dispatchEvent = vi.fn();

    handleAddVisualFormAction(
      { store: createFullStoreApi(state), dispatchEvent },
      addVisualSubmit(50),
    );

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
    handleLayoutImageClick(deps, {
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
    handleLayoutImageClick(deps, {
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

    expect(listBlock).toContain("$for group, g in visualListGroups:");
    expect(listBlock).toContain("rtgl-text s=sm c=mu-fg: ${group.label}");
    expect(listBlock).toContain("$for visual, i in group.visuals:");
    expect(listBlock).toContain(
      "rtgl-view#visualItem${visual.listIndex} data-index=",
    );
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

  it("offers the project's general layouts to a visual that shows one", () => {
    const state = createLayoutState();

    expect(
      selectViewData({ state, i18n: EN_I18N }).defaultValues.layoutOptions,
    ).toEqual([{ value: "title-card", label: "Menus > Title Card" }]);
  });

  it("moves a visual to the layer chosen under Move Layer", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");

    deps.store.showDropdownMenu({
      position: { x: 0, y: 0 },
      visualIndex: index,
    });
    handleDropdownMenuClickItem(deps, {
      _event: { detail: { item: { value: "move-to-layer", layer: 10 } } },
    });

    expect(
      selectSelectedVisuals({ state }).find(
        (visual) => visual.id === "visual-one",
      ).layer,
    ).toBe(10);
    expect(selectViewData({ state, i18n: EN_I18N }).dropdownMenu.isOpen).toBe(
      false,
    );
    expect(
      selectViewData({ state, i18n: EN_I18N }).visualListGroups.at(-1),
    ).toMatchObject({
      label: "Behind Background",
      visuals: [{ id: "visual-one" }],
    });
  });

  it("asks in Add Visual for a custom layout or an existing one", () => {
    const state = createLayoutState();
    const viewData = selectViewData({ state, i18n: EN_I18N });
    const [layoutType, layoutId, layer] = viewData.addVisualForm.fields;

    expect(layoutType).toMatchObject({
      name: "layoutType",
      type: "segmented-control",
      label: "Layout",
      options: [
        { value: "custom", label: "Custom Layout" },
        { value: "existing", label: "Existing Layout" },
      ],
    });
    expect(layoutId).toMatchObject({
      $when: 'layoutType == "existing"',
      name: "layoutId",
      label: "Existing Layout",
      placeholder: "Select layout",
      required: true,
      options: [{ value: "title-card", label: "Menus > Title Card" }],
    });
    expect(layer.name).toBe("layer");
    expect(viewData.addVisualDefaultValues).toEqual({
      layoutType: "custom",
      layer: 50,
    });
    expect(
      selectViewData({
        state,
        i18n: JA_I18N,
      }).addVisualForm.fields[0].options.map((option) => option.label),
    ).toEqual(["カスタムレイアウト", "既存のレイアウト"]);
  });

  it("adds an existing layout visual to the list without opening the layout editor", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const submit = (values) => ({
      _event: { detail: { actionId: "submit", values } },
    });

    // Without a layout chosen nothing is added.
    handleAddVisualFormAction(
      deps,
      submit({ layoutType: "existing", layer: 70 }),
    );
    expect(deps.dispatchEvent).not.toHaveBeenCalled();

    handleAddVisualFormAction(
      deps,
      submit({ layoutType: "existing", layoutId: "title-card", layer: 70 }),
    );

    const added = selectSelectedVisuals({ state }).find(
      (visual) => visual.resourceId === "title-card",
    );
    expect(added).toMatchObject({ resourceType: "layout", layer: 70 });
    expect(added).not.toHaveProperty("layout");
    expect(deps.dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual([
      "temporary-presentation-state-change",
    ]);
    expect(deps.render).toHaveBeenCalled();
    const row = selectViewData({ state, i18n: EN_I18N }).visualListItems.find(
      (item) => item.id === added.id,
    );
    expect(row).toMatchObject({ isCustomLayout: false });
  });

  it("shows a project layout by reference and keeps a custom one as its own", () => {
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

  it("opens the layout editor from a custom layout picture and the layout list from an existing one", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");
    const pictureClick = {
      _event: {
        currentTarget: {
          dataset: { visualId: "visual-one" },
          getBoundingClientRect: () => ({ left: 20, bottom: 300 }),
        },
      },
    };
    const layoutEdits = () =>
      deps.dispatchEvent.mock.calls.filter(
        ([event]) => event.type === "visual-layout-edit",
      );

    handleVisualListItemClick(deps, indexEvent(index));

    // The picture of a project layout opens the layout gallery, with the
    // layout it shows picked, and no layout editor.
    handleLayoutChange(deps, layoutEvent(index, "title-card"));
    handleLayoutImageClick(deps, pictureClick);
    expect(layoutEdits()).toHaveLength(0);
    const gallery = selectViewData({ state, i18n: EN_I18N });
    expect(gallery.mode).toBe("layout-select");
    expect(gallery.breadcrumb.map((item) => item.label)).toEqual([
      "Actions",
      "Visuals",
      "Edit Visual",
      "Select layout",
    ]);
    expect(gallery.layoutSelectGroups).toMatchObject([
      {
        fullLabel: "Menus",
        children: [
          { id: "title-card", name: "Title Card", itemBorderColor: "pr" },
        ],
      },
    ]);
    expect(selectSelectedVisuals({ state })[index]).not.toHaveProperty(
      "layout",
    );

    // Edit Visual in the breadcrumb goes back without choosing.
    handleBreadcumbClick(deps, { _event: { detail: { id: "edit" } } });
    expect(selectViewData({ state, i18n: EN_I18N }).mode).toBe("edit");
    expect(selectSelectedVisuals({ state })[index].resourceId).toBe(
      "title-card",
    );

    handleLayoutChange(deps, layoutEvent(index, "custom"));
    handleLayoutImageClick(deps, pictureClick);
    expect(layoutEdits()).toHaveLength(1);
    expect(layoutEdits()[0][0].detail).toMatchObject({
      visualId: "visual-one",
      returnToEditView: true,
    });
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

    handleAddVisualFormAction(deps, {
      _event: { detail: { actionId: "submit", values: { layer: 50 } } },
    });

    const rowNames = (i18n) =>
      selectViewData({ state, i18n }).visualListItems.map(
        (row) => row.displayName,
      );
    expect(rowNames(EN_I18N)).toContain("Custom Layout");
    expect(rowNames(JA_I18N)).toContain("カスタムレイアウト");
  });

  it("has no Edit Layout button and offers Layout Type in the edit view", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).not.toContain("editLayoutButton");
    expect(view).toContain(
      "rtgl-segmented-control#layoutType${visual.controlId} data-index=${visual.visualIndex} w=f no-clear :selectedValue=${visual.layoutType} :options=${defaultValues.layoutTypeOptions}",
    );
    // No layout dropdown and no menu: the picture opens the layout gallery.
    expect(view).not.toContain("rtgl-select#layoutSelect");
    expect(view).not.toContain("layoutMenu");
    expect(view).toContain("$if mode == 'layout-select':");
    expect(view).toContain(
      "rtgl-view#layoutSelectItem${i}x${j} data-resource-id=${item.id} cur=pointer bw=xs bc=${item.itemBorderColor} h-bc=${item.itemHoverBorderColor} br=md",
    );
    expect(view).toContain(
      "rtgl-button#layoutSelectButton: ${selectButtonLabel}",
    );
    // A custom layout says Custom under its picture, an existing one its name.
    expect(view).toMatch(
      /\$elif visual\.isCustomLayout:\n\s+- rtgl-view w=f p=md:\n\s+- rtgl-text s=xs c=mu-fg ellipsis w=f: \$\{customLayoutLabel\}\n\s+\$else:\n\s+- rtgl-view w=f p=md:\n\s+- rtgl-text s=xs c=mu-fg ellipsis w=f: \$\{visual\.displayName\}/,
    );
    expect(
      selectViewData({ state: createState(), i18n: EN_I18N }).customLayoutLabel,
    ).toBe("Custom");
  });

  it("switches a visual between a custom layout and an existing one with Layout Type", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");
    const typeEvent = (value) => ({
      _event: {
        currentTarget: { dataset: { index: String(index) } },
        detail: { value },
      },
    });
    const layoutRow = () =>
      selectViewData({ state, i18n: EN_I18N }).form.fields[0].fields[0].fields;

    handleVisualListItemClick(deps, indexEvent(index));
    expect(findEditingVisual(state).layoutType).toBe("custom");
    expect(layoutRow()).toEqual([
      {
        type: "slot",
        slot: `visual-${index}-layout-type`,
        label: "Layout Type",
      },
      { type: "slot", slot: `visual-${index}-layout-spacer` },
    ]);
    expect(
      selectViewData({ state, i18n: EN_I18N }).defaultValues.layoutTypeOptions,
    ).toEqual([
      { value: "custom", label: "Custom Layout" },
      { value: "existing", label: "Existing Layout" },
    ]);

    // Existing Layout starts with no layout chosen: the visual keeps its
    // custom layout, and its picture asks for a layout.
    handleLayoutTypeChange(deps, typeEvent("existing"));
    expect(selectSelectedVisuals({ state })[index]).toMatchObject({
      resourceId: "image-one",
      resourceType: "image",
    });
    expect(findEditingVisual(state)).toMatchObject({
      layoutType: "existing",
      awaitsExistingLayout: true,
    });
    expect(selectViewData({ state, i18n: EN_I18N }).selectLayoutLabel).toBe(
      "Select layout",
    );

    // The picture opens the layout gallery with nothing picked, not the
    // layout editor.
    handleLayoutImageClick(deps, {
      _event: { currentTarget: { dataset: { visualId: "visual-one" } } },
    });
    expect(
      deps.dispatchEvent.mock.calls.filter(
        ([event]) => event.type === "visual-layout-edit",
      ),
    ).toHaveLength(0);
    const gallery = selectViewData({ state, i18n: EN_I18N });
    expect(gallery.mode).toBe("layout-select");
    expect(gallery.layoutSelectGroups[0].children[0].itemBorderColor).toBe(
      "bo",
    );

    // Select with nothing picked keeps the visual as it is.
    handleLayoutSelectConfirmClick(deps);
    expect(selectViewData({ state, i18n: EN_I18N }).mode).toBe("edit");
    expect(findEditingVisual(state).awaitsExistingLayout).toBe(true);

    handleLayoutImageClick(deps, {
      _event: { currentTarget: { dataset: { visualId: "visual-one" } } },
    });
    handleLayoutSelectItemClick(deps, {
      _event: { currentTarget: { dataset: { resourceId: "title-card" } } },
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).layoutSelectGroups[0].children[0]
        .itemBorderColor,
    ).toBe("pr");
    handleLayoutSelectConfirmClick(deps);
    expect(selectViewData({ state, i18n: EN_I18N }).mode).toBe("edit");
    expect(selectSelectedVisuals({ state })[index]).toMatchObject({
      resourceId: "title-card",
      resourceType: "layout",
    });
    expect(selectSelectedVisuals({ state })[index]).not.toHaveProperty(
      "layout",
    );
    expect(findEditingVisual(state)).toMatchObject({
      layoutType: "existing",
      awaitsExistingLayout: false,
    });
    expect(deps.dispatchEvent.mock.calls.at(-1)[0].type).toBe(
      "temporary-presentation-state-change",
    );

    // Custom Layout brings back the layout the visual had.
    handleLayoutTypeChange(deps, typeEvent("custom"));
    const visual = selectSelectedVisuals({ state })[index];
    expect(visual).not.toHaveProperty("resourceId");
    expect(visual.layout).toBeDefined();
    expect(findEditingVisual(state).layoutType).toBe("custom");
  });

  it("keeps the custom layout of a visual left on Existing Layout with none chosen", () => {
    const state = createLayoutState();
    const deps = createDeps(state);
    const index = findVisualIndex(state, "visual-one");
    const typeEvent = (value) => ({
      _event: {
        currentTarget: { dataset: { index: String(index) } },
        detail: { value },
      },
    });

    handleVisualListItemClick(deps, indexEvent(index));
    handleLayoutTypeChange(deps, typeEvent("existing"));
    handleSaveVisualClick(deps);

    expect(selectSelectedVisuals({ state })[index]).toMatchObject({
      resourceId: "image-one",
      resourceType: "image",
    });
    handleVisualListItemClick(deps, indexEvent(index));
    expect(findEditingVisual(state)).toMatchObject({
      layoutType: "custom",
      awaitsExistingLayout: false,
    });

    // Custom Layout again drops the pending choice.
    handleLayoutTypeChange(deps, typeEvent("existing"));
    handleLayoutTypeChange(deps, typeEvent("custom"));
    expect(findEditingVisual(state).layoutType).toBe("custom");
  });

  it("lists project layouts under their folders by their own names", () => {
    const state = createState();
    const layout = (id, name) => ({
      id,
      type: "layout",
      layoutType: "general",
      name,
    });
    setLayouts(
      { state },
      {
        layouts: {
          items: {
            loose: layout("loose", "Loose"),
            menus: { id: "menus", type: "folder", name: "Menus" },
            title: layout("title", "Title"),
            deep: { id: "deep", type: "folder", name: "Deep" },
            credits: layout("credits", "Credits"),
            hud: { id: "hud", type: "folder", name: "HUD" },
            clock: layout("clock", "Clock"),
          },
          tree: [
            { id: "loose" },
            {
              id: "menus",
              children: [
                { id: "title" },
                { id: "deep", children: [{ id: "credits" }] },
              ],
            },
            { id: "hud", children: [{ id: "clock" }] },
          ],
        },
      },
    );

    expect(
      selectViewData({ state, i18n: EN_I18N }).layoutSelectGroups.map(
        (group) => [group.fullLabel, group.children.map((item) => item.name)],
      ),
    ).toEqual([
      ["", ["Loose"]],
      ["Menus", ["Title"]],
      ["Menus > Deep", ["Credits"]],
      ["HUD", ["Clock"]],
    ]);
  });
});
