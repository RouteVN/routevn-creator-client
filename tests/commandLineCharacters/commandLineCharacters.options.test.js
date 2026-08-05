import { describe, expect, it, vi } from "vitest";
import {
  handleFormSectionAction,
  handleRemoveCharacterOpacityClick,
} from "../../src/components/commandLineCharacters/commandLineCharacters.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("commandLineCharacters character options", () => {
  it("adds a missing option to the selected character section", async () => {
    const render = vi.fn();
    const showCharacterBlurOption = vi.fn();
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "blur" },
    });
    const store = {
      selectCharacterOpacityOptionEnabled: vi.fn().mockReturnValue(false),
      selectCharacterBlurOptionEnabled: vi.fn().mockReturnValue(false),
      showCharacterOpacityOption: vi.fn(),
      showCharacterBlurOption,
    };

    await handleFormSectionAction(
      {
        appService: { showDropdownMenu },
        i18n: EN_I18N,
        render,
        store,
      },
      {
        _event: {
          detail: {
            sectionId: "character-0",
            actionId: "add",
            position: { x: 120, y: 240 },
          },
        },
      },
    );

    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: [
        { type: "item", label: "Opacity", key: "opacity" },
        { type: "item", label: "Blur", key: "blur" },
      ],
      x: 120,
      y: 240,
      place: "be",
    });
    expect(showCharacterBlurOption).toHaveBeenCalledWith({ index: 0 });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("removes an option from the matching character field", () => {
    const render = vi.fn();
    const removeCharacterOpacityOption = vi.fn();

    handleRemoveCharacterOpacityClick(
      {
        render,
        store: { removeCharacterOpacityOption },
      },
      {
        _event: {
          currentTarget: {
            dataset: { index: "3" },
          },
        },
      },
    );

    expect(removeCharacterOpacityOption).toHaveBeenCalledWith({ index: 3 });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("removes blur through its separator-free nested section action", async () => {
    const render = vi.fn();
    const removeCharacterBlurOption = vi.fn();

    await handleFormSectionAction(
      {
        render,
        store: { removeCharacterBlurOption },
      },
      {
        _event: {
          detail: {
            sectionId: "character-0-blur",
            actionId: "remove",
          },
        },
      },
    );

    expect(removeCharacterBlurOption).toHaveBeenCalledWith({ index: 0 });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
