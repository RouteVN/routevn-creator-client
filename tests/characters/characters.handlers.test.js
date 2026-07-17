import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  handleAddCharacterClick,
  handleCharacterItemClick,
  handleCloseDialog,
  handleDialogFormActionClick,
  handleEditFormAction,
  handleFileExplorerKeyboardScopeKeyDown,
  handleSpriteGroupAddClick,
  handleSpriteGroupCardClick,
  handleSpriteGroupDropdownMenuItemClick,
  handleSpriteGroupFormAction,
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

describe("characters item selection", () => {
  it("selects a character without opening its sprites page", () => {
    const deps = {
      appService: {
        navigate: vi.fn(),
      },
      store: {
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleCharacterItemClick(deps, {
      _event: {
        detail: {
          itemId: "character-1",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "character-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "character-1",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens the selected character's sprites page with Enter", () => {
    const deps = {
      appService: {
        getPayload: vi.fn(() => ({ p: "project-1" })),
        navigate: vi.fn(),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => ({
            isFolder: false,
            itemId: "character-1",
          })),
        },
      },
      render: vi.fn(),
    };
    const event = {
      key: "Enter",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleFileExplorerKeyboardScopeKeyDown(deps, { _event: event });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/character-sprites",
      {
        characterId: "character-1",
        p: "project-1",
      },
    );
  });

  it("opens the selected character edit dialog when e is pressed", () => {
    const character = {
      id: "character-1",
      name: "Hero",
      description: "Main character",
      spriteGroups: [],
      tagIds: [],
    };
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "character-1"),
        selectCharacterItemById: vi.fn(() => character),
        setSelectedItemId: vi.fn(),
        openEditDialog: vi.fn(),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => ({
            isFolder: false,
            itemId: "character-1",
          })),
          selectItem: vi.fn(),
        },
        editForm: {
          reset: vi.fn(),
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
    };
    const event = {
      key: "e",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleFileExplorerKeyboardScopeKeyDown(deps, { _event: event });

    expect(deps.store.openEditDialog).toHaveBeenCalledWith({
      itemId: "character-1",
      spriteGroups: [],
    });
    expect(deps.refs.editForm.setValues).toHaveBeenCalledWith({
      values: {
        name: "Hero",
        nameVariableId: "",
        description: "Main character",
        shortcut: "",
        tagIds: [],
      },
    });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("goes back one browser-history entry with Shift+H", () => {
    const deps = {
      appService: {
        back: vi.fn(() => Promise.resolve(true)),
      },
      refs: {},
    };
    const event = {
      altKey: false,
      ctrlKey: false,
      key: "H",
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleFileExplorerKeyboardScopeKeyDown(deps, { _event: event });

    expect(deps.appService.back).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });
});

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
        nameVariableId: "",
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
        nameVariableId: "",
        description: "",
        shortcut: "",
        tagIds: [],
      },
    });
  });
});

describe("characters name variable", () => {
  it("sends the selected name variable when editing a character", async () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          editItemId: "character-hero",
          editAvatarFileId: undefined,
          editAvatarUploadResult: undefined,
          editSpriteGroups: [],
          spriteTagsByCharacterId: {},
        })),
        setTagsData: vi.fn(),
        setSpriteTagsByCharacterId: vi.fn(),
        setItems: vi.fn(),
        closeEditDialog: vi.fn(),
      },
      projectService: {
        updateCharacter: vi.fn(() => Promise.resolve({ valid: true })),
        getRepositoryState: vi.fn(() => ({
          tags: {},
          characters: { items: {}, tree: [] },
          variables: { items: {}, tree: [] },
        })),
      },
      refs: {},
      render: vi.fn(),
    };

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Hero",
            nameVariableId: "playerName",
            description: "",
            shortcut: "",
            tagIds: [],
          },
        },
      },
    });

    expect(deps.projectService.updateCharacter).toHaveBeenCalledWith({
      characterId: "character-hero",
      fileRecords: undefined,
      data: {
        name: "Hero",
        nameVariableId: "playerName",
        description: "",
        shortcut: "",
        tagIds: [],
        spriteGroups: [],
      },
    });
    expect(deps.store.closeEditDialog).toHaveBeenCalledTimes(1);
  });

  it("saves top-first edit sprite groups in render order", async () => {
    const deps = {
      i18n: EN_I18N,
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
              tags: ["sprite-tag-face"],
            },
            {
              id: "group-body",
              name: "Body",
              tags: ["sprite-tag-body"],
            },
          ],
          spriteTagsByCharacterId: {
            "character-hero": {
              items: {
                "sprite-tag-face": {
                  id: "sprite-tag-face",
                  type: "tag",
                  name: "Face",
                },
                "sprite-tag-body": {
                  id: "sprite-tag-body",
                  type: "tag",
                  name: "Body",
                },
              },
              tree: [{ id: "sprite-tag-face" }, { id: "sprite-tag-body" }],
            },
          },
        })),
        setTagsData: vi.fn(),
        setSpriteTagsByCharacterId: vi.fn(),
        setItems: vi.fn(),
        closeEditDialog: vi.fn(),
      },
      projectService: {
        updateCharacter: vi.fn(() => Promise.resolve({ valid: true })),
        getRepositoryState: vi.fn(() => ({
          tags: {},
          characters: { items: {}, tree: [] },
          variables: { items: {}, tree: [] },
        })),
      },
      refs: {},
      render: vi.fn(),
    };

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Hero",
            nameVariableId: "",
            description: "",
            shortcut: "",
            tagIds: [],
          },
        },
      },
    });

    expect(deps.projectService.updateCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spriteGroups: [
            {
              id: "group-body",
              name: "Body",
              tags: ["sprite-tag-body"],
            },
            {
              id: "group-face",
              name: "Face",
              tags: ["sprite-tag-face"],
            },
          ],
        }),
      }),
    );
  });

  it("sends an empty name variable to clear the character override", async () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          editItemId: "character-hero",
          editAvatarFileId: undefined,
          editAvatarUploadResult: undefined,
          editSpriteGroups: [],
          spriteTagsByCharacterId: {},
        })),
        setTagsData: vi.fn(),
        setSpriteTagsByCharacterId: vi.fn(),
        setItems: vi.fn(),
        closeEditDialog: vi.fn(),
      },
      projectService: {
        updateCharacter: vi.fn(() => Promise.resolve({ valid: true })),
        getRepositoryState: vi.fn(() => ({
          tags: {},
          characters: { items: {}, tree: [] },
          variables: { items: {}, tree: [] },
        })),
      },
      refs: {},
      render: vi.fn(),
    };

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Hero",
            nameVariableId: "",
            description: "",
            shortcut: "",
            tagIds: [],
          },
        },
      },
    });

    expect(deps.projectService.updateCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nameVariableId: "",
        }),
      }),
    );
  });
});

