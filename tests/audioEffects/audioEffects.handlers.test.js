import { describe, expect, it, vi } from "vitest";
import {
  handleAddFormAction,
  handleAudioEffectItemDoubleClick,
  handleAudioEffectItemEdit,
  handleDetailHeaderClick,
  handleFileExplorerAction,
} from "../../src/pages/audioEffects/audioEffects.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("audioEffects.handlers", () => {
  it.each([
    [
      "transition",
      {
        type: "transition",
        prev: {
          fade: {
            keyframes: [{ value: 0, duration: 600, easing: "easeInOutSine" }],
          },
        },
        next: {
          fade: {
            keyframes: [{ value: 100, duration: 900, easing: "easeInOutSine" }],
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

  it("routes every catalog edit entry point to the dedicated editor", async () => {
    const deps = {
      appService: {
        getPayload: vi.fn(() => ({ p: "project-1" })),
        navigate: vi.fn(),
      },
      store: {
        selectSelectedItemId: vi.fn(() => "effect-1"),
      },
    };

    handleAudioEffectItemEdit(deps, {
      _event: { detail: { itemId: "effect-1" } },
    });
    handleDetailHeaderClick(deps);
    await handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "effect-1",
          item: { value: "edit-item" },
        },
      },
    });

    expect(deps.appService.navigate).toHaveBeenCalledTimes(3);
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
      3,
      "/project/audio-effects-editor",
      {
        p: "project-1",
        aef: "effect-1",
      },
    );
  });
});
