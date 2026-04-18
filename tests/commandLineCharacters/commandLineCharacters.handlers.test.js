import { describe, expect, it, vi } from "vitest";
import {
  handleCharacterContextMenu,
  handleDropdownMenuClickItem,
} from "../../src/components/commandLineCharacters/commandLineCharacters.handlers.js";
import {
  createInitialState,
  removeCharacter,
  selectDropdownMenuCharacterIndex,
  setExistingCharacters,
  showDropdownMenu,
} from "../../src/components/commandLineCharacters/commandLineCharacters.store.js";

describe("commandLineCharacters.handlers", () => {
  it("keeps the clicked character index when a context menu opens", () => {
    const state = createInitialState();
    const render = vi.fn();
    const preventDefault = vi.fn();

    handleCharacterContextMenu(
      {
        store: {
          showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
        },
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
        store: {
          showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
        },
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
        store: {
          selectDropdownMenuCharacterIndex: () =>
            selectDropdownMenuCharacterIndex({ state }),
          removeCharacter: (payload) => removeCharacter({ state }, payload),
          hideDropdownMenu: () => {
            state.dropdownMenu.isOpen = false;
            state.dropdownMenu.characterIndex = null;
          },
        },
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
