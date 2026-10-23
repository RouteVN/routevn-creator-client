import { describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import {
  handleAssetPreviewClose,
  handleAuthorBack,
  handleAuthorLinkClick,
  handleAuthorLoadMorePacks,
  handleAuthorPacksRetry,
  handleAuthorRetry,
  handleBeforeMount,
  handleCatalogRetry,
  handleFormAction,
  handleSelectionBack,
  handleLoadMorePacks,
  handleOnUpdate,
  handlePackAssetClick,
  handlePackAssetKeyDown,
  handlePackAuthorClick,
  handlePackBack,
  handlePackGridClick,
  handlePackImport,
  handlePackGridKeyDown,
  handlePackGroupKeyDown,
  handlePackGroupToggle,
  handleResourceSelectionKeyDown,
  handleResourceSelectionToggle,
  handleSelectionToggleAll,
  handleStoreSearchInput,
  handleStoreTagsChange,
} from "../../src/components/resource-import-dialog/resource-import-dialog.handlers.js";
import * as dialogStore from "../../src/components/resource-import-dialog/resource-import-dialog.store.js";

const createDeps = () => {
  const plan = {
    planId: "plan-1",
    resources: [{ sourceId: "transform.source", name: "Transform" }],
  };
  return {
    plan,
    deps: {
      i18n: {},
      render: vi.fn(),
      dispatchEvent: vi.fn(),
      appService: {},
      store: {
        selectStep: vi.fn(() => "selection"),
        selectPlan: vi.fn(() => plan),
        selectReviewValues: vi.fn(() => ({})),
        openPackStep: vi.fn(),
        saveReviewValues: vi.fn(),
        setResourceSelected: vi.fn(),
        setAllResourcesSelected: vi.fn(),
        startExecution: vi.fn(),
        setProgress: vi.fn(),
        setError: vi.fn(),
      },
      projectService: {
        validateResourceImportPlan: vi.fn(() => ({ valid: true })),
        executeResourceImportPlan: vi.fn(async () => ({ valid: true })),
      },
    },
  };
};

describe("resource-import-dialog.handlers", () => {
  it("imports the selected resources directly from the selection page", async () => {
    const { deps } = createDeps();
    const values = {
      resource_0_include: true,
      resource_0_name: "Renamed Transform",
      resource_0_description: "Updated description",
    };

    await handleFormAction(deps, {
      _event: {
        detail: { actionId: "import", values, valid: true },
      },
    });

    const expectedChoices = {
      selectedResourceIds: ["transform.source"],
      resourceNames: { "transform.source": "Renamed Transform" },
      resourceDescriptions: {
        "transform.source": "Updated description",
      },
    };
    expect(deps.projectService.validateResourceImportPlan).toHaveBeenCalledWith(
      { planId: "plan-1", ...expectedChoices },
    );
    expect(deps.projectService.executeResourceImportPlan).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "plan-1", ...expectedChoices }),
    );
    expect(deps.store.startExecution).toHaveBeenCalledWith(
      expect.objectContaining({ values }),
    );
    expect(deps.store.saveReviewValues).toHaveBeenCalledWith({ values });
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("imports only checked resources without opening item steps", async () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectStep.mockReturnValue("selection");
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: false,
      resource_1_include: true,
      resource_1_name: "Second Transform",
      resource_1_description: "Second description",
    });
    const values = {};

    await handleFormAction(deps, {
      _event: {
        detail: { actionId: "import", values, valid: true },
      },
    });

    expect(deps.projectService.executeResourceImportPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedResourceIds: ["transform.second"],
        resourceNames: { "transform.second": "Second Transform" },
        resourceDescriptions: {
          "transform.second": "Second description",
        },
      }),
    );
  });

  it("toggles a resource choice from the selection card", () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectReviewValues.mockReturnValue({
      resource_1_include: false,
    });
    const card = {
      dataset: { resourceSourceId: "transform.second" },
      getAttribute: vi.fn(() => "true"),
    };

    handleResourceSelectionToggle(deps, {
      _event: {
        composedPath: vi.fn(() => [{}, card, {}]),
      },
    });

    expect(deps.store.setResourceSelected).toHaveBeenCalledWith({
      sourceId: "transform.second",
      selected: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("allows a required dependency to be deselected", () => {
    const { deps } = createDeps();
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: false,
    });
    const card = {
      dataset: { resourceSourceId: "transform.source" },
      getAttribute: vi.fn(() => "true"),
    };

    handleResourceSelectionToggle(deps, {
      _event: {
        composedPath: vi.fn(() => [card, {}]),
      },
    });

    expect(deps.store.setResourceSelected).toHaveBeenCalledWith({
      sourceId: "transform.source",
      selected: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("toggles a resource choice with Enter or Space", () => {
    const { deps } = createDeps();
    const card = {
      dataset: { resourceSourceId: "transform.source" },
      getAttribute: vi.fn(() => "false"),
    };
    const enterEvent = {
      composedPath: vi.fn(() => [card, {}]),
      key: "Enter",
      preventDefault: vi.fn(),
    };
    const spaceEvent = {
      composedPath: vi.fn(() => [card, {}]),
      key: " ",
      preventDefault: vi.fn(),
    };

    handleResourceSelectionKeyDown(deps, { _event: enterEvent });
    handleResourceSelectionKeyDown(deps, { _event: spaceEvent });

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(spaceEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.store.setResourceSelected).toHaveBeenNthCalledWith(1, {
      sourceId: "transform.source",
      selected: true,
    });
    expect(deps.store.setResourceSelected).toHaveBeenNthCalledWith(2, {
      sourceId: "transform.source",
      selected: true,
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("ignores clicks outside a resource card", () => {
    const { deps } = createDeps();

    handleResourceSelectionToggle(deps, {
      _event: {
        composedPath: vi.fn(() => [{}, {}]),
      },
    });

    expect(deps.store.setResourceSelected).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("toggles all resource choices from the selection control", () => {
    const { deps } = createDeps();

    handleSelectionToggleAll(deps, {
      _event: {
        currentTarget: {
          dataset: { allSelected: "true" },
        },
      },
    });

    expect(deps.store.setAllResourcesSelected).toHaveBeenCalledWith({
      selected: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("keeps the selection page open when nothing is checked", async () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectStep.mockReturnValue("selection");
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: false,
      resource_1_include: false,
    });

    await handleFormAction(deps, {
      _event: {
        detail: {
          actionId: "import",
          values: {},
          valid: true,
        },
      },
    });

    expect(
      deps.projectService.executeResourceImportPlan,
    ).not.toHaveBeenCalled();
    expect(deps.store.saveReviewValues).toHaveBeenCalledWith({
      values: {},
    });
    expect(deps.store.setError).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: "no_resources_selected" }),
      step: "selection",
    });
  });
});

// The dialog's real store, driven the way the component drives it.
const createStoreDeps = () => {
  const state = dialogStore.createInitialState();
  const store = {};
  for (const [name, fn] of Object.entries(dialogStore)) {
    if (name !== "createInitialState" && name !== "selectViewData") {
      store[name] = (payload) => fn({ state }, payload);
    }
  }
  const deps = {
    i18n: {},
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    store,
    subject: new Subject(),
    props: { open: false },
    appService: {
      listAssetStorePacks: vi.fn(),
      getAssetStorePack: vi.fn(),
      getAssetStoreAuthor: vi.fn(),
      openUrl: vi.fn(),
      getPath: vi.fn(() => "/project/scenes"),
    },
    projectService: {
      createResourceImportPlan: vi.fn(),
      cancelResourceImport: vi.fn(),
    },
  };
  return { state, deps };
};

const storePack = (id) => ({
  id,
  title: `Pack ${id}`,
  assetCount: 3,
  coverUrl: `https://files.example/${id}.png`,
  description: [`About ${id}.`],
  screenshotUrls: [`https://files.example/${id}-shot.jpg`],
  releasedAt: 1786492800000,
  author: { id: "author-1", name: "Author One", avatarUrl: undefined },
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const openDialog = (deps) =>
  handleOnUpdate(deps, {
    oldProps: { open: false },
    newProps: { open: true },
  });

const closeDialog = (deps) =>
  handleOnUpdate(deps, {
    oldProps: { open: true },
    newProps: { open: false },
  });

const clickPack = (deps, packId) =>
  handlePackGridClick(deps, {
    _event: { composedPath: () => [{}, { dataset: { packId } }, {}] },
  });

describe("resource-import-dialog asset store", () => {
  it("loads the first page of packs when the dialog opens", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
      nextCursor: "cursor-2",
    });

    openDialog(deps);
    expect(state.catalog.status).toBe("loading");
    await settle();

    expect(deps.appService.listAssetStorePacks).toHaveBeenCalledWith({
      cursor: undefined,
      query: "",
      tags: [],
    });
    expect(state.step).toBe("store");
    expect(state.catalog).toMatchObject({
      status: "ready",
      packs: [storePack("pack-1")],
      nextCursor: "cursor-2",
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("appends the next page and retries a failed page with its cursor", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks
      .mockResolvedValueOnce({ packs: [storePack("pack-1")], nextCursor: "c2" })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ packs: [storePack("pack-2")] });

    openDialog(deps);
    await settle();
    await handleLoadMorePacks(deps);
    expect(state.catalog).toMatchObject({
      status: "error",
      failedCursor: "c2",
      packs: [storePack("pack-1")],
    });

    await handleCatalogRetry(deps);

    expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
      cursor: "c2",
      query: "",
      tags: [],
    });
    expect(state.catalog.status).toBe("ready");
    expect(state.catalog.packs.map((pack) => pack.id)).toEqual([
      "pack-1",
      "pack-2",
    ]);
    expect(state.catalog.nextCursor).toBeUndefined();
  });

  it("drops a page that arrives after the dialog reopened", async () => {
    const { state, deps } = createStoreDeps();
    const stale = deferred();
    deps.appService.listAssetStorePacks
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ packs: [storePack("fresh")] });

    openDialog(deps);
    closeDialog(deps);
    openDialog(deps);
    await settle();
    stale.resolve({ packs: [storePack("stale")] });
    await settle();

    expect(state.catalog.packs.map((pack) => pack.id)).toEqual(["fresh"]);
  });

  it("opens a pack's page at once, then loads its details and its assets through its import link", async () => {
    const { state, deps } = createStoreDeps();
    const plan = { planId: "plan-1", package: {}, resources: [] };
    const detail = {
      ...storePack("pack-1"),
      description: ["About the pack."],
      screenshotUrls: [],
      importUrl: "https://files.example/manifest.json",
    };
    const details = deferred();
    const planned = deferred();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockReturnValue(details.promise);
    deps.projectService.createResourceImportPlan.mockReturnValue(
      planned.promise,
    );
    openDialog(deps);
    await settle();

    const opening = clickPack(deps, "pack-1");
    expect(state).toMatchObject({
      step: "pack",
      packStatus: "details",
      isBusy: false,
      pack: {
        id: "pack-1",
        title: "Pack pack-1",
        coverUrl: "https://files.example/pack-1.png",
        description: ["About pack-1."],
        screenshotUrls: ["https://files.example/pack-1-shot.jpg"],
        releasedAt: 1786492800000,
      },
    });
    expect(deps.appService.getAssetStorePack).toHaveBeenCalledWith({
      assetPackId: "pack-1",
    });

    details.resolve(detail);
    await settle();
    expect(state).toMatchObject({ packStatus: "assets", pack: detail });
    expect(deps.projectService.createResourceImportPlan).toHaveBeenCalledWith({
      url: "https://files.example/manifest.json",
      operationId: state.operationId,
    });

    planned.resolve({ valid: true, plan });
    await opening;
    expect(state).toMatchObject({
      step: "pack",
      packStatus: "ready",
      pack: detail,
      plan,
      planPackId: "pack-1",
      operationId: undefined,
    });

    handlePackImport(deps);
    expect(state.step).toBe("selection");
  });

  it("drops a loading pack's requests when Back leaves it", async () => {
    const { state, deps } = createStoreDeps();
    const details = deferred();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockReturnValue(details.promise);
    openDialog(deps);
    await settle();

    const opening = clickPack(deps, "pack-1");
    const { operationId } = state;
    handlePackBack(deps);
    expect(deps.projectService.cancelResourceImport).toHaveBeenCalledWith({
      operationId,
    });
    expect(state.step).toBe("store");

    details.resolve({ ...storePack("pack-1"), importUrl: "https://x.test/m" });
    await opening;
    expect(state.step).toBe("store");
    expect(deps.projectService.createResourceImportPlan).not.toHaveBeenCalled();
  });

  it("keeps the author page open when the pack's assets finish loading", async () => {
    const { state, deps } = createStoreDeps();
    const planned = deferred();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack("pack-1"),
      description: [],
      screenshotUrls: [],
      importUrl: "https://files.example/manifest.json",
    });
    deps.appService.getAssetStoreAuthor.mockResolvedValue({
      id: "author-1",
      name: "Author One",
      description: [],
      links: [],
    });
    deps.projectService.createResourceImportPlan.mockReturnValue(
      planned.promise,
    );
    openDialog(deps);
    await settle();

    const opening = clickPack(deps, "pack-1");
    await settle();
    await handlePackAuthorClick(deps);
    expect(state.step).toBe("author");

    planned.resolve({
      valid: true,
      plan: { planId: "plan-1", package: {}, resources: [] },
    });
    await opening;
    expect(state).toMatchObject({ step: "author", packStatus: "ready" });
  });

  it("steps back from selection to the pack page and the store, and reopens the pack without fetching it again", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack("pack-1"),
      importUrl: "https://files.example/manifest.json",
    });
    deps.projectService.createResourceImportPlan.mockResolvedValue({
      valid: true,
      plan: { planId: "plan-1", package: {}, resources: [] },
    });
    openDialog(deps);
    await settle();
    await clickPack(deps, "pack-1");
    handlePackImport(deps);

    handleSelectionBack(deps);
    expect(state.step).toBe("pack");
    handlePackBack(deps);
    expect(state.step).toBe("store");
    await clickPack(deps, "pack-1");

    expect(state.step).toBe("pack");
    expect(deps.appService.getAssetStorePack).toHaveBeenCalledTimes(1);
  });

  it("shows a localized message when a pack is no longer available", async () => {
    const { state, deps } = createStoreDeps();
    deps.i18n = {
      resourceImportErrors: { asset_pack_not_found: "That pack is gone." },
    };
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockRejectedValue(
      Object.assign(new Error("raw server text"), {
        code: "asset_pack_not_found",
      }),
    );
    openDialog(deps);
    await settle();

    await clickPack(deps, "pack-1");

    expect(state.error.message).toBe("That pack is gone.");
    expect(state).toMatchObject({
      step: "pack",
      packStatus: "failed",
      operationId: undefined,
    });
    expect(deps.projectService.createResourceImportPlan).not.toHaveBeenCalled();
  });

  it("shows the importer's error when the pack cannot be planned", async () => {
    const { state, deps } = createStoreDeps();
    deps.i18n = {
      resourceImportErrors: { manifest_network_error: "Package unavailable." },
    };
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockResolvedValue({
      importUrl: "https://files.example/manifest.json",
    });
    deps.projectService.createResourceImportPlan.mockResolvedValue({
      valid: false,
      error: { code: "manifest_network_error" },
    });
    openDialog(deps);
    await settle();

    await clickPack(deps, "pack-1");

    expect(state.error.message).toBe("Package unavailable.");
    expect(state).toMatchObject({ step: "pack", packStatus: "failed" });
  });

  it("opens a pack with Enter or Space and ignores other keys", async () => {
    const { deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockReturnValue(new Promise(() => {}));
    openDialog(deps);
    await settle();
    const card = { dataset: { packId: "pack-1" } };
    const keyEvent = (key) => ({
      key,
      composedPath: () => [card],
      preventDefault: vi.fn(),
    });
    const tab = keyEvent("Tab");
    const enter = keyEvent("Enter");

    handlePackGridKeyDown(deps, { _event: tab });
    expect(deps.appService.getAssetStorePack).not.toHaveBeenCalled();
    handlePackGridKeyDown(deps, { _event: enter });

    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(enter.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.appService.getAssetStorePack).toHaveBeenCalledWith({
      assetPackId: "pack-1",
    });
  });

  it("searches once typing settles and ignores another dialog's input", async () => {
    vi.useFakeTimers();
    try {
      const { state, deps } = createStoreDeps();
      const other = createStoreDeps();
      deps.appService.listAssetStorePacks.mockResolvedValue({ packs: [] });
      const cleanup = handleBeforeMount(deps);
      openDialog(deps);
      await vi.runAllTimersAsync();
      deps.appService.listAssetStorePacks.mockClear();
      const type = (target, value) =>
        handleStoreSearchInput(target, {
          _event: { detail: { value } },
        });

      type(deps, "tra");
      type(deps, "transition ");
      other.deps.subject = deps.subject;
      type(other.deps, "dragon");
      await vi.advanceTimersByTimeAsync(299);
      expect(deps.appService.listAssetStorePacks).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(deps.appService.listAssetStorePacks).toHaveBeenCalledTimes(1);
      expect(deps.appService.listAssetStorePacks).toHaveBeenCalledWith({
        cursor: undefined,
        query: "transition",
        tags: [],
      });
      expect(state.searchText).toBe("transition ");

      type(deps, "transition");
      await vi.advanceTimersByTimeAsync(300);
      expect(deps.appService.listAssetStorePacks).toHaveBeenCalledTimes(1);

      cleanup();
      type(deps, "after close");
      await vi.advanceTimersByTimeAsync(300);
      expect(deps.appService.listAssetStorePacks).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens filtered by the tag of the resource page it opened from", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({ packs: [] });
    deps.appService.getPath.mockReturnValue("/project/audio-effects");

    openDialog(deps);
    await settle();
    expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
      cursor: undefined,
      query: "",
      tags: ["AUDIO_EFFECTS"],
    });

    await handleStoreTagsChange(deps, { _event: { detail: { value: [] } } });
    closeDialog(deps);
    deps.appService.getPath.mockReturnValue("/project/images");
    openDialog(deps);
    await settle();
    expect(state.catalog.tags).toEqual(["IMAGES"]);
    expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
      cursor: undefined,
      query: "",
      tags: ["IMAGES"],
    });

    closeDialog(deps);
    deps.appService.getPath.mockReturnValue("/project/layouts");
    openDialog(deps);
    await settle();
    expect(state.catalog.tags).toEqual([]);
  });

  it("reloads the first page when saved tags change, keeping the search", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    dialogStore.setCatalogQuery({ state }, { query: "fade" });
    const saveTags = (value) =>
      handleStoreTagsChange(deps, { _event: { detail: { value } } });

    await saveTags(["SOUNDS", "IMAGES"]);
    expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
      cursor: undefined,
      query: "fade",
      tags: ["SOUNDS", "IMAGES"],
    });
    expect(state.catalog.packs).toEqual([storePack("pack-1")]);

    await saveTags(["IMAGES", "SOUNDS"]);
    expect(deps.appService.listAssetStorePacks).toHaveBeenCalledTimes(2);

    await saveTags([]);
    expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
      cursor: undefined,
      query: "fade",
      tags: [],
    });
  });

  it("collapses and expands a pack folder group by click or key", () => {
    const { state, deps } = createStoreDeps();
    const target = { dataset: { groupKey: "images:folder.masks" } };

    handlePackGroupToggle(deps, { _event: { currentTarget: target } });
    expect(state.collapsedPackGroupKeys).toEqual(["images:folder.masks"]);

    const press = (key) => {
      const _event = { key, currentTarget: target, preventDefault: vi.fn() };
      handlePackGroupKeyDown(deps, { _event });
      return _event;
    };
    expect(press("Tab").preventDefault).not.toHaveBeenCalled();
    expect(state.collapsedPackGroupKeys).toEqual(["images:folder.masks"]);
    expect(press("Enter").preventDefault).toHaveBeenCalled();
    expect(state.collapsedPackGroupKeys).toEqual([]);
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("opens an asset's preview from its card by click or key, and closes it", () => {
    const { state, deps } = createStoreDeps();
    const card = { dataset: { assetSourceId: "images:image-1" } };

    handlePackAssetClick(deps, {
      _event: { composedPath: () => [{}, card, {}] },
    });
    expect(state.previewAssetSourceId).toBe("images:image-1");
    handleAssetPreviewClose(deps);
    expect(state.previewAssetSourceId).toBeUndefined();

    const space = {
      key: " ",
      composedPath: () => [card],
      preventDefault: vi.fn(),
    };
    handlePackAssetKeyDown(deps, { _event: space });
    expect(space.preventDefault).toHaveBeenCalledTimes(1);
    expect(state.previewAssetSourceId).toBe("images:image-1");

    handlePackAssetClick(deps, { _event: { composedPath: () => [{}] } });
    expect(state.previewAssetSourceId).toBe("images:image-1");
    expect(deps.render).toHaveBeenCalledTimes(3);
  });

  const openPackPage = async (deps, packId = "pack-1") => {
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack(packId),
      importUrl: `https://files.example/${packId}.json`,
    });
    deps.projectService.createResourceImportPlan.mockResolvedValue({
      valid: true,
      plan: { planId: `plan-${packId}`, package: {}, resources: [] },
    });
    await clickPack(deps, packId);
  };

  const authorProfile = {
    id: "author-1",
    name: "Author One",
    avatarUrl: undefined,
    description: ["Makes transitions."],
    links: [{ label: "X", url: "https://x.example/author" }],
  };

  it("opens the pack's author page and steps back to the pack", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.listAssetStorePacks.mockClear();
    deps.appService.getAssetStoreAuthor.mockResolvedValue(authorProfile);
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1"), storePack("pack-2")],
      nextCursor: "author-c2",
    });

    const loading = handlePackAuthorClick(deps);
    expect(state.step).toBe("author");
    expect(state.author.status).toBe("loading");
    await loading;

    expect(deps.appService.getAssetStoreAuthor).toHaveBeenCalledWith({
      authorId: "author-1",
    });
    expect(deps.appService.listAssetStorePacks).toHaveBeenCalledWith({
      authorId: "author-1",
    });
    expect(state.author).toMatchObject({
      status: "ready",
      profile: authorProfile,
      nextCursor: "author-c2",
    });
    expect(state.author.packs.map((pack) => pack.id)).toEqual([
      "pack-1",
      "pack-2",
    ]);

    handleAuthorBack(deps);
    expect(state.step).toBe("pack");
    handlePackAuthorClick(deps);
    expect(state.step).toBe("author");
    expect(deps.appService.getAssetStoreAuthor).toHaveBeenCalledTimes(1);
  });

  it("returns to the author page from a pack opened there", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreAuthor.mockResolvedValue(authorProfile);
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1"), storePack("pack-2")],
    });
    await handlePackAuthorClick(deps);

    await openPackPage(deps, "pack-2");
    expect(state).toMatchObject({ step: "pack", planPackId: "pack-2" });
    handlePackBack(deps);
    expect(state.step).toBe("author");
    handleAuthorBack(deps);
    expect(state.step).toBe("pack");
    handlePackBack(deps);
    expect(state.step).toBe("author");
  });

  it("shows a missing author's message and retries", async () => {
    const { state, deps } = createStoreDeps();
    deps.i18n = {
      resourceImportErrors: { asset_author_not_found: "Author gone." },
    };
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreAuthor.mockRejectedValueOnce(
      Object.assign(new Error("raw"), { code: "asset_author_not_found" }),
    );

    await handlePackAuthorClick(deps);
    expect(state.author).toMatchObject({
      status: "error",
      error: { message: "Author gone." },
    });

    deps.appService.getAssetStoreAuthor.mockResolvedValue(authorProfile);
    await handleAuthorRetry(deps);
    expect(state.author.status).toBe("ready");
    handleAuthorBack(deps);
    expect(state.step).toBe("pack");
  });

  it("pages through an author's packs and retries a failed page", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreAuthor.mockResolvedValue(authorProfile);
    deps.appService.listAssetStorePacks
      .mockResolvedValueOnce({ packs: [storePack("pack-1")], nextCursor: "a2" })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ packs: [storePack("pack-2")] });
    await handlePackAuthorClick(deps);

    await handleAuthorLoadMorePacks(deps);
    expect(state.author).toMatchObject({
      morePacksFailed: true,
      packsFailedCursor: "a2",
    });
    await handleAuthorPacksRetry(deps);

    expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
      cursor: "a2",
      authorId: "author-1",
    });
    expect(state.author.packs.map((pack) => pack.id)).toEqual([
      "pack-1",
      "pack-2",
    ]);
    expect(state.author.nextCursor).toBeUndefined();
  });

  it("opens an author's link in the system browser", () => {
    const { deps } = createStoreDeps();

    handleAuthorLinkClick(deps, {
      _event: {
        composedPath: () => [{}, { dataset: { url: "https://x.example" } }],
      },
    });
    handleAuthorLinkClick(deps, { _event: { composedPath: () => [{}] } });

    expect(deps.appService.openUrl).toHaveBeenCalledTimes(1);
    expect(deps.appService.openUrl).toHaveBeenCalledWith("https://x.example");
  });
});
