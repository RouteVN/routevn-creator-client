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
      selectCharacterFlipOptionEnabled: vi.fn().mockReturnValue(false),
      selectCharacterShaderAdjustmentOptionEnabled: vi
        .fn()
        .mockReturnValue(false),
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
        { type: "separator" },
        { type: "item", label: "Flip X", key: "flip-x" },
        { type: "item", label: "Flip Y", key: "flip-y" },
        { type: "separator" },
        { type: "item", label: "Brightness", key: "brightness" },
        { type: "item", label: "Contrast", key: "contrast" },
        { type: "item", label: "Saturation", key: "saturation" },
        { type: "item", label: "Hue", key: "hue" },
        { type: "item", label: "Grayscale", key: "grayscale" },
        { type: "item", label: "Sepia", key: "sepia" },
        { type: "item", label: "Invert", key: "invert" },
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

  it("removes a shader adjustment through its nested section action", async () => {
    const render = vi.fn();
    const removeCharacterShaderAdjustmentOption = vi.fn();

    await handleFormSectionAction(
      {
        render,
        store: { removeCharacterShaderAdjustmentOption },
      },
      {
        _event: {
          detail: {
            sectionId: "character-2-saturation",
            actionId: "remove",
          },
        },
      },
    );

    expect(removeCharacterShaderAdjustmentOption).toHaveBeenCalledWith({
      index: 2,
      adjustmentId: "saturation",
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("removes a flip through its header-only nested section action", async () => {
    const render = vi.fn();
    const removeCharacterFlipOption = vi.fn();

    await handleFormSectionAction(
      {
        render,
        store: { removeCharacterFlipOption },
      },
      {
        _event: {
          detail: {
            sectionId: "character-2-flip-x",
            actionId: "remove",
          },
        },
      },
    );

    expect(removeCharacterFlipOption).toHaveBeenCalledWith({
      index: 2,
      optionId: "flip-x",
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
