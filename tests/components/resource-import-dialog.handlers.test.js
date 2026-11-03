import { describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import {
  handleAssetPreviewClose,
  handleAssetPreviewOverlayClick,
  handleBeforeMount,
  handleCatalogRetry,
  handleCreatorBack,
  handleCreatorLinkClick,
  handleCreatorRetry,
  handleDialogClose,
  handleFormAction,
  handleSelectionBack,
  handleLoadMorePacks,
  handleOnUpdate,
  handlePackAssetClick,
  handlePackAssetKeyDown,
  handlePackBack,
  handlePackCreatorClick,
  handlePackGridClick,
  handlePackImport,
  handlePackGridKeyDown,
  handlePackGroupKeyDown,
  handlePackGroupToggle,
  handleResourceSelectionKeyDown,
  handleResourceSelectionToggle,
  handleSelectionToggleAll,
  handleStoreSearchInput,
} from "../../src/components/resource-import-dialog/resource-import-dialog.handlers.js";
import * as dialogStore from "../../src/components/resource-import-dialog/resource-import-dialog.store.js";

// A pack's published package, as the store client reads it.
const packagePlace = (url) => ({
  url,
  size: 1000,
  directoryOffset: 900,
  directorySize: 100,
});

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
      refs: {
        workflowForm: { setValues: vi.fn() },
      },
      store: {
        selectStep: vi.fn(() => "selection"),
        selectPlan: vi.fn(() => plan),
        selectReviewValues: vi.fn(() => ({})),
        selectChoiceFieldValues: vi.fn(() => ({})),
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
  it("closes from its close button, cancelling an import in progress and freeing its plan", () => {
    const { deps } = createDeps();
    deps.store.selectOperationId = vi.fn(() => "operation-1");
    deps.store.selectInstanceId = vi.fn(() => "instance-1");
    deps.store.clearPlan = vi.fn();
    deps.subject = { dispatch: vi.fn() };
    deps.projectService.cancelResourceImport = vi.fn();
    deps.projectService.discardResourceImportPlan = vi.fn();

    handleDialogClose(deps);

    expect(deps.projectService.cancelResourceImport).toHaveBeenCalledWith({
      operationId: "operation-1",
    });
    expect(deps.store.clearPlan).toHaveBeenCalledTimes(1);
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledWith({
      planId: "plan-1",
    });
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "import-cancelled" }),
    );
  });

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
      linkTargets: {},
      dependencyReplacements: {},
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

  it("starts the dependency and link selects a selection adds at their values, keeping the ones shown", () => {
    const { deps } = createDeps();
    // The user changed the shown select; the store still has its start.
    deps.store.selectChoiceFieldValues
      .mockReturnValueOnce({ dependency_0: "font-2" })
      .mockReturnValueOnce({
        dependency_0: "font-2",
        dependency_1: "",
        link_0: "section-2",
      });
    const card = {
      dataset: { resourceSourceId: "transform.source" },
      getAttribute: vi.fn(() => "false"),
    };

    handleResourceSelectionToggle(deps, {
      _event: { composedPath: vi.fn(() => [card]) },
    });

    expect(deps.refs.workflowForm.setValues).toHaveBeenCalledTimes(1);
    expect(deps.refs.workflowForm.setValues).toHaveBeenCalledWith({
      values: { dependency_1: "", link_0: "section-2" },
    });
    expect(deps.render.mock.invocationCallOrder[0]).toBeLessThan(
      deps.refs.workflowForm.setValues.mock.invocationCallOrder[0],
    );
  });

  it("starts the selects Select All adds at their values", () => {
    const { deps } = createDeps();
    deps.store.selectChoiceFieldValues
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ dependency_0: "font-2" });

    handleSelectionToggleAll(deps, {
      _event: { currentTarget: { dataset: { allSelected: "false" } } },
    });

    expect(deps.refs.workflowForm.setValues).toHaveBeenCalledWith({
      values: { dependency_0: "font-2" },
    });
  });

  it("leaves the form as it is when a selection adds no select", () => {
    const { deps } = createDeps();
    deps.store.selectChoiceFieldValues
      .mockReturnValueOnce({ dependency_0: "font-2" })
      .mockReturnValueOnce({});
    const card = {
      dataset: { resourceSourceId: "transform.source" },
      getAttribute: vi.fn(() => "true"),
    };

    handleResourceSelectionToggle(deps, {
      _event: { composedPath: vi.fn(() => [card]) },
    });

    expect(deps.refs.workflowForm.setValues).not.toHaveBeenCalled();
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
      getAssetStoreCreator: vi.fn(),
      openUrl: vi.fn(),
      getPath: vi.fn(() => "/project/scenes"),
    },
    projectService: {
      createResourceImportPlan: vi.fn(),
      cancelResourceImport: vi.fn(),
      discardResourceImportPlan: vi.fn(),
    },
  };
  return { state, deps };
};