describe("characters sprite group tag scope", () => {
  it("blocks sprite groups during character creation", async () => {
    const deps = {
      i18n: EN_I18N,
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
      message: "Create the character first, then add groups.",
      title: "Warning",
    });
  });

  it("does not accept character tag ids in edit sprite groups", async () => {
    const deps = {
      i18n: EN_I18N,
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

describe("characters sprite group dialog", () => {
  it("opens the sprite group dialog when adding an edit sprite group", () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        hideSpriteGroupDropdownMenu: vi.fn(),
        openSpriteGroupDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupAddClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            target: "edit",
          },
        },
      },
    });

    expect(deps.store.hideSpriteGroupDropdownMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.openSpriteGroupDialog).toHaveBeenCalledWith({
      target: "edit",
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens the sprite group dialog for an existing edit sprite group", () => {
    const deps = {
      i18n: EN_I18N,
      store: {
        hideSpriteGroupDropdownMenu: vi.fn(),
        openSpriteGroupDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupCardClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            target: "edit",
            index: "1",
          },
        },
      },
    });

    expect(deps.store.hideSpriteGroupDropdownMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.openSpriteGroupDialog).toHaveBeenCalledWith({
      target: "edit",
      index: 1,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("adds a sprite group from the sprite group dialog form", () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          spriteGroupDialogTarget: "edit",
          editItemId: "character-hero",
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
        addSpriteGroup: vi.fn(),
        closeSpriteGroupDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: " Face ",
            tags: ["sprite-tag-smile"],
          },
        },
      },
    });

    expect(deps.store.addSpriteGroup).toHaveBeenCalledWith({
      target: "edit",
      name: "Face",
      tags: ["sprite-tag-smile"],
    });
    expect(deps.store.closeSpriteGroupDialog).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("updates a sprite group from the sprite group dialog form", () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          spriteGroupDialogTarget: "edit",
          spriteGroupDialogIndex: 0,
          editItemId: "character-hero",
          editSpriteGroups: [
            {
              id: "group-face",
              name: "Face",
              tags: ["sprite-tag-smile"],
            },
          ],
          spriteTagsByCharacterId: {
            "character-hero": {
              items: {
                "sprite-tag-neutral": {
                  id: "sprite-tag-neutral",
                  type: "tag",
                  name: "Neutral",
                },
              },
              tree: [{ id: "sprite-tag-neutral" }],
            },
          },
        })),
        addSpriteGroup: vi.fn(),
        updateSpriteGroup: vi.fn(),
        closeSpriteGroupDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: " Face Updated ",
            tags: ["sprite-tag-neutral"],
          },
        },
      },
    });

    expect(deps.store.updateSpriteGroup).toHaveBeenCalledWith({
      target: "edit",
      index: 0,
      name: "Face Updated",
      tags: ["sprite-tag-neutral"],
    });
    expect(deps.store.addSpriteGroup).not.toHaveBeenCalled();
    expect(deps.store.closeSpriteGroupDialog).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("requires sprite group tags in the sprite group dialog form", () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          spriteGroupDialogTarget: "edit",
          editItemId: "character-hero",
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
        addSpriteGroup: vi.fn(),
        closeSpriteGroupDialog: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Face",
            tags: [],
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Sprite group 1 must have at least one tag.",
      title: "Warning",
    });
    expect(deps.store.addSpriteGroup).not.toHaveBeenCalled();
    expect(deps.store.closeSpriteGroupDialog).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });
});

describe("characters sprite group removal guard", () => {
  it("blocks removing an edit sprite group when story lines still use it", () => {
    const deps = {
      i18n: EN_I18N,
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

  it("moves sprite groups by visual top-first direction", () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        getRepositoryState: vi.fn(),
      },
      store: {
        getState: vi.fn(() => ({
          spriteGroupDropdownMenu: {
            target: "edit",
            index: 1,
          },
        })),
        hideSpriteGroupDropdownMenu: vi.fn(),
        moveSpriteGroup: vi.fn(),
      },
      render: vi.fn(),
    };

    handleSpriteGroupDropdownMenuItemClick(deps, {
      _event: {
        detail: {
          item: {
            value: "move-up",
          },
        },
      },
    });

    expect(deps.store.moveSpriteGroup).toHaveBeenCalledWith({
      target: "edit",
      index: 1,
      offset: -1,
    });
  });

  it("removes an edit sprite group when no story lines use it", () => {
    const deps = {
      i18n: EN_I18N,
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
