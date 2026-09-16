import { describe, expect, it, vi } from "vitest";
import * as storeModule from "../../src/pages/transforms/transforms.store.js";
import {
  handleTransformItemAction,
  handleFileExplorerAction,
} from "../../src/pages/transforms/transforms.handlers.js";
import { createCatalogResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/catalog.js";
import { EN_I18N } from "../support/i18n.js";

const createFixture = () => {
  const repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    transforms: {
      items: {
        one: { id: "one", name: "Transform One", type: "transform" },
        two: { id: "two", name: "Transform Two", type: "transform" },
      },
      tree: [{ id: "one" }, { id: "two" }],
    },
  };
  const state = storeModule.createInitialState();
  const context = { state, i18n: EN_I18N };
  const store = Object.fromEntries(
    Object.entries(storeModule)
      .filter(([, value]) => typeof value === "function")
      .map(([key, value]) => [key, (payload) => value(context, payload)]),
  );
  store.setItems({ data: repositoryState.transforms });
  store.setSelectedItemId({ itemId: "one" });
  const projectService = {
    getRepositoryState: () => repositoryState,
    setDefaultDialogueAvatarTransform: vi.fn(async ({ transformId }) => {
      repositoryState.project.defaultDialogueAvatarTransformId = transformId;
      return { valid: true };
    }),
  };
  return {
    state,
    store,
    repositoryState,
    deps: {
      store,
      projectService,
      appService: { showToast: vi.fn() },
      render: vi.fn(),
      refs: {},
      i18n: EN_I18N,
    },
  };
};

describe("default dialogue avatar transform controls", () => {
  it("sets, replaces and clears from the clicked item's menu", async () => {
    const { store, deps, repositoryState } = createFixture();
    const card = (id) =>
      store
        .selectViewData()
        .catalogGroups.flatMap((group) => group.children)
        .find((item) => item.id === id);
    const explorerItem = (id) =>
      store.selectViewData().flatItems.find((item) => item.id === id);
    const defaultField = (key = "detailFields") =>
      store
        .selectViewData()
        [
          key
        ].find((field) => field.label === "Default Dialogue Avatar Transform");
    const act = (itemId, action) =>
      handleTransformItemAction(deps, {
        _event: { detail: { itemId, action } },
      });
    expect(card("one").contextMenuItems.at(-1).value).toBe(
      "set-default-dialogue-avatar",
    );
    expect(defaultField()).toBeUndefined();
    await act("one", "set-default-dialogue-avatar");
    expect(repositoryState.project.defaultDialogueAvatarTransformId).toBe(
      "one",
    );
    expect(card("one").titleIcon).toBe("characterSprite");
    expect(card("one").contextMenuItems.at(-1).value).toBe(
      "clear-default-dialogue-avatar",
    );
    expect(explorerItem("one").titleIcon).toBe("characterSprite");
    expect(defaultField()).toEqual({
      type: "text",
      label: "Default Dialogue Avatar Transform",
      value: "Yes",
    });
    expect(defaultField("mobileDetailFields")).toEqual(defaultField());
    // The context-menu target wins even though the selection is still one.
    await act("two", "set-default-dialogue-avatar");
    expect(repositoryState.project.defaultDialogueAvatarTransformId).toBe(
      "two",
    );
    expect(card("one").titleIcon).toBeUndefined();
    expect(card("two").titleIcon).toBe("characterSprite");
    expect(defaultField()).toBeUndefined();
    store.setSelectedItemId({ itemId: "two" });
    expect(defaultField().value).toBe("Yes");
    await handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "two",
          item: { value: "clear-default-dialogue-avatar" },
        },
      },
    });
    expect(
      repositoryState.project.defaultDialogueAvatarTransformId,
    ).toBeUndefined();
    expect(card("two").titleIcon).toBeUndefined();
    expect(explorerItem("two").titleIcon).toBeUndefined();
    expect(defaultField()).toBeUndefined();
    expect(defaultField("mobileDetailFields")).toBeUndefined();
  });

  it("does not clear a different default after the menu was opened", async () => {
    const { store, deps } = createFixture();
    store.setDefaultDialogueAvatarTransformId({ transformId: "two" });
    await handleTransformItemAction(deps, {
      _event: {
        detail: { itemId: "one", action: "clear-default-dialogue-avatar" },
      },
    });
    expect(
      deps.projectService.setDefaultDialogueAvatarTransform,
    ).not.toHaveBeenCalled();
  });

  it.each(["rejected", "throws"])(
    "shows an error without changing the selection when save %s",
    async (mode) => {
      const { store, deps } = createFixture();
      deps.projectService.setDefaultDialogueAvatarTransform.mockImplementation(
        async () => {
          if (mode === "throws") throw new Error("Storage failure");
          return { valid: false };
        },
      );
      await handleTransformItemAction(deps, {
        _event: {
          detail: { itemId: "one", action: "set-default-dialogue-avatar" },
        },
      });
      expect(store.selectDefaultDialogueAvatarTransformId()).toBeUndefined();
      expect(deps.appService.showToast).toHaveBeenCalledWith({
        message: "Failed to update the dialogue avatar default.",
      });
    },
  );

  it("submits set and clear commands to the main project partition", async () => {
    const context = { projectId: "project-one" };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      storyBasePartitionFor: vi.fn(() => "m"),
      submitCommandWithContext: vi.fn(async () => ({ valid: true })),
    };
    const api = createCatalogResourceCommandApi(shared);
    for (const transformId of ["one", undefined]) {
      await api.setDefaultDialogueAvatarTransform({ transformId });
      expect(shared.submitCommandWithContext).toHaveBeenLastCalledWith({
        context,
        scope: "settings",
        partition: "m",
        type: "project.set_default_dialogue_avatar_transform",
        payload: { transformId: transformId ?? null },
      });
    }
  });
});
