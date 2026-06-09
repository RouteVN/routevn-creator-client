import { describe, expect, it, vi } from "vitest";
import {
  handleAddCharacterClick,
  handleButtonSelectClick,
  handleBreadcumbClick,
  handleAnimationChange,
  handleBlurFieldChange,
  handleBlurFieldInput,
  handleBlurToggleChange,
  handleCharacterClick,
  handleCharacterItemClick,
  handleCharacterContextMenu,
  handleCharacterSpriteGroupBoxClick,
  handleDropdownMenuClickItem,
  handleOpacityInput,
  handleSpriteItemClick,
  handleSpriteItemDoubleClick,
  handleSpriteGroupTabClick,
  handleSubmitClick,
} from "../../src/components/commandLineCharacters/commandLineCharacters.handlers.js";
import {
  addCharacter,
  clearPendingCharacterTransformId,
  clearTempSelectedSpriteIds,
  clearPendingCharacterIndex,
  createInitialState,
  moveCharacter,
  removeCharacter,
  selectCurrentSpriteSelectionGroups,
  selectCurrentSpriteItemById,
  selectAddCharacterTransformDropdownItems,
  selectDropdownMenuCharacterIndex,
  selectDropdownMenuType,
  selectMode,
  selectPendingCharacterIndex,
  selectPendingCharacterTransformId,
  selectSelectedCharacterIndex,
  selectSelectedCharacters,
  selectSelectedSpriteGroupId,
  selectSpriteSelectionGroupsForCharacterIndex,
  selectTempSelectedSpriteIds,
  selectTempSelectedSpriteId,
  setMode,
  setAnimations,
  setPendingCharacterTransformId,
  setPendingCharacterIndex,
  setSearchQuery,
  setSelectedCharacterIndex,
  setSelectedSpriteGroupId,
  setTempSelectedSpriteIds,
  setTempSelectedSpriteId,
  setExistingCharacters,
  setItems,
  setTransforms,
  updateCharacterAnimation,
  updateCharacterBlurEnabled,
  updateCharacterBlurField,
  updateCharacterOpacity,
  showDropdownMenu,
  showFullImagePreview,
  showAddCharacterTransformDropdownMenu,
  updateCharacterSprites,
} from "../../src/components/commandLineCharacters/commandLineCharacters.store.js";

