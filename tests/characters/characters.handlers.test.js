import { describe, expect, it, vi } from "vitest";
import {
  handleAddCharacterClick,
  handleCloseDialog,
} from "../../src/pages/characters/characters.handlers.js";

const createDeps = () => {
  return {
    store: {
      setTargetGroupId: vi.fn(),
      toggleDialog: vi.fn(),
      closeAvatarCropDialog: vi.fn(),
      clearAvatarState: vi.fn(),
    },
    render: vi.fn(),
    refs: {
      characterForm: {
        reset: vi.fn(),
        setValues: vi.fn(),
      },
    },
  };
};

describe("characters add dialog form reset", () => {
  it("resets the add form each time the add dialog opens", () => {
    const deps = createDeps();

    handleAddCharacterClick(deps, {
      _event: {
        detail: {
          groupId: "folder-1",
        },
      },
    });

    handleAddCharacterClick(deps, {
      _event: {
        detail: {
          groupId: "folder-1",
        },
      },
    });

    expect(deps.store.setTargetGroupId).toHaveBeenCalledWith({
      groupId: "folder-1",
    });
    expect(deps.refs.characterForm.reset).toHaveBeenCalledTimes(2);
    expect(deps.refs.characterForm.setValues).toHaveBeenCalledTimes(2);
    expect(deps.refs.characterForm.setValues).toHaveBeenLastCalledWith({
      values: {
        name: "",
        description: "",
        shortcut: "",
      },
    });
  });

  it("clears the add form when the dialog closes", () => {
    const deps = createDeps();

    handleCloseDialog(deps);

    expect(deps.store.closeAvatarCropDialog).toHaveBeenCalledTimes(1);
    expect(deps.store.clearAvatarState).toHaveBeenCalledTimes(1);
    expect(deps.refs.characterForm.reset).toHaveBeenCalledTimes(1);
    expect(deps.refs.characterForm.setValues).toHaveBeenCalledWith({
      values: {
        name: "",
        description: "",
        shortcut: "",
      },
    });
  });
});
