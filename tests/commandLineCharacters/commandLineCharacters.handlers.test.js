import { describe, expect, it, vi } from "vitest";
import {
  handleBreadcumbClick,
  handleCharacterClick,
  handleCharacterItemClick,
  handleCharacterContextMenu,
  handleDropdownMenuClickItem,
} from "../../src/components/commandLineCharacters/commandLineCharacters.handlers.js";
import {
  addCharacter,
  clearPendingCharacterIndex,
  createInitialState,
  removeCharacter,
  selectDropdownMenuCharacterIndex,
  selectMode,
  selectPendingCharacterIndex,
  selectSelectedCharacterIndex,
  selectSelectedCharacters,
  selectTempSelectedSpriteId,
  setMode,
  setPendingCharacterIndex,
  setSearchQuery,
  setSelectedCharacterIndex,
  setTempSelectedSpriteId,
  setExistingCharacters,
  setTransforms,
  showDropdownMenu,
} from "../../src/components/commandLineCharacters/commandLineCharacters.store.js";

const createStoreApi = (state) => ({
  addCharacter: (payload) => addCharacter({ state }, payload),
  clearPendingCharacterIndex: () => clearPendingCharacterIndex({ state }),
  hideDropdownMenu: () => {
    state.dropdownMenu.isOpen = false;
    state.dropdownMenu.characterIndex = null;
  },
  removeCharacter: (payload) => removeCharacter({ state }, payload),
  selectDropdownMenuCharacterIndex: () =>
    selectDropdownMenuCharacterIndex({ state }),
  selectMode: () => selectMode({ state }),
  selectPendingCharacterIndex: () => selectPendingCharacterIndex({ state }),
  selectSelectedCharacters: () => selectSelectedCharacters({ state }),
  setMode: (payload) => setMode({ state }, payload),
  setPendingCharacterIndex: (payload) =>
    setPendingCharacterIndex({ state }, payload),
  setSearchQuery: (payload) => setSearchQuery({ state }, payload),
  setSelectedCharacterIndex: (payload) =>
    setSelectedCharacterIndex({ state }, payload),
  setTempSelectedSpriteId: (payload) =>
    setTempSelectedSpriteId({ state }, payload),
  showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
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

    expect(selectSelectedCharacters({ state }).map((character) => character.id)).toEqual([
      "character-2",
    ]);
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

    expect(selectSelectedCharacters({ state }).map((character) => character.id)).toEqual([
      "character-1",
    ]);
    expect(selectMode({ state })).toBe("current");
    expect(selectTempSelectedSpriteId({ state })).toBeUndefined();
    expect(dispatchEvent).not.toHaveBeenCalled();
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
});