const createStoreApi = (state) => ({
  addCharacter: (payload) => addCharacter({ state }, payload),
  clearTempSelectedSpriteIds: () => clearTempSelectedSpriteIds({ state }),
  clearPendingCharacterIndex: () => clearPendingCharacterIndex({ state }),
  clearPendingCharacterTransformId: () =>
    clearPendingCharacterTransformId({ state }),
  hideDropdownMenu: () => {
    state.dropdownMenu.isOpen = false;
    state.dropdownMenu.characterIndex = null;
  },
  moveCharacter: (payload) => moveCharacter({ state }, payload),
  removeCharacter: (payload) => removeCharacter({ state }, payload),
  selectAddCharacterTransformDropdownItems: () =>
    selectAddCharacterTransformDropdownItems({ state }),
  selectCurrentSpriteSelectionGroups: () =>
    selectCurrentSpriteSelectionGroups({ state }),
  selectCurrentSpriteItemById: (payload) =>
    selectCurrentSpriteItemById({ state }, payload),
  selectDropdownMenuCharacterIndex: () =>
    selectDropdownMenuCharacterIndex({ state }),
  selectDropdownMenuType: () => selectDropdownMenuType({ state }),
  selectMode: () => selectMode({ state }),
  selectPendingCharacterIndex: () => selectPendingCharacterIndex({ state }),
  selectPendingCharacterTransformId: () =>
    selectPendingCharacterTransformId({ state }),
  selectSelectedCharacterIndex: () => selectSelectedCharacterIndex({ state }),
  selectSelectedCharacters: () => selectSelectedCharacters({ state }),
  selectSelectedSpriteGroupId: () => selectSelectedSpriteGroupId({ state }),
  selectSpriteSelectionGroupsForCharacterIndex: (payload) =>
    selectSpriteSelectionGroupsForCharacterIndex({ state }, payload),
  selectTempSelectedSpriteIds: () => selectTempSelectedSpriteIds({ state }),
  setMode: (payload) => setMode({ state }, payload),
  setPendingCharacterIndex: (payload) =>
    setPendingCharacterIndex({ state }, payload),
  setPendingCharacterTransformId: (payload) =>
    setPendingCharacterTransformId({ state }, payload),
  setSearchQuery: (payload) => setSearchQuery({ state }, payload),
  setSelectedCharacterIndex: (payload) =>
    setSelectedCharacterIndex({ state }, payload),
  setSelectedSpriteGroupId: (payload) =>
    setSelectedSpriteGroupId({ state }, payload),
  setTempSelectedSpriteIds: (payload) =>
    setTempSelectedSpriteIds({ state }, payload),
  setTempSelectedSpriteId: (payload) =>
    setTempSelectedSpriteId({ state }, payload),
  showAddCharacterTransformDropdownMenu: (payload) =>
    showAddCharacterTransformDropdownMenu({ state }, payload),
  showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
  showFullImagePreview: (payload) => showFullImagePreview({ state }, payload),
  updateCharacterAnimation: (payload) =>
    updateCharacterAnimation({ state }, payload),
  updateCharacterBlurEnabled: (payload) =>
    updateCharacterBlurEnabled({ state }, payload),
  updateCharacterBlurField: (payload) =>
    updateCharacterBlurField({ state }, payload),
  updateCharacterOpacity: (payload) =>
    updateCharacterOpacity({ state }, payload),
  updateCharacterSprites: (payload) =>
    updateCharacterSprites({ state }, payload),
});

