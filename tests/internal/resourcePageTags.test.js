import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import { hasTagNamed } from "../../src/internal/resourceTags.js";
import { createResourcePageTagHandlers } from "../../src/internal/ui/resourcePages/tags.js";
import * as colorsStore from "../../src/pages/colors/colors.store.js";
import { EN_I18N } from "../support/i18n.js";

const createTag = (id, name, type = "tag") => ({ id, type, name });

// The tag handlers on a real page store, with a project that has the given
// tags in the page's scope.
const createPage = ({ tags = [] } = {}) => {
  let state = colorsStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return colorsStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = colorsStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  store.setTagsData({
    tagsData: {
      items: Object.fromEntries(tags.map((tag) => [tag.id, tag])),
      tree: tags.map((tag) => ({ id: tag.id })),
    },
  });

  const handlers = createResourcePageTagHandlers({
    resolveScopeKey: () => "colors",
    updateItemTagIds: vi.fn(),
    copy: ({ i18n }) => i18n.resourcePages,
  });
  const deps = {
    store,
    i18n: EN_I18N,
    render: vi.fn(),
    appService: {
      showAlert: vi.fn(),
      reportError: vi.fn(),
    },
    projectService: {
      createTag: vi.fn(async () => ({ valid: true })),
    },
  };
  handlers.openCreateTagDialogForMode({ deps, mode: "filter" });

  return {
    deps,
    state: () => state,
    submit: (name) =>
      handlers.handleCreateTagFormAction(deps, {
        _event: {
          detail: { actionId: "submit", values: { name } },
        },
      }),
  };
};

describe("tag creation on a resource page", () => {
  it("sends one create when Create is tapped again while it saves", async () => {
    const page = createPage();
    let finishCreate;
    const saving = new Promise((resolve) => {
      finishCreate = resolve;
    });
    page.deps.projectService.createTag.mockReturnValue(saving);

    const taps = [
      page.submit("Narration"),
      page.submit("Narration"),
      page.submit("Narration"),
    ];

    expect(page.deps.projectService.createTag).toHaveBeenCalledTimes(1);
    expect(page.state().isCreateTagDialogOpen).toBe(true);

    finishCreate({ valid: true });
    await Promise.all(taps);

    expect(page.deps.projectService.createTag).toHaveBeenCalledTimes(1);
    expect(page.deps.appService.showAlert).not.toHaveBeenCalled();
    const [{ tagId }] = page.deps.projectService.createTag.mock.calls[0];
    expect(page.state().isCreateTagDialogOpen).toBe(false);
    expect(page.state().isCreateTagSubmitting).toBe(false);
    expect(page.state().tagsData.items[tagId].name).toBe("Narration");
    expect(page.state().activeTagIds).toEqual([tagId]);
    expect(page.deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("lets Create be tapped again after a create fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const page = createPage();
    page.deps.projectService.createTag.mockResolvedValueOnce({
      valid: false,
      error: { message: "The project could not be saved." },
    });

    await page.submit("Narration");

    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.state().isCreateTagDialogOpen).toBe(true);
    expect(page.state().isCreateTagSubmitting).toBe(false);

    await page.submit("Narration");

    expect(page.deps.projectService.createTag).toHaveBeenCalledTimes(2);
    expect(page.state().isCreateTagDialogOpen).toBe(false);
    consoleError.mockRestore();
  });

  it("explains a name the scope already has, whatever its case or spacing", async () => {
    const page = createPage({ tags: [createTag("tag-1", "Dialogue")] });

    for (const name of ["Dialogue", "dialogue", "  DIALOGUE  "]) {
      await page.submit(name);
      expect(page.deps.appService.showAlert).toHaveBeenLastCalledWith({
        message: "A tag with this name already exists.",
        title: "Warning",
      });
    }

    expect(page.deps.appService.showAlert).toHaveBeenCalledTimes(3);
    expect(page.deps.projectService.createTag).not.toHaveBeenCalled();
    expect(page.state().isCreateTagDialogOpen).toBe(true);
    expect(page.state().isCreateTagSubmitting).toBe(false);
  });

  it("creates a tag whose name no tag in the scope has", async () => {
    const page = createPage({ tags: [createTag("tag-1", "Dialogue")] });

    await page.submit("  Narration ");

    expect(page.deps.projectService.createTag).toHaveBeenCalledWith({
      scopeKey: "colors",
      tagId: expect.any(String),
      data: { type: "tag", name: "Narration" },
    });
    expect(page.deps.appService.showAlert).not.toHaveBeenCalled();
    expect(page.state().isCreateTagDialogOpen).toBe(false);
  });

  it("still asks for a name", async () => {
    const page = createPage();

    await page.submit("   ");

    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Tag name is required.",
      title: "Warning",
    });
    expect(page.deps.projectService.createTag).not.toHaveBeenCalled();
  });
});

describe("hasTagNamed", () => {
  const tagsCollection = {
    items: {
      "folder-1": createTag("folder-1", "Moods", "folder"),
      "tag-1": createTag("tag-1", " Happy "),
    },
    tree: [],
  };

  it("matches the trimmed, lowercased names the project compares", () => {
    expect(hasTagNamed({ tagsCollection, name: "happy" })).toBe(true);
    expect(hasTagNamed({ tagsCollection, name: "  HAPPY" })).toBe(true);
    expect(hasTagNamed({ tagsCollection, name: "Happier" })).toBe(false);
  });

  it("leaves folders out", () => {
    expect(hasTagNamed({ tagsCollection, name: "Moods" })).toBe(false);
  });

  it("finds nothing in an empty scope", () => {
    expect(hasTagNamed({ tagsCollection: undefined, name: "Happy" })).toBe(
      false,
    );
  });
});

// The handlers call these on whichever page store the tags belong to.
describe("create tag submitting state on page stores", () => {
  const storeModules = import.meta.glob("../../src/pages/*/*.store.js", {
    eager: true,
  });
  const tagStores = Object.entries(storeModules).filter(
    ([, module]) => module.closeCreateTagDialog !== undefined,
  );

  it("finds the page stores that create tags", () => {
    expect(tagStores.length).toBeGreaterThanOrEqual(16);
  });

  it.each(tagStores)("%s tracks a create in flight", (_path, module) => {
    const state = module.createInitialState();
    expect(module.selectIsCreateTagSubmitting({ state })).toBe(false);

    module.setCreateTagSubmitting({ state }, { value: true });
    expect(module.selectIsCreateTagSubmitting({ state })).toBe(true);

    module.openCreateTagDialog({ state }, { mode: "filter" });
    expect(module.selectIsCreateTagSubmitting({ state })).toBe(false);

    module.setCreateTagSubmitting({ state }, { value: true });
    module.closeCreateTagDialog({ state });
    expect(module.selectIsCreateTagSubmitting({ state })).toBe(false);
  });
});
