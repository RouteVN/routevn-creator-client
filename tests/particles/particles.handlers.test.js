import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleParticleItemClick,
  handleResourceViewBackgroundClick,
} from "../../src/pages/particles/particles.handlers.js";
import * as particleStore from "../../src/pages/particles/particles.store.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createPreviewHarness = () => {
  const state = particleStore.createInitialState();
  state.data = {
    items: Object.fromEntries(
      ["one", "two"].map((id) => [
        id,
        {
          id,
          type: "particle",
          width: 640,
          height: 360,
          modules: { appearance: { texture: `image-${id}` } },
        },
      ]),
    ),
    tree: [],
  };
  state.imagesData = {
    items: {
      "image-one": { fileId: "file-one" },
      "image-two": { fileId: "file-two" },
    },
    tree: [],
  };
  const store = Object.fromEntries(
    Object.entries(particleStore)
      .filter(
        ([name, value]) =>
          name !== "createInitialState" && typeof value === "function",
      )
      .map(([name, fn]) => [name, (payload) => fn({ state }, payload)]),
  );
  const deps = {
    store,
    render: vi.fn(),
    refs: { detailCanvas: {}, fileExplorer: { selectItem: vi.fn() } },
    projectService: {
      subscribeProjectState: vi.fn(() => vi.fn()),
      getFileContent: vi.fn(async (id) => ({
        url: `blob:${id}`,
        type: "image/png",
      })),
    },
    graphicsService: {
      init: vi.fn(async () => {}),
      loadAssets: vi.fn(async () => {}),
      render: vi.fn(),
    },
  };
  const cleanup = handleBeforeMount(deps);
  const select = (id) =>
    handleParticleItemClick(deps, { _event: { detail: { itemId: id } } });
  return { deps, cleanup, select };
};

describe("particles handlers", () => {
  it.each(["init", "getFileContent", "loadAssets"])(
    "does not render or touch the replacement runtime after unmount during %s",
    async (stage) => {
      const { deps, cleanup, select } = createPreviewHarness();
      const pending = deferred();
      const revoke = vi.fn();
      const operation =
        stage === "getFileContent"
          ? deps.projectService.getFileContent
          : deps.graphicsService[stage];
      operation.mockReturnValueOnce(pending.promise);

      const preview = select("one");
      await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
      cleanup();
      pending.resolve({ url: "blob:file-one", type: "image/png", revoke });
      await preview;

      expect(deps.graphicsService.render).not.toHaveBeenCalled();
      expect(deps.store.selectPreviewRuntime().target).toBeUndefined();
      if (stage !== "loadAssets") {
        expect(deps.graphicsService.loadAssets).not.toHaveBeenCalled();
      }
      if (stage === "getFileContent") {
        expect(revoke).toHaveBeenCalledOnce();
      }
    },
  );

  it("keeps the newer particle when an older texture read finishes late", async () => {
    const { deps, cleanup, select } = createPreviewHarness();
    const pending = deferred();
    const revoke = vi.fn();
    deps.projectService.getFileContent.mockReturnValueOnce(pending.promise);

    const firstPreview = select("one");
    await vi.waitFor(() =>
      expect(deps.projectService.getFileContent).toHaveBeenCalledOnce(),
    );
    await select("two");
    pending.resolve({ url: "blob:file-one", type: "image/png", revoke });
    await firstPreview;

    expect(deps.graphicsService.render).toHaveBeenCalledOnce();
    expect(
      deps.graphicsService.render.mock.calls[0][0].elements[1].modules
        .appearance.texture,
    ).toBe("file-two");
    expect(deps.graphicsService.loadAssets).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    cleanup();
  });

  it("loads and renders the selected particle while mounted", async () => {
    const { deps, cleanup, select } = createPreviewHarness();

    await select("one");

    expect(deps.graphicsService.loadAssets).toHaveBeenCalledWith({
      "file-one": { url: "blob:file-one", type: "image/png" },
    });
    expect(deps.graphicsService.render).toHaveBeenCalledOnce();
    expect(deps.store.selectPreviewRuntime()).toEqual({
      target: "detail",
      width: 640,
      height: 360,
    });
    cleanup();
  });

  it("clears selection and preview runtime from a resource background click", async () => {
    const deps = {
      store: {
        setSelectedFolderId: vi.fn(),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        selectIsDialogOpen: vi.fn(() => false),
        selectSelectedParticle: vi.fn(() => undefined),
      },
      refs: {
        fileExplorer: {
          clearSelection: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleResourceViewBackgroundClick(deps);

    expect(deps.store.setSelectedFolderId).toHaveBeenCalledWith({
      folderId: undefined,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.store.clearPreviewRuntime).toHaveBeenCalledOnce();
    expect(deps.refs.fileExplorer.clearSelection).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });
});