const storePack = (id) => ({
  id,
  title: `Pack ${id}`,
  assetCounts: [{ assetType: "IMAGES", count: 3 }],
  assetCount: 3,
  coverUrl: `https://files.example/${id}.png`,
  releasedAt: 1786492800000,
  creator: { id: "creator-1", name: "Creator One", avatarUrl: undefined },
});

// Creator page cards are the store list's cards.
const creatorPack = (id) => storePack(id);

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
      description: [{ text: "About the pack." }],
      versionName: "1.0.0",
      package: packagePlace("https://files.example/pack.zip"),
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
    // The list card shows at once. The card has no description; the page
    // shows none until the details.
    expect(state).toMatchObject({
      step: "pack",
      packStatus: "details",
      isBusy: false,
      pack: {
        id: "pack-1",
        title: "Pack pack-1",
        coverUrl: "https://files.example/pack-1.png",
        description: [],
        releasedAt: 1786492800000,
        creator: { id: "creator-1", name: "Creator One" },
      },
    });
    expect(dialogStore.selectViewData({ state }).pack).toMatchObject({
      description: [],
    });
    expect(deps.appService.getAssetStorePack).toHaveBeenCalledWith({
      assetPackId: "pack-1",
    });

    details.resolve(detail);
    await settle();
    expect(state).toMatchObject({ packStatus: "assets", pack: detail });
    // The details replace the card.
    expect(dialogStore.selectViewData({ state }).pack).toMatchObject({
      description: [{ text: "About the pack." }],
      versionName: "1.0.0",
    });
    expect(deps.projectService.createResourceImportPlan).toHaveBeenCalledWith({
      zip: packagePlace("https://files.example/pack.zip"),
      operationId: state.operationId,
      // The pack's dependencies go into a folder named after it.
      dependencyFolderName: expect.any(String),
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

    details.resolve({
      ...storePack("pack-1"),
      package: packagePlace("https://x.test/pack.zip"),
    });
    await opening;
    expect(state.step).toBe("store");
    expect(deps.projectService.createResourceImportPlan).not.toHaveBeenCalled();
  });

  it("frees a plan made for a pack the user left while it loaded", async () => {
    const { state, deps } = createStoreDeps();
    const planned = deferred();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack("pack-1"),
      package: packagePlace("https://files.example/pack.zip"),
    });
    deps.projectService.createResourceImportPlan.mockReturnValue(
      planned.promise,
    );
    openDialog(deps);
    await settle();

    const opening = clickPack(deps, "pack-1");
    await settle();
    expect(deps.projectService.createResourceImportPlan).toHaveBeenCalled();
    handlePackBack(deps);
    expect(
      deps.projectService.discardResourceImportPlan,
    ).not.toHaveBeenCalled();

    planned.resolve({
      valid: true,
      plan: { planId: "plan-late", package: {}, resources: [] },
    });
    await opening;
    expect(state).toMatchObject({ step: "store", plan: undefined });
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledWith({
      planId: "plan-late",
    });
  });

  it("frees the open pack's plan once when the dialog closes, from its close button or otherwise", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack("pack-1"),
      package: packagePlace("https://files.example/pack.zip"),
    });
    deps.projectService.createResourceImportPlan.mockResolvedValue({
      valid: true,
      plan: { planId: "plan-1", package: {}, resources: [] },
    });
    openDialog(deps);
    await settle();
    await clickPack(deps, "pack-1");
    handlePackImport(deps);

    handleDialogClose(deps);
    closeDialog(deps);
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledTimes(
      1,
    );
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledWith({
      planId: "plan-1",
    });
    expect(state.plan).toBeUndefined();

    openDialog(deps);
    await settle();
    await clickPack(deps, "pack-1");
    closeDialog(deps);
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledTimes(
      2,
    );

    // Leaving the page under the dialog frees it too.
    const cleanup = handleBeforeMount(deps);
    openDialog(deps);
    await settle();
    await clickPack(deps, "pack-1");
    cleanup();
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledTimes(
      3,
    );
  });

  it("keeps the creator page open when the pack's assets finish loading", async () => {
    const { state, deps } = createStoreDeps();
    const planned = deferred();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack("pack-1"),
      description: [],
      package: packagePlace("https://files.example/pack.zip"),
    });
    deps.appService.getAssetStoreCreator.mockResolvedValue({
      creator: {
        id: "creator-1",
        name: "Creator One",
        description: [],
        links: [],
      },
      packs: [],
    });
    deps.projectService.createResourceImportPlan.mockReturnValue(
      planned.promise,
    );
    openDialog(deps);
    await settle();

    const opening = clickPack(deps, "pack-1");
    await settle();
    await handlePackCreatorClick(deps);
    expect(state.step).toBe("creator");

    planned.resolve({
      valid: true,
      plan: { planId: "plan-1", package: {}, resources: [] },
    });
    await opening;
    expect(state).toMatchObject({ step: "creator", packStatus: "ready" });
  });

  it("steps back from selection to the pack page and the store, freeing the pack's plan, and loads the pack again when reopened", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack("pack-1"),
      package: packagePlace("https://files.example/pack.zip"),
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
    expect(state).toMatchObject({ step: "pack", plan: { planId: "plan-1" } });
    expect(
      deps.projectService.discardResourceImportPlan,
    ).not.toHaveBeenCalled();
    handlePackBack(deps);
    expect(state).toMatchObject({ step: "store", plan: undefined });
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledWith({
      planId: "plan-1",
    });
    await clickPack(deps, "pack-1");

    expect(state).toMatchObject({ step: "pack", plan: { planId: "plan-1" } });
    expect(deps.appService.getAssetStorePack).toHaveBeenCalledTimes(2);
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledTimes(
      1,
    );
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
      package: packagePlace("https://files.example/pack.zip"),
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

  it("drops a search typed just before the dialog closed, and a late page for it", async () => {
    vi.useFakeTimers();
    try {
      const { state, deps } = createStoreDeps();
      const cleanup = handleBeforeMount(deps);
      deps.appService.listAssetStorePacks.mockResolvedValue({
        packs: [storePack("all")],
      });
      openDialog(deps);
      await vi.runAllTimersAsync();
      deps.appService.listAssetStorePacks.mockClear();
      const type = (value) =>
        handleStoreSearchInput(deps, { _event: { detail: { value } } });

      // Closed before typing settled: the search never runs.
      type("dragon");
      await vi.advanceTimersByTimeAsync(100);
      closeDialog(deps);
      openDialog(deps);
      await vi.advanceTimersByTimeAsync(1000);
      expect(deps.appService.listAssetStorePacks).toHaveBeenCalledTimes(1);
      expect(deps.appService.listAssetStorePacks).toHaveBeenCalledWith({
        cursor: undefined,
        query: "",
      });
      expect(state.catalog).toMatchObject({ query: "", status: "ready" });
      expect(state.catalog.packs.map((pack) => pack.id)).toEqual(["all"]);

      // Closed while the search loaded: its page does not replace the list.
      const late = deferred();
      deps.appService.listAssetStorePacks
        .mockReturnValueOnce(late.promise)
        .mockResolvedValueOnce({ packs: [storePack("fresh")] });
      type("dragon");
      await vi.advanceTimersByTimeAsync(300);
      expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
        cursor: undefined,
        query: "dragon",
      });
      closeDialog(deps);
      openDialog(deps);
      await vi.advanceTimersByTimeAsync(0);
      late.resolve({ packs: [storePack("dragon")] });
      await vi.advanceTimersByTimeAsync(1000);
      expect(state).toMatchObject({
        searchText: "",
        catalog: { query: "", status: "ready" },
      });
      expect(state.catalog.packs.map((pack) => pack.id)).toEqual(["fresh"]);
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens on every pack, whichever page it opened from", async () => {
    const { deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({ packs: [] });

    for (const path of [
      "/project/images",
      "/project/layouts",
      "/project/scenes",
    ]) {
      deps.appService.getPath.mockReturnValue(path);
      openDialog(deps);
      await settle();
      expect(deps.appService.listAssetStorePacks).toHaveBeenLastCalledWith({
        cursor: undefined,
        query: "",
      });
      closeDialog(deps);
    }
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

  it("keeps a preview open for clicks on its controls, such as a sound's player", () => {
    const { state, deps } = createStoreDeps();
    state.previewAssetSourceId = "sounds:sound-1";
    const controls = { dataset: { previewControls: "true" } };

    handleAssetPreviewOverlayClick(deps, {
      _event: { composedPath: () => [{}, controls, { dataset: {} }] },
    });
    expect(state.previewAssetSourceId).toBe("sounds:sound-1");
    expect(deps.render).not.toHaveBeenCalled();

    handleAssetPreviewOverlayClick(deps, {
      _event: { composedPath: () => [{ dataset: {} }, {}] },
    });
    expect(state.previewAssetSourceId).toBeUndefined();
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  const openPackPage = async (deps, packId = "pack-1") => {
    deps.appService.getAssetStorePack.mockResolvedValue({
      ...storePack(packId),
      description: [],
      package: packagePlace(`https://files.example/${packId}.zip`),
    });
    deps.projectService.createResourceImportPlan.mockResolvedValue({
      valid: true,
      plan: { planId: `plan-${packId}`, package: {}, resources: [] },
    });
    await clickPack(deps, packId);
  };

  const creatorProfile = {
    id: "creator-1",
    name: "Creator One",
    avatarUrl: undefined,
    description: ["Makes transitions."],
    links: [{ label: "X", url: "https://x.example/creator" }],
  };

  const creatorPage = (
    packs = [creatorPack("pack-1"), creatorPack("pack-2")],
  ) => ({
    creator: creatorProfile,
    packs,
  });

  it("opens the pack's creator page with their packs from one request and steps back to the pack", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.listAssetStorePacks.mockClear();
    deps.appService.getAssetStoreCreator.mockResolvedValue(creatorPage());

    const loading = handlePackCreatorClick(deps);
    expect(state.step).toBe("creator");
    expect(state.creator.status).toBe("loading");
    await loading;

    expect(deps.appService.getAssetStoreCreator).toHaveBeenCalledTimes(1);
    expect(deps.appService.getAssetStoreCreator).toHaveBeenCalledWith({
      creatorId: "creator-1",
    });
    expect(deps.appService.listAssetStorePacks).not.toHaveBeenCalled();
    expect(state.creator).toMatchObject({
      status: "ready",
      profile: creatorProfile,
    });
    expect(state.creator.packs.map((pack) => pack.id)).toEqual([
      "pack-1",
      "pack-2",
    ]);
    expect(
      dialogStore
        .selectViewData({ state })
        .creator.packs.map((pack) => pack.id),
    ).toEqual(["pack-1", "pack-2"]);

    handleCreatorBack(deps);
    expect(state.step).toBe("pack");
    handlePackCreatorClick(deps);
    expect(state.step).toBe("creator");
    expect(deps.appService.getAssetStoreCreator).toHaveBeenCalledTimes(1);
  });

  it("drops a creator page that arrives after a newer request", async () => {
    const { state, deps } = createStoreDeps();
    const stale = deferred();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreCreator
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(creatorPage([creatorPack("fresh")]));

    const first = handlePackCreatorClick(deps);
    await handleCreatorRetry(deps);
    stale.resolve(creatorPage([creatorPack("stale")]));
    await first;

    expect(state.creator.status).toBe("ready");
    expect(state.creator.packs.map((pack) => pack.id)).toEqual(["fresh"]);
  });

  it("returns to the creator page from a pack opened there, then to the store list once the first pack is replaced", async () => {
    const { state, deps } = createStoreDeps();
    const { discardResourceImportPlan } = deps.projectService;
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreCreator.mockResolvedValue(creatorPage());
    await handlePackCreatorClick(deps);

    // Another pack replaces the first one's plan.
    await openPackPage(deps, "pack-2");
    expect(discardResourceImportPlan).toHaveBeenCalledWith({
      planId: "plan-pack-1",
    });
    expect(state).toMatchObject({ step: "pack", planPackId: "pack-2" });
    expect(state.pack.creator).toEqual(storePack("pack-2").creator);
    handlePackBack(deps);
    expect(state.step).toBe("creator");
    expect(discardResourceImportPlan).toHaveBeenLastCalledWith({
      planId: "plan-pack-2",
    });
    handleCreatorBack(deps);
    expect(state.step).toBe("store");
    expect(discardResourceImportPlan).toHaveBeenCalledTimes(2);
  });

  it("returns from the creator page to the pack it was opened from, keeping its plan", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreCreator.mockResolvedValue(creatorPage());
    await handlePackCreatorClick(deps);

    handleCreatorBack(deps);
    expect(state).toMatchObject({
      step: "pack",
      planPackId: "pack-1",
      plan: { planId: "plan-pack-1" },
    });
    expect(
      deps.projectService.discardResourceImportPlan,
    ).not.toHaveBeenCalled();
    handlePackBack(deps);
    expect(state.step).toBe("store");
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledWith({
      planId: "plan-pack-1",
    });
  });

  it("reopens a pack from its creator's page without looping Back between them", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreCreator.mockResolvedValue(creatorPage());
    await handlePackCreatorClick(deps);

    // The same pack, from the creator's list, keeps its plan.
    await clickPack(deps, "pack-1");
    expect(state).toMatchObject({ step: "pack", planPackId: "pack-1" });
    expect(deps.appService.getAssetStorePack).toHaveBeenCalledTimes(1);
    expect(
      deps.projectService.discardResourceImportPlan,
    ).not.toHaveBeenCalled();

    handlePackBack(deps);
    expect(state.step).toBe("creator");
    handleCreatorBack(deps);
    expect(state.step).toBe("store");
    expect(deps.projectService.discardResourceImportPlan).toHaveBeenCalledTimes(
      1,
    );
  });

  it("reaches the store list with Back after any way through packs and creator pages", async () => {
    const { state, deps } = createStoreDeps();
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1"), storePack("pack-2")],
    });
    deps.appService.getAssetStoreCreator.mockResolvedValue(creatorPage());
    const back = () =>
      state.step === "pack" ? handlePackBack(deps) : handleCreatorBack(deps);
    // Each move, where the page allows it.
    const moves = {
      pack1: () => state.step !== "pack" && openPackPage(deps, "pack-1"),
      pack2: () => state.step !== "pack" && openPackPage(deps, "pack-2"),
      creator: () => state.step === "pack" && handlePackCreatorClick(deps),
      back: () => state.step !== "store" && back(),
    };
    const paths = [[]];
    for (const path of paths) {
      if (path.length === 4) continue;
      for (const move of Object.keys(moves)) paths.push([...path, move]);
    }

    const { createResourceImportPlan, discardResourceImportPlan } =
      deps.projectService;
    for (const path of paths) {
      openDialog(deps);
      await settle();
      createResourceImportPlan.mockClear();
      discardResourceImportPlan.mockClear();
      for (const move of path) await moves[move]();
      // Back returns through the pages opened, at most one press each.
      let presses = 0;
      while (state.step !== "store" && presses <= path.length) {
        back();
        presses += 1;
      }
      expect({ path, step: state.step }).toEqual({ path, step: "store" });
      // Every plan made was freed once, and closing frees none again.
      expect({
        path,
        freed: discardResourceImportPlan.mock.calls.length,
      }).toEqual({ path, freed: createResourceImportPlan.mock.calls.length });
      closeDialog(deps);
      expect(discardResourceImportPlan).toHaveBeenCalledTimes(
        createResourceImportPlan.mock.calls.length,
      );
    }
  });

  it("shows a missing creator's message and retries", async () => {
    const { state, deps } = createStoreDeps();
    deps.i18n = {
      resourceImportErrors: { asset_creator_not_found: "Creator gone." },
    };
    deps.appService.listAssetStorePacks.mockResolvedValue({
      packs: [storePack("pack-1")],
    });
    openDialog(deps);
    await settle();
    await openPackPage(deps);
    deps.appService.getAssetStoreCreator.mockRejectedValueOnce(
      Object.assign(new Error("raw"), { code: "asset_creator_not_found" }),
    );

    await handlePackCreatorClick(deps);
    expect(state.creator).toMatchObject({
      status: "error",
      error: { message: "Creator gone." },
    });

    deps.appService.getAssetStoreCreator.mockResolvedValue(creatorPage());
    await handleCreatorRetry(deps);
    expect(state.creator.status).toBe("ready");
    handleCreatorBack(deps);
    expect(state.step).toBe("pack");
  });

  it("opens a creator's link in the system browser", () => {
    const { deps } = createStoreDeps();

    handleCreatorLinkClick(deps, {
      _event: {
        composedPath: () => [{}, { dataset: { url: "https://x.example" } }],
      },
    });
    handleCreatorLinkClick(deps, { _event: { composedPath: () => [{}] } });

    expect(deps.appService.openUrl).toHaveBeenCalledTimes(1);
    expect(deps.appService.openUrl).toHaveBeenCalledWith("https://x.example");
  });
});
