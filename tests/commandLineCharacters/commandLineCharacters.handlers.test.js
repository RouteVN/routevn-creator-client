import { describe, expect, it, vi } from "vitest";
import {
  handleButtonSelectClick,
  handleBreadcumbClick,
  handleCharacterClick,
  handleCharacterItemClick,
  handleCharacterContextMenu,
  handleCharacterSpriteGroupBoxClick,
  handleDropdownMenuClickItem,
  handleSpriteGroupTabClick,
} from "../../src/components/commandLineCharacters/commandLineCharacters.handlers.js";
import {
  addCharacter,
  clearTempSelectedSpriteIds,
  clearPendingCharacterIndex,
  createInitialState,
  removeCharacter,
  selectCurrentSpriteSelectionGroups,
  selectDropdownMenuCharacterIndex,
  selectMode,
  selectPendingCharacterIndex,
  selectSelectedCharacterIndex,
  selectSelectedCharacters,
  selectSelectedSpriteGroupId,
  selectSpriteSelectionGroupsForCharacterIndex,
  selectTempSelectedSpriteIds,
  selectTempSelectedSpriteId,
  setMode,
  setPendingCharacterIndex,
  setSearchQuery,
  setSelectedCharacterIndex,
  setSelectedSpriteGroupId,
  setTempSelectedSpriteIds,
  setTempSelectedSpriteId,
  setExistingCharacters,
  setItems,
  setTransforms,
  showDropdownMenu,
  updateCharacterSprites,
} from "../../src/components/commandLineCharacters/commandLineCharacters.store.js";

const createStoreApi = (state) => ({
  addCharacter: (payload) => addCharacter({ state }, payload),
  clearTempSelectedSpriteIds: () => clearTempSelectedSpriteIds({ state }),
  clearPendingCharacterIndex: () => clearPendingCharacterIndex({ state }),
  hideDropdownMenu: () => {
    state.dropdownMenu.isOpen = false;
    state.dropdownMenu.characterIndex = null;
  },
  removeCharacter: (payload) => removeCharacter({ state }, payload),
  selectCurrentSpriteSelectionGroups: () =>
    selectCurrentSpriteSelectionGroups({ state }),
  selectDropdownMenuCharacterIndex: () =>
    selectDropdownMenuCharacterIndex({ state }),
  selectMode: () => selectMode({ state }),
  selectPendingCharacterIndex: () => selectPendingCharacterIndex({ state }),
  selectSelectedCharacterIndex: () => selectSelectedCharacterIndex({ state }),
  selectSelectedCharacters: () => selectSelectedCharacters({ state }),
  selectSelectedSpriteGroupId: () => selectSelectedSpriteGroupId({ state }),
  selectSpriteSelectionGroupsForCharacterIndex: (payload) =>
    selectSpriteSelectionGroupsForCharacterIndex({ state }, payload),
  selectTempSelectedSpriteIds: () => selectTempSelectedSpriteIds({ state }),
  setMode: (payload) => setMode({ state }, payload),
  setPendingCharacterIndex: (payload) =>
    setPendingCharacterIndex({ state }, payload),
  setSearchQuery: (payload) => setSearchQuery({ state }, payload),
  setSelectedCharacterIndex: (payload) =>
    setSelectedCharacterIndex({ state }, payload),
  setSelectedSpriteGroupId: (payload) =>
    setSelectedSpriteGroupId({ state }, payload),
  setTempSelectedSpriteIds: (payload) =>
    setTempSelectedSpriteIds({ state }, payload),
  setTempSelectedSpriteId: (payload) =>
    setTempSelectedSpriteId({ state }, payload),
  showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
  updateCharacterSprites: (payload) =>
    updateCharacterSprites({ state }, payload),
});

describe("commandLineCharacters.handlers", () => {
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
    expect(dispatchEvent).not.toHaveBeenCalled();
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
    expect(dispatchEvent).not.toHaveBeenCalled();
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
