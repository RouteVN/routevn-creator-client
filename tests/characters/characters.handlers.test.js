import { describe, expect, it, vi } from "vitest";
import {
  handleAddCharacterClick,
  handleCloseDialog,
  handleDialogFormActionClick,
  handleEditFormAction,
  handleSpriteGroupDropdownMenuItemClick,
} from "../../src/pages/characters/characters.handlers.js";

const createDeps = () => {
  return {
    store: {
      setTargetGroupId: vi.fn(),
      toggleDialog: vi.fn(),
      closeAvatarCropDialog: vi.fn(),
      clearAvatarState: vi.fn(),
      hideSpriteGroupDropdownMenu: vi.fn(),
      setSpriteGroups: vi.fn(),
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
        tagIds: [],
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
        tagIds: [],
      },
    });
  });
});

describe("characters sprite group tag scope", () => {
  it("blocks sprite groups during character creation", async () => {
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          dialogSpriteGroups: [
            {
              id: "group-face",
              name: "Face",
              tags: ["tag-smile"],
            },
          ],
        })),
      },
    };

    await handleDialogFormActionClick(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Hero",
            description: "",
            shortcut: "",
            tagIds: [],
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Sprite groups use character sprite tags. Create the character first, then edit sprite groups after adding sprite tags on the Character Sprites page.",
      title: "Warning",
    });
  });

  it("does not accept character tag ids in edit sprite groups", async () => {
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          editItemId: "character-hero",
          editAvatarFileId: undefined,
          editAvatarUploadResult: undefined,
          editSpriteGroups: [
            {
              id: "group-face",
              name: "Face",
              tags: ["character-tag-hero"],
            },
          ],
          tagsData: {
            items: {
              "character-tag-hero": {
                id: "character-tag-hero",
                type: "tag",
                name: "Hero",
              },
            },
            tree: [{ id: "character-tag-hero" }],
          },
          spriteTagsByCharacterId: {
            "character-hero": {
              items: {
                "sprite-tag-smile": {
                  id: "sprite-tag-smile",
                  type: "tag",
                  name: "Smile",
                },
              },
              tree: [{ id: "sprite-tag-smile" }],
            },
          },
        })),
      },
      projectService: {
        updateCharacter: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Hero",
            description: "",
            shortcut: "",
            tagIds: [],
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Sprite group 1 must have at least one tag.",
      title: "Warning",
    });
    expect(deps.projectService.updateCharacter).not.toHaveBeenCalled();
  });
});

describe("characters sprite group removal guard", () => {
  it("blocks removing an edit sprite group when story lines still use it", () => {
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        getRepositoryState: vi.fn(() => ({
          scenes: {
            items: {
              "scene-opening": {
                id: "scene-opening",
                type: "scene",
                name: "Opening",
                sections: {
                  items: {
                    "section-arrival": {
                      id: "section-arrival",
                      type: "section",
                      name: "Arrival",
                      lines: {
                        items: {
                          "line-1": {
                            id: "line-1",
                            actions: {
                              character: {
                                items: [
                                  {
                                    id: "character-hero",
                                    sprites: [
                                      {
                                        id: "group-face",
                                        resourceId: "sprite-face-smile",
                                      },
                                    ],
                                  },
                                ],
                              },
                            },
                          },
                        },
                        tree: [{ id: "line-1" }],
                      },
                    },
                  },
                  tree: [{ id: "section-arrival" }],
                },
              },
            },
            tree: [{ id: "scene-opening" }],
          },
        })),
      },
      store: {
        getState: vi.fn(() => ({
          editItemId: "character-hero",
          editSpriteGroups: [
            {
              id: "group-face",
              name: "Face",
              tags: ["sprite-tag-smile"],
            },
          ],
          spriteGroupDropdownMenu: {
            target: "edit",
            index: 0,
          },
        })),
        hideSpriteGroupDropdownMenu: vi.fn(),
        removeSpriteGroup: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupDropdownMenuItemClick(deps, {
      _event: {
        detail: {
          item: {
            value: "remove",
          },
        },
      },
    });

    expect(deps.store.hideSpriteGroupDropdownMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.removeSpriteGroup).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        'Sprite group "Face" is used in scene "Opening", section "Arrival" and can\'t be removed. Remove it from those lines first.',
      title: "Warning",
    });
  });

  it("removes an edit sprite group when no story lines use it", () => {
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        getRepositoryState: vi.fn(() => ({
          scenes: {
            items: {},
            tree: [],
          },
        })),
      },
      store: {
        getState: vi.fn(() => ({
          editItemId: "character-hero",
          editSpriteGroups: [
            {
              id: "group-face",
              name: "Face",
              tags: ["sprite-tag-smile"],
            },
          ],
          spriteGroupDropdownMenu: {
            target: "edit",
            index: 0,
          },
        })),
        hideSpriteGroupDropdownMenu: vi.fn(),
        removeSpriteGroup: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupDropdownMenuItemClick(deps, {
      _event: {
        detail: {
          item: {
            value: "remove",
          },
        },
      },
    });

    expect(deps.store.hideSpriteGroupDropdownMenu).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.store.removeSpriteGroup).toHaveBeenCalledWith({
      target: "edit",
      index: 0,
    });
  });
});
