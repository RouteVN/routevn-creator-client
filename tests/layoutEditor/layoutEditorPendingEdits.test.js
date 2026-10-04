import { produce } from "immer";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  handleBeforeMount,
  handleLayoutEditorCanvasDragUpdate,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { createLayoutEditorRepositoryStoreData } from "../../src/pages/layoutEditor/support/layoutEditorRepositoryState.js";
import { EN_I18N } from "../support/i18n.js";

// A repository that applies element updates the way the model does, so the
// page's later syncs read back what was saved.
const createProjectService = () => {
  let repository = {
    project: { resolution: { width: 1920, height: 1080 } },
    layouts: {
      tree: [{ id: "layout-one" }],
      items: {
        "layout-one": {
          id: "layout-one",
          type: "layout",
          name: "Layout One",
          elements: {
            tree: [{ id: "item-1" }, { id: "item-2" }],
            items: {
              "item-1": { id: "item-1", type: "rect", x: 100, y: 50 },
              "item-2": { id: "item-2", type: "rect", x: 10, y: 10 },
            },
          },
        },
      },
    },
  };
  // The page's store freezes what it keeps, so update immutably.
  return {
    getRepositoryState: () => repository,
    updateLayoutElement: vi.fn(
      async ({ layoutId, elementId, data, replace }) => {
        repository = produce(repository, (draft) => {
          const items = draft.layouts.items[layoutId].elements.items;
          items[elementId] = replace
            ? { id: elementId, ...data }
            : { ...items[elementId], ...data };
        });
        return { valid: true };
      },
    ),
  };
};

const getSavedItems = (deps) =>
  deps.projectService.getRepositoryState().layouts.items["layout-one"].elements
    .items;

// The real store, bound the way components bind it.
const createStore = (projectService) => {
  let state = produce(layoutEditorStore.createInitialState(), (draft) => {
    layoutEditorStore.syncRepositoryState(
      { state: draft },
      createLayoutEditorRepositoryStoreData({
        repositoryState: projectService.getRepositoryState(),
        layoutId: "layout-one",
      }),
    );
  });
  return new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return layoutEditorStore[name]({ state }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = layoutEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
};

const createDeps = () => {
  const projectService = createProjectService();
  const subject = new Subject();
  subject.dispatch = (action, payload) => subject.next({ action, payload });
  return {
    projectService,
    store: createStore(projectService),
    subject,
    appService: {
      registerBeforeNavigation: () => () => {},
      getPayload: () => ({ l: "layout-one" }),
      showAlert: vi.fn(),
    },
    uiConfig: {},
    i18n: EN_I18N,
    browserEventsClient: { subscribeWindowEvent: () => () => {} },
    refs: {},
    render: vi.fn(),
  };
};

const drag = (deps, itemId, position) =>
  handleLayoutEditorCanvasDragUpdate(deps, {
    _event: {
      detail: {
        itemId,
        updatedItem: { ...getSavedItems(deps)[itemId], ...position },
      },
    },
  });

describe("layout editor pending edits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves an element's waiting edit when another element is edited", async () => {
    const deps = createDeps();
    const cleanup = handleBeforeMount(deps);

    // Element 1 moves, then element 2 moves before element 1's debounced
    // save runs.
    drag(deps, "item-1", { x: 300 });
    await vi.advanceTimersByTimeAsync(200);
    drag(deps, "item-2", { y: 400 });
    await vi.advanceTimersByTimeAsync(1000);

    const items = getSavedItems(deps);
    expect(items["item-1"]).toMatchObject({ x: 300, y: 50 });
    expect(items["item-2"]).toMatchObject({ x: 10, y: 400 });
    // The page shows both saved positions.
    expect(deps.store.selectItemDataById({ itemId: "item-1" })).toMatchObject({
      x: 300,
    });

    await (
      await cleanup
    )?.();
  });

  it("still saves one element's repeated edits once, with the last value", async () => {
    const deps = createDeps();
    const cleanup = handleBeforeMount(deps);

    drag(deps, "item-1", { x: 200 });
    await vi.advanceTimersByTimeAsync(100);
    drag(deps, "item-1", { x: 250 });
    await vi.advanceTimersByTimeAsync(100);
    drag(deps, "item-1", { x: 300 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(deps.projectService.updateLayoutElement).toHaveBeenCalledOnce();
    expect(deps.projectService.updateLayoutElement).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: "item-1", data: { x: 300 } }),
    );

    await (
      await cleanup
    )?.();
  });
});
