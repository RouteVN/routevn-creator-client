import { describe, expect, it, vi } from "vitest";
import {
  handleAddFormAction,
  handleAudioEffectItemDoubleClick,
  handleAudioEffectItemEdit,
  handleDetailHeaderClick,
  handleEditFormAction,
  handleFileExplorerAction,
  handleItemDelete,
} from "../../src/pages/audioEffects/audioEffects.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("audioEffects.handlers", () => {
  it.each([
    [
      "transition",
      {
        type: "transition",
        prev: {
          volume: {
            keyframes: [{ value: 0, duration: 1000, easing: "easeInOutSine" }],
          },
        },
        next: {
          volume: {
            initialValue: 0,
            keyframes: [
              { value: 100, duration: 1000, easing: "easeInOutSine" },
            ],
          },
        },
      },
    ],
    [
      "update",
      {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 100, duration: 300, easing: "easeInOutSine" }],
          },
        },
      },
    ],
  ])(
    "creates a valid %s effect and keeps it selected",
    async (type, effect) => {
      const repositoryState = {
        audioEffects: { items: {}, tree: [] },
      };
      let selectedItemId;
      const deps = {
        i18n: EN_I18N,
        appService: {
          getPayload: vi.fn(() => ({ p: "project-1", stale: "keep" })),
          navigate: vi.fn(),
          showAlert: vi.fn(),
        },
        projectService: {
          createAudioEffect: vi.fn(async ({ audioEffectId, data }) => {
            repositoryState.audioEffects.items[audioEffectId] = {
              id: audioEffectId,
              ...data,
            };
            repositoryState.audioEffects.tree.push({ id: audioEffectId });
            return { valid: true };
          }),
          getRepositoryState: vi.fn(() => repositoryState),
        },
        store: {
          selectTargetGroupId: vi.fn(() => "folder-1"),
          closeAddDialog: vi.fn(),
          setItems: vi.fn(),
          setSelectedFolderId: vi.fn(),
          setSelectedItemId: vi.fn(({ itemId }) => {
            selectedItemId = itemId;
          }),
          setTagsData: vi.fn(),
          selectSelectedItemId: vi.fn(() => selectedItemId),
          selectAudioEffectItemById: vi.fn(
            ({ itemId }) => repositoryState.audioEffects.items[itemId],
          ),
        },
        refs: { fileExplorer: { selectItem: vi.fn() } },
        render: vi.fn(),
      };

      await handleAddFormAction(deps, {
        _event: {
          detail: {
            actionId: "submit",
            values: {
              name: " Effect One ",
              description: "Description",
              tagIds: ["smooth"],
              dialogType: type,
            },
          },
        },
      });

      expect(deps.projectService.createAudioEffect).toHaveBeenCalledWith({
        audioEffectId: expect.any(String),
        parentId: "folder-1",
        position: "last",
        data: {
          type: "audioEffect",
          name: "Effect One",
          description: "Description",
          tagIds: ["smooth"],
          audioEffect: effect,
        },
      });
      const audioEffectId =
        deps.projectService.createAudioEffect.mock.calls[0][0].audioEffectId;
      expect(deps.appService.navigate).not.toHaveBeenCalled();
      expect(deps.store.closeAddDialog).toHaveBeenCalledOnce();
      expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
        itemId: audioEffectId,
      });
      expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
        itemId: audioEffectId,
      });
    },
  );

  it("does not open the editor when a folder is double-clicked", () => {
    const deps = {
      appService: { navigate: vi.fn() },
    };
    handleAudioEffectItemDoubleClick(deps, {
      _event: {
        detail: { itemId: "folder-1", isFolder: true },
      },
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("routes catalog Open actions to the dedicated editor", async () => {
    const deps = {
      appService: {
        getPayload: vi.fn(() => ({ p: "project-1" })),
        navigate: vi.fn(),
      },
      store: {},
    };

    handleAudioEffectItemEdit(deps, {
      _event: { detail: { itemId: "effect-1" } },
    });
    await handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "effect-1",
          item: { value: "edit-item" },
        },
      },
    });

    expect(deps.appService.navigate).toHaveBeenCalledTimes(2);
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(
      1,
      "/project/audio-effects-editor",
      {
        p: "project-1",
        aef: "effect-1",
      },
    );
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(
      2,
      "/project/audio-effects-editor",
      {
        p: "project-1",
        aef: "effect-1",
      },
    );
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(
      2,
      "/project/audio-effects-editor",
      {
        p: "project-1",
        aef: "effect-1",
      },
    );
  });

  it("opens and saves audio-effect metadata from the detail header", async () => {
    const item = {
      id: "effect-1",
      type: "audioEffect",
      name: "Old Name",
      description: "Old description",
      tagIds: ["smooth"],
      audioEffect: {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 50, duration: 300, easing: "linear" }],
          },
        },
      },
    };
    const editForm = { reset: vi.fn(), setValues: vi.fn() };
    const deps = {
      i18n: EN_I18N,
      appService: { showAlert: vi.fn(), showToast: vi.fn() },
      projectService: {
        updateAudioEffect: vi.fn(async ({ data }) => {
          Object.assign(item, data);
          return { valid: true };
        }),
        getRepositoryState: vi.fn(() => ({
          audioEffects: {
            items: { "effect-1": item },
            tree: [{ id: "effect-1" }],
          },
        })),
      },
      store: {
        selectSelectedItemId: vi.fn(() => "effect-1"),
        selectAudioEffectItemById: vi.fn(() => item),
        setSelectedItemId: vi.fn(),
        openEditDialog: vi.fn(),
        selectEditItemId: vi.fn(() => "effect-1"),
        closeEditDialog: vi.fn(),
        setItems: vi.fn(),
        setSelectedFolderId: vi.fn(),
        setTagsData: vi.fn(),
      },
      refs: {
        editForm,
        fileExplorer: { selectItem: vi.fn() },
      },
      render: vi.fn(),
    };

    handleDetailHeaderClick(deps);

    const editValues = {
      name: "Old Name",
      description: "Old description",
      tagIds: ["smooth"],
    };
    expect(deps.store.openEditDialog).toHaveBeenCalledWith({
      itemId: "effect-1",
      defaultValues: editValues,
    });
    expect(editForm.reset).toHaveBeenCalledOnce();
    expect(editForm.setValues).toHaveBeenCalledWith({ values: editValues });

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: " New Name ",
            description: "New description",
            tagIds: ["smooth", "volume"],
          },
        },
      },
    });

    expect(deps.projectService.updateAudioEffect).toHaveBeenCalledWith({
      audioEffectId: "effect-1",
      data: {
        name: "New Name",
        description: "New description",
        tagIds: ["smooth", "volume"],
      },
    });
    expect(deps.store.closeEditDialog).toHaveBeenCalledOnce();
  });

  it("checks control actions before deleting an audio effect", async () => {
    const deps = {
      i18n: EN_I18N,
      appService: { showAlert: vi.fn() },
      projectService: {
        checkResourceUsage: vi.fn(async () => ({ isUsed: true })),
        deleteAudioEffects: vi.fn(),
      },
    };

    await handleItemDelete(deps, {
      _event: { detail: { itemId: "effect-1" } },
    });

    expect(deps.projectService.checkResourceUsage).toHaveBeenCalledWith({
      itemId: "effect-1",
      checkTargets: ["scenes", "layouts", "controls"],
    });
    expect(deps.projectService.deleteAudioEffects).not.toHaveBeenCalled();
  });
});