describe("commandLineCharacters.handlers", () => {
  it("opens a transform dropdown before character selection", () => {
    const state = createInitialState();
    const render = vi.fn();
    const store = createStoreApi(state);

    setTransforms(
      { state },
      {
        transforms: {
          items: {
            "transform-left": {
              id: "transform-left",
              type: "transform",
              name: "Left",
            },
            "transform-right": {
              id: "transform-right",
              type: "transform",
              name: "Right",
            },
          },
          tree: [{ id: "transform-left" }, { id: "transform-right" }],
        },
      },
    );

    handleAddCharacterClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            getBoundingClientRect: () => ({
              left: 24,
              bottom: 64,
            }),
          },
        },
      },
    );

    expect(selectMode({ state })).toBe("current");
    expect(selectDropdownMenuType({ state })).toBe("add-character-transform");
    expect(state.dropdownMenu).toMatchObject({
      isOpen: true,
      position: { x: 24, y: 64 },
      characterIndex: null,
    });
    expect(state.dropdownMenu.items).toEqual([
      {
        label: "Left",
        transformId: "transform-left",
        type: "item",
        value: "transform-left",
      },
      {
        label: "Right",
        transformId: "transform-right",
        type: "item",
        value: "transform-right",
      },
    ]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("uses the selected add-character transform through sprite selection", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setTransforms(
      { state },
      {
        transforms: {
          items: {
            "transform-left": {
              id: "transform-left",
              type: "transform",
              name: "Left",
            },
            "transform-right": {
              id: "transform-right",
              type: "transform",
              name: "Right",
            },
          },
          tree: [{ id: "transform-left" }, { id: "transform-right" }],
        },
      },
    );
    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              sprites: {
                items: {
                  "sprite-base": {
                    id: "sprite-base",
                    type: "image",
                    name: "Smile",
                    fileId: "file-smile",
                  },
                },
                tree: [{ id: "sprite-base" }],
              },
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );

    handleAddCharacterClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            getBoundingClientRect: () => ({
              left: 24,
              bottom: 64,
            }),
          },
        },
      },
    );
    handleDropdownMenuClickItem(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            item: state.dropdownMenu.items[1],
          },
        },
      },
    );

    expect(selectMode({ state })).toBe("character-select");
    expect(selectPendingCharacterTransformId({ state })).toBe(
      "transform-right",
    );
    expect(state.dropdownMenu.isOpen).toBe(false);

    handleCharacterItemClick(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              characterId: "character-hero",
            },
          },
        },
      },
    );

    expect(selectMode({ state })).toBe("sprite-select");
    expect(selectSelectedCharacters({ state })[0].transformId).toBe(
      "transform-right",
    );

    handleSpriteItemClick(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              spriteId: "sprite-base",
            },
          },
        },
      },
    );

    expect(dispatchEvent.mock.calls[1][0].detail).toEqual({
      presentationState: {
        character: {
          items: [
            {
              id: "character-hero",
              transformId: "transform-right",
              sprites: [
                {
                  id: "base",
                  resourceId: "sprite-base",
                },
              ],
              spriteName: "",
            },
          ],
        },
      },
    });

    handleButtonSelectClick({
      store,
      render,
      dispatchEvent,
    });

    expect(selectMode({ state })).toBe("current");
    expect(selectPendingCharacterTransformId({ state })).toBeUndefined();
  });

  it("defaults a new character to an available spritesheet sprite", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setTransforms(
      { state },
      {
        transforms: {
          items: {
            "transform-center": {
              id: "transform-center",
              type: "transform",
              name: "Center",
            },
          },
          tree: [{ id: "transform-center" }],
        },
      },
    );
    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              sprites: {
                items: {
                  "sprite-walk": {
                    id: "sprite-walk",
                    type: "spritesheet",
                    name: "Walk",
                    fileId: "file-walk",
                  },
                },
                tree: [{ id: "sprite-walk" }],
              },
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );

    handleCharacterItemClick(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              characterId: "character-hero",
            },
          },
        },
      },
    );

    expect(selectTempSelectedSpriteIds({ state })).toEqual({
      base: "sprite-walk",
    });
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        character: {
          items: [
            {
              id: "character-hero",
              transformId: "transform-center",
              sprites: [
                {
                  id: "base",
                  resourceId: "sprite-walk",
                },
              ],
              spriteName: "",
            },
          ],
        },
      },
    });
  });

  it("opens spritesheet sprites with spritesheet preview data on double click", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    const atlas = {
      frames: {
        "walk-0": {
          frame: { x: 0, y: 0, w: 64, h: 64 },
        },
      },
    };
    const animation = {
      frames: [0],
      fps: 12,
      loop: true,
    };

    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              sprites: {
                items: {
                  "sprite-walk": {
                    id: "sprite-walk",
                    type: "spritesheet",
                    name: "Walk",
                    fileId: "file-walk",
                    jsonData: atlas,
                    animations: {
                      Walk: animation,
                    },
                  },
                },
                tree: [{ id: "sprite-walk" }],
              },
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "base",
                resourceId: "sprite-walk",
              },
            ],
          },
        ],
      },
    );
    setMode({ state }, { mode: "sprite-select" });
    setSelectedCharacterIndex({ state }, { index: 0 });
    setSelectedSpriteGroupId({ state }, { spriteGroupId: "base" });

    handleSpriteItemDoubleClick(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              spriteId: "sprite-walk",
            },
          },
        },
      },
    );

    expect(state.fullImagePreviewVisible).toBe(true);
    expect(state.fullImagePreviewKind).toBe("spritesheet");
    expect(state.fullImagePreviewFileId).toBe("file-walk");
    expect(state.fullImagePreviewAtlas).toBe(atlas);
    expect(state.fullImagePreviewAnimation).toBe(animation);
  });

  it("updates and clears per-character animation selection", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setAnimations(
      { state },
      {
        animations: {
          items: {
            "character-enter": {
              id: "character-enter",
              type: "animation",
              name: "Enter",
              animation: {
                type: "transition",
              },
            },
          },
          tree: [{ id: "character-enter" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [],
          },
        ],
      },
    );

    handleAnimationChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: "character-enter",
          },
        },
      },
    );

    expect(selectSelectedCharacters({ state })[0]).toMatchObject({
      animationMode: "transition",
      animations: {
        resourceId: "character-enter",
      },
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        character: {
          items: [
            {
              id: "character-hero",
              transformId: undefined,
              sprites: [],
              spriteName: "",
              animations: {
                resourceId: "character-enter",
              },
            },
          ],
        },
      },
    });

    handleAnimationChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: undefined,
          },
        },
      },
    );

    expect(selectSelectedCharacters({ state })[0]).toMatchObject({
      animationMode: "none",
    });
    expect(selectSelectedCharacters({ state })[0].animations).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("updates character opacity and blur in emitted presentation state", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            transformId: "character-center",
            sprites: [],
          },
        ],
      },
    );

    handleOpacityInput(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: "0.35",
          },
        },
      },
    );

    expect(selectSelectedCharacters({ state })[0].opacity).toBe(0.35);

    handleBlurToggleChange(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: true,
          },
        },
      },
    );
    handleBlurFieldInput(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
              blurField: "quality",
            },
          },
          detail: {
            value: "5",
          },
        },
      },
    );
    handleBlurFieldChange(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
              blurField: "repeatEdgePixels",
            },
          },
          detail: {
            value: false,
          },
        },
      },
    );

    expect(selectSelectedCharacters({ state })[0].blur).toEqual({
      x: 6,
      y: 9,
      quality: 5,
      kernelSize: 9,
      repeatEdgePixels: false,
    });
    expect(dispatchEvent.mock.calls[3][0].detail).toEqual({
      presentationState: {
        character: {
          items: [
            {
              id: "character-hero",
              transformId: "character-center",
              sprites: [],
              spriteName: "",
              opacity: 0.35,
              blur: {
                x: 6,
                y: 9,
                quality: 5,
                kernelSize: 9,
                repeatEdgePixels: false,
              },
            },
          ],
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(4);
  });

  it("emits null when character blur is disabled", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            transformId: "character-center",
            sprites: [],
            blur: {
              x: 6,
              y: 9,
              quality: 3,
              kernelSize: 9,
              repeatEdgePixels: true,
            },
          },
        ],
      },
    );

    handleBlurToggleChange(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: false,
          },
        },
      },
    );

    expect(selectSelectedCharacters({ state })[0].blur).toBeNull();
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        character: {
          items: [
            {
              id: "character-hero",
              transformId: "character-center",
              sprites: [],
              spriteName: "",
              blur: null,
            },
          ],
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("submits opacity and blur for selected characters", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            transformId: "character-center",
            sprites: [
              {
                id: "base",
                resourceId: "sprite-base",
              },
            ],
            spriteName: "Smile",
            opacity: 0.8,
            blur: {
              x: 6,
              y: 9,
              quality: 3,
              kernelSize: 9,
              repeatEdgePixels: true,
            },
          },
        ],
      },
    );

    handleSubmitClick({
      dispatchEvent,
      store: createStoreApi(state),
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      character: {
        items: [
          {
            id: "character-hero",
            transformId: "character-center",
            sprites: [
              {
                id: "base",
                resourceId: "sprite-base",
              },
            ],
            spriteName: "Smile",
            opacity: 0.8,
            blur: {
              x: 6,
              y: 9,
              quality: 3,
              kernelSize: 9,
              repeatEdgePixels: true,
            },
          },
        ],
      },
    });
  });

  it("drops a newly added character when sprite selection is cancelled from the breadcrumb", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    handleCharacterItemClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              characterId: "character-2",
            },
          },
        },
      },
    );

    expect(
      selectSelectedCharacters({ state }).map((character) => character.id),
    ).toEqual(["character-2"]);
    expect(selectPendingCharacterIndex({ state })).toBe(0);
    expect(selectMode({ state })).toBe("sprite-select");

    handleBreadcumbClick(
      {
        dispatchEvent,
        render,
        store,
      },
      {
        _event: {
          detail: {
            id: "current",
          },
        },
      },
    );

    expect(selectSelectedCharacters({ state })).toEqual([]);
    expect(selectPendingCharacterIndex({ state })).toBeUndefined();
    expect(selectSelectedCharacterIndex({ state })).toBeUndefined();
    expect(selectTempSelectedSpriteId({ state })).toBeUndefined();
    expect(selectMode({ state })).toBe("current");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        character: {
          items: [],
        },
      },
    });
  });

  it("keeps existing characters when returning from sprite selection", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setTransforms(
      { state },
      {
        transforms: {
          items: {},
          tree: [],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-1",
            sprites: [
              {
                id: "base",
                resourceId: "sprite-1",
              },
            ],
          },
        ],
      },
    );

    handleCharacterClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
        },
      },
    );

    expect(selectMode({ state })).toBe("sprite-select");
    expect(selectPendingCharacterIndex({ state })).toBeUndefined();
    expect(selectTempSelectedSpriteId({ state })).toBe("sprite-1");

    handleBreadcumbClick(
      {
        dispatchEvent,
        render,
        store,
      },
      {
        _event: {
          detail: {
            id: "current",
          },
        },
      },
    );

    expect(
      selectSelectedCharacters({ state }).map((character) => character.id),
    ).toEqual(["character-1"]);
    expect(selectMode({ state })).toBe("current");
    expect(selectTempSelectedSpriteId({ state })).toBeUndefined();
    expect(selectSelectedSpriteGroupId({ state })).toBeUndefined();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        character: {
          items: [
            {
              id: "character-1",
              transformId: undefined,
              sprites: [
                {
                  id: "base",
                  resourceId: "sprite-1",
                },
              ],
              spriteName: "",
            },
          ],
        },
      },
    });
  });

  it("selects sprite parts per sprite group and keeps tab state", () => {
    const state = createInitialState();
    const render = vi.fn();
    const store = createStoreApi(state);

    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              spriteGroups: [
                {
                  id: "body",
                  name: "Body",
                  tags: [],
                },
                {
                  id: "face",
                  name: "Face",
                  tags: [],
                },
              ],
              sprites: {
                items: {
                  "sprite-body": {
                    id: "sprite-body",
                    type: "image",
                    name: "Body A",
                    fileId: "file-body",
                  },
                  "sprite-face": {
                    id: "sprite-face",
                    type: "image",
                    name: "Face A",
                    fileId: "file-face",
                  },
                },
                tree: [{ id: "sprite-body" }, { id: "sprite-face" }],
              },
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "body",
                resourceId: "sprite-body",
              },
            ],
          },
        ],
      },
    );

    handleCharacterClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
        },
      },
    );

    expect(selectSelectedSpriteGroupId({ state })).toBe("body");
    expect(selectTempSelectedSpriteIds({ state })).toEqual({
      body: "sprite-body",
    });
    expect(selectTempSelectedSpriteId({ state })).toBe("sprite-body");

    handleSpriteGroupTabClick(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            id: "face",
          },
        },
      },
    );

    expect(selectSelectedSpriteGroupId({ state })).toBe("face");
    expect(selectTempSelectedSpriteId({ state })).toBeUndefined();
  });

  it("emits temporary presentation state while picking character sprites", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              spriteGroups: [
                {
                  id: "body",
                  name: "Body",
                  tags: [],
                },
              ],
              sprites: {
                items: {
                  "sprite-body": {
                    id: "sprite-body",
                    type: "image",
                    name: "Body A",
                    fileId: "file-body",
                  },
                },
                tree: [{ id: "sprite-body" }],
              },
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [],
          },
        ],
      },
    );

    handleCharacterClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
        },
      },
    );
    handleSpriteItemClick(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              spriteId: "sprite-body",
            },
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        character: {
          items: [
            {
              id: "character-hero",
              transformId: undefined,
              sprites: [
                {
                  id: "body",
                  resourceId: "sprite-body",
                },
              ],
              spriteName: "",
            },
          ],
        },
      },
    });
  });

  it("opens sprite selection at the clicked sprite group box", () => {
    const state = createInitialState();
    const render = vi.fn();
    const store = createStoreApi(state);

    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              spriteGroups: [
                {
                  id: "body",
                  name: "Body",
                  tags: [],
                },
                {
                  id: "face",
                  name: "Face",
                  tags: [],
                },
              ],
              sprites: {
                items: {
                  "sprite-body": {
                    id: "sprite-body",
                    type: "image",
                    name: "Body A",
                    fileId: "file-body",
                  },
                  "sprite-face": {
                    id: "sprite-face",
                    type: "image",
                    name: "Face A",
                    fileId: "file-face",
                  },
                },
                tree: [{ id: "sprite-body" }, { id: "sprite-face" }],
              },
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "body",
                resourceId: "sprite-body",
              },
              {
                id: "face",
                resourceId: "sprite-face",
              },
            ],
          },
        ],
      },
    );

    handleCharacterSpriteGroupBoxClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
              spriteGroupId: "face",
            },
          },
        },
      },
    );

    expect(selectMode({ state })).toBe("sprite-select");
    expect(selectSelectedSpriteGroupId({ state })).toBe("face");
    expect(selectTempSelectedSpriteIds({ state })).toEqual({
      body: "sprite-body",
      face: "sprite-face",
    });
    expect(selectTempSelectedSpriteId({ state })).toBe("sprite-face");
  });

  it("keeps the clicked character index when a context menu opens", () => {
    const state = createInitialState();
    const render = vi.fn();
    const preventDefault = vi.fn();

    handleCharacterContextMenu(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          clientX: 120,
          clientY: 240,
          currentTarget: {
            dataset: {
              index: "1",
            },
          },
          preventDefault,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(selectDropdownMenuCharacterIndex({ state })).toBe(1);
    expect(state.dropdownMenu.position).toEqual({ x: 120, y: 240 });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("ignores invalid context menu targets instead of overwriting the index", () => {
    const state = createInitialState();
    const render = vi.fn();
    const preventDefault = vi.fn();

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        characterIndex: 1,
      },
    );

    handleCharacterContextMenu(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          clientX: 300,
          clientY: 400,
          currentTarget: {
            dataset: {},
          },
          preventDefault,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(selectDropdownMenuCharacterIndex({ state })).toBe(1);
    expect(state.dropdownMenu.position).toEqual({ x: 10, y: 20 });
    expect(render).not.toHaveBeenCalled();
  });

  it("deletes the character referenced by the dropdown menu", () => {
    const state = createInitialState();
    const render = vi.fn();

    setExistingCharacters(
      { state },
      {
        characters: [
          { id: "character-1" },
          { id: "character-2" },
          { id: "character-3" },
        ],
      },
    );
    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        characterIndex: 1,
      },
    );

    handleDropdownMenuClickItem(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          detail: {
            item: {
              value: "delete",
            },
          },
        },
      },
    );

    expect(state.selectedCharacters.map((character) => character.id)).toEqual([
      "character-1",
      "character-3",
    ]);
    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(state.dropdownMenu.characterIndex).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("moves the character referenced by the dropdown menu", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setExistingCharacters(
      { state },
      {
        characters: [
          { id: "character-1" },
          { id: "character-2" },
          { id: "character-3" },
        ],
      },
    );
    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        characterIndex: 0,
      },
    );

    handleDropdownMenuClickItem(
      {
        dispatchEvent,
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          detail: {
            item: {
              value: "move-up",
            },
          },
        },
      },
    );

    expect(state.selectedCharacters.map((character) => character.id)).toEqual([
      "character-2",
      "character-1",
      "character-3",
    ]);
    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(state.dropdownMenu.characterIndex).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          presentationState: {
            character: {
              items: [
                {
                  id: "character-2",
                  transformId: undefined,
                  sprites: [],
                  spriteName: "",
                },
                {
                  id: "character-1",
                  transformId: undefined,
                  sprites: [],
                  spriteName: "",
                },
                {
                  id: "character-3",
                  transformId: undefined,
                  sprites: [],
                  spriteName: "",
                },
              ],
            },
          },
        },
      }),
    );
  });

  it("allows sprite groups to be left empty when confirming", () => {
    const state = createInitialState();
    const render = vi.fn();
    const showAlert = vi.fn();
    const store = createStoreApi(state);

    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              spriteGroups: [
                {
                  id: "body",
                  name: "Body",
                  tags: [],
                },
                {
                  id: "face",
                  name: "Face",
                  tags: [],
                },
              ],
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "body",
                resourceId: "sprite-body",
              },
            ],
          },
        ],
      },
    );
    setMode({ state }, { mode: "sprite-select" });
    setSelectedCharacterIndex({ state }, { index: 0 });
    setTempSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          body: "sprite-body",
        },
      },
    );
    setSelectedSpriteGroupId({ state }, { spriteGroupId: "body" });

    handleButtonSelectClick({
      appService: { showAlert },
      render,
      store,
    });

    expect(showAlert).not.toHaveBeenCalled();
    expect(selectSelectedCharacters({ state })[0].sprites).toEqual([
      {
        id: "body",
        resourceId: "sprite-body",
      },
    ]);
    expect(selectMode({ state })).toBe("current");
    expect(selectSelectedCharacterIndex({ state })).toBeUndefined();
    expect(selectTempSelectedSpriteIds({ state })).toEqual({});
  });

  it("allows all sprite groups to be empty when confirming", () => {
    const state = createInitialState();
    const render = vi.fn();
    const showAlert = vi.fn();
    const store = createStoreApi(state);

    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              spriteGroups: [
                {
                  id: "body",
                  name: "Body",
                  tags: [],
                },
                {
                  id: "face",
                  name: "Face",
                  tags: [],
                },
              ],
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "body",
                resourceId: "sprite-body",
              },
            ],
          },
        ],
      },
    );
    setMode({ state }, { mode: "sprite-select" });
    setSelectedCharacterIndex({ state }, { index: 0 });
    setTempSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {},
      },
    );
    setSelectedSpriteGroupId({ state }, { spriteGroupId: "body" });

    handleButtonSelectClick({
      appService: { showAlert },
      render,
      store,
    });

    expect(showAlert).not.toHaveBeenCalled();
    expect(selectSelectedCharacters({ state })[0].sprites).toEqual([]);
    expect(selectMode({ state })).toBe("current");
    expect(selectSelectedCharacterIndex({ state })).toBeUndefined();
    expect(selectTempSelectedSpriteIds({ state })).toEqual({});
  });

  it("stores one selected sprite part per sprite group when confirming", () => {
    const state = createInitialState();
    const render = vi.fn();
    const showAlert = vi.fn();
    const store = createStoreApi(state);

    setItems(
      { state },
      {
        items: {
          items: {
            "character-hero": {
              id: "character-hero",
              type: "character",
              name: "Hero",
              spriteGroups: [
                {
                  id: "body",
                  name: "Body",
                  tags: [],
                },
                {
                  id: "face",
                  name: "Face",
                  tags: [],
                },
              ],
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "body",
                resourceId: "sprite-body",
              },
            ],
          },
        ],
      },
    );
    setMode({ state }, { mode: "sprite-select" });
    setSelectedCharacterIndex({ state }, { index: 0 });
    setTempSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          body: "sprite-body",
          face: "sprite-face",
        },
      },
    );
    setSelectedSpriteGroupId({ state }, { spriteGroupId: "face" });

    handleButtonSelectClick({
      appService: { showAlert },
      render,
      store,
    });

    expect(showAlert).not.toHaveBeenCalled();
    expect(selectSelectedCharacters({ state })[0].sprites).toEqual([
      {
        id: "body",
        resourceId: "sprite-body",
      },
      {
        id: "face",
        resourceId: "sprite-face",
      },
    ]);
    expect(selectMode({ state })).toBe("current");
    expect(selectSelectedCharacterIndex({ state })).toBeUndefined();
    expect(selectTempSelectedSpriteIds({ state })).toEqual({});
  });
});
