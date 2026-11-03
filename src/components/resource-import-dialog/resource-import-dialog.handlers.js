import { debounceTime, filter } from "rxjs";
import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../internal/assetPackageResources.js";
import { generateId } from "../../internal/id.js";

const SELECTION_STEP = "selection";
const STORE_SEARCH_ACTION = "resourceImport.storeSearch";
const STORE_SEARCH_CANCEL_ACTION = "resourceImport.storeSearchCancel";
const STORE_SEARCH_DEBOUNCE_MS = 300;

const mapErrorMessage = (error, i18n = {}) => {
  const copy = i18n.resourceImport ?? {};
  const messages = i18n.resourceImportErrors ?? {};
  return {
    ...error,
    message: messages[error?.code] ?? error?.message ?? copy.failed,
  };
};

// What a pack's links and dependencies can go to in the project: its
// sections and scenes, in story order, and its resources of each type, in
// project order. A section's label names its scene.
const createProjectTargets = ({ repositoryState, i18n = {} }) => {
  const copy = i18n.resourceImport ?? {};
  const listIds = (collection, type) => {
    const ids = [];
    const visit = (nodes) => {
      for (const node of nodes ?? []) {
        if (collection?.items?.[node.id]?.type === type) ids.push(node.id);
        visit(node.children);
      }
    };
    visit(collection?.tree);
    return ids;
  };
  const scenesData = repositoryState?.scenes;
  const scenes = listIds(scenesData, "scene").map((sceneId) => ({
    value: sceneId,
    label: scenesData.items[sceneId].name ?? "",
    name: scenesData.items[sceneId].name ?? "",
  }));
  const sections = scenes.flatMap((scene) => {
    const sectionsData = scenesData.items[scene.value].sections;
    const sectionIds = (sectionsData?.tree ?? [])
      .map((node) => node.id)
      .filter((sectionId) => sectionsData.items?.[sectionId]);
    return sectionIds.map((sectionId) => {
      const name = sectionsData.items[sectionId].name ?? "";
      return {
        value: sectionId,
        label: (copy.linkSectionLabel ?? "{scene} / {section}")
          .replace("{scene}", scene.name)
          .replace("{section}", name),
        name,
        sceneName: scene.name,
      };
    });
  });
  const resourcesByType = Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_CONFIGS.map(({ resourceType, itemType }) => {
      const collection = repositoryState?.[resourceType];
      return [
        resourceType,
        listIds(collection, itemType).map((itemId) => ({
          value: itemId,
          label: collection.items[itemId].name ?? "",
          name: collection.items[itemId].name ?? "",
          layoutType: collection.items[itemId].layoutType,
        })),
      ];
    }),
  );
  return { sections, scenes, resourcesByType };
};

const syncFromProps = (deps, props, { reset = false } = {}) => {
  deps.store.syncFromProps({ props, reset });
};

// Loads the first page of the store, or the page after `cursor`. A response
// that arrives after a newer request, or after the dialog reopened, is dropped.
const loadCatalog = async (deps, { cursor } = {}) => {
  const { appService, store, render } = deps;
  const requestId = generateId();
  store.startCatalogLoad({ requestId, cursor });
  render();
  try {
    const page = await appService.listAssetStorePacks({
      cursor,
      query: store.selectCatalogQuery(),
    });
    if (store.selectCatalogRequestId() !== requestId) return;
    store.setCatalogPage({ packs: page.packs, nextCursor: page.nextCursor });
  } catch {
    if (store.selectCatalogRequestId() !== requestId) return;
    store.setCatalogError({ cursor });
  }
  render();
};

// The store opens on every pack, whichever page it opened from.
const openStore = (deps) => loadCatalog(deps);

// Typing settles for a moment before the store reloads with the new query.
const searchCatalog = (deps, value) => {
  const { store } = deps;
  const query = value.trim();
  if (query === store.selectCatalogQuery()) return;
  store.setCatalogQuery({ query });
  loadCatalog(deps);
};

// A cancel, sent when the dialog closes, takes the place of a search still
// waiting for typing to settle, so that search never runs.
const mountSearchSubscription = (deps) => {
  const { store, subject } = deps;
  return subject
    .pipe(
      filter(
        ({ action, payload }) =>
          (action === STORE_SEARCH_ACTION ||
            action === STORE_SEARCH_CANCEL_ACTION) &&
          payload.instanceId === store.selectInstanceId(),
      ),
      debounceTime(STORE_SEARCH_DEBOUNCE_MS),
      filter(({ action }) => action === STORE_SEARCH_ACTION),
    )
    .subscribe(({ payload }) => searchCatalog(deps, payload.value));
};

// Leaving a pack without importing it, by Back, by opening another pack or by
// closing the dialog, stops what is still loading or importing and frees the
// pack's plan with the previews read for it. The dialog forgets the plan
// first, so it is freed once.
const leavePack = (deps) => {
  const { projectService, store } = deps;
  const operationId = store.selectOperationId();
  if (operationId) projectService.cancelResourceImport({ operationId });
  const planId = store.selectPlan()?.planId;
  store.clearPlan();
  if (planId) projectService.discardResourceImportPlan({ planId });
};

const closeStore = (deps) => {
  const { store, subject } = deps;
  leavePack(deps);
  subject.dispatch(STORE_SEARCH_CANCEL_ACTION, {
    instanceId: store.selectInstanceId(),
  });
};

export const handleBeforeMount = (deps) => {
  syncFromProps(deps, deps.props);
  if (deps.props.open === true) openStore(deps);
  const searchSubscription = mountSearchSubscription(deps);
  return () => {
    searchSubscription.unsubscribe();
    leavePack(deps);
  };
};

export const handleOnUpdate = (deps, payload = {}) => {
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};
  if (oldProps.open === newProps.open) return;
  if (newProps.open !== true) closeStore(deps);
  syncFromProps(deps, newProps);
  if (newProps.open === true) {
    openStore(deps);
    return;
  }
  deps.render();
};

const emitCancelled = ({ dispatchEvent }) => {
  dispatchEvent(new CustomEvent("import-cancelled"));
};

export const handleStoreSearchInput = (deps, payload) => {
  const { store, subject } = deps;
  const value = payload._event.detail.value ?? "";
  store.setSearchText({ value });
  subject.dispatch(STORE_SEARCH_ACTION, {
    instanceId: store.selectInstanceId(),
    value,
  });
};

export const handleCatalogRetry = (deps) => {
  const { store } = deps;
  return loadCatalog(deps, { cursor: store.selectCatalogFailedCursor() });
};

export const handleLoadMorePacks = (deps) => {
  const { store } = deps;
  return loadCatalog(deps, { cursor: store.selectCatalogNextCursor() });
};

// Opens the pack page at once from the pack's card, then loads the pack's
// details, with its description, and, from the manifest inside its published
// package, the import plan whose assets the page lists. Reopening the pack
// whose plan is loaded, from its creator's page, keeps the choices made for
// it; opening another pack leaves this one. A response for a pack the user
// has left is dropped, and a plan made for it is freed.
const openPack = async (deps, packId) => {
  const { appService, projectService, store, render } = deps;
  if (store.selectPlan() && store.selectPlanPackId() === packId) {
    store.reopenPackPage();
    render();
    return;
  }

  leavePack(deps);
  const operationId = generateId();
  store.startOpeningPack({
    operationId,
    pack: store.selectCatalogPackById({ packId }),
  });
  render();
  let pack;
  try {
    pack = await appService.getAssetStorePack({ assetPackId: packId });
  } catch (error) {
    if (store.selectOperationId() !== operationId) return;
    store.setPackLoadError({
      error: mapErrorMessage({ code: error.code }, deps.i18n),
    });
    render();
    return;
  }
  if (store.selectOperationId() !== operationId) return;
  store.setPackDetails({ pack });
  render();

  const result = await projectService.createResourceImportPlan({
    zip: pack.package,
    operationId,
    dependencyFolderName: pack.title,
  });
  if (store.selectOperationId() !== operationId) {
    if (result.valid) {
      projectService.discardResourceImportPlan({ planId: result.plan.planId });
    }
    return;
  }
  if (result.valid === false) {
    store.setPackLoadError({ error: mapErrorMessage(result.error, deps.i18n) });
    render();
    return;
  }
  store.setPackPage({
    plan: result.plan,
    projectTargets: createProjectTargets({
      repositoryState: projectService.getRepositoryState?.(),
      i18n: deps.i18n,
    }),
  });
  render();
};

export const handlePackBack = (deps) => {
  const { store, render } = deps;
  leavePack(deps);
  store.returnFromPackPage();
  render();
};

// Loads a creator's profile and packs in one request. A response for an
// earlier request, or from before the dialog reopened, is dropped.
const loadCreator = async (deps, creatorId) => {
  const { appService, store, render } = deps;
  const requestId = generateId();
  store.startCreatorLoad({ requestId, creatorId });
  render();
  try {
    const page = await appService.getAssetStoreCreator({ creatorId });
    if (store.selectCreatorRequestId() !== requestId) return;
    store.setCreatorPage({ profile: page.creator, packs: page.packs });
  } catch (error) {
    if (store.selectCreatorRequestId() !== requestId) return;
    store.setCreatorError({
      error: mapErrorMessage({ code: error.code }, deps.i18n),
    });
  }
  render();
};

const openCreator = (deps, creatorId) => {
  const { store, render } = deps;
  if (
    store.selectCreatorId() === creatorId &&
    store.selectCreatorStatus() === "ready"
  ) {
    store.reopenCreatorPage();
    render();
    return;
  }
  return loadCreator(deps, creatorId);
};

export const handlePackCreatorClick = (deps) => {
  const { store } = deps;
  return openCreator(deps, store.selectPack().creator.id);
};

export const handlePackCreatorKeyDown = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") return;
  _event.preventDefault();
  return openCreator(deps, store.selectPack().creator.id);
};

export const handleCreatorBack = (deps) => {
  const { store, render } = deps;
  store.returnFromCreatorPage();
  render();
};

export const handleCreatorRetry = (deps) => {
  const { store } = deps;
  return loadCreator(deps, store.selectCreatorId());
};

// Creator profile links open in the system browser.
export const handleCreatorLinkClick = (deps, payload) => {
  const { appService } = deps;
  const link = payload._event
    .composedPath()
    .find((target) => target?.dataset?.url !== undefined);
  if (!link) return;
  appService.openUrl(link.dataset.url);
};

export const handlePackImport = (deps) => {
  const { store, render } = deps;
  store.reopenLoadedPlan();
  render();
};

const findAssetCard = (_event) =>
  _event
    .composedPath()
    .find((target) => target?.dataset?.assetSourceId !== undefined);

const openAssetPreview = (deps, card) => {
  const { store, render } = deps;
  store.openAssetPreview({ sourceId: card.dataset.assetSourceId });
  render();
};

export const handlePackAssetClick = (deps, payload) => {
  const card = findAssetCard(payload._event);
  if (!card) return;
  openAssetPreview(deps, card);
};

export const handlePackAssetKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") return;
  const card = findAssetCard(_event);
  if (!card) return;
  _event.preventDefault();
  openAssetPreview(deps, card);
};

export const handlePackGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  store.togglePackGroup({ key: payload._event.currentTarget.dataset.groupKey });
  render();
};

export const handlePackGroupKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") return;
  _event.preventDefault();
  handlePackGroupToggle(deps, payload);
};

export const handleAssetPreviewClose = (deps) => {
  const { store, render } = deps;
  store.closeAssetPreview();
  render();
};

// A click closes the preview, except on a preview's own controls, such as a
// sound's player.
export const handleAssetPreviewOverlayClick = (deps, payload) => {
  const onControls = payload._event
    .composedPath()
    .some((target) => target?.dataset?.previewControls !== undefined);
  if (onControls) return;
  handleAssetPreviewClose(deps);
};

const findPackCard = (_event) =>
  _event.composedPath().find((target) => target?.dataset?.packId !== undefined);

export const handlePackGridClick = (deps, payload) => {
  const card = findPackCard(payload._event);
  if (!card) return;
  return openPack(deps, card.dataset.packId);
};

export const handlePackGridKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") return;
  const card = findPackCard(_event);
  if (!card) return;
  _event.preventDefault();
  return openPack(deps, card.dataset.packId);
};

export const handleDialogClose = (deps) => {
  closeStore(deps);
  emitCancelled(deps);
};

const buildReviewPayload = ({ plan, values }) => {
  const selectedResourceIds = [];
  const resourceNames = {};
  const resourceDescriptions = {};
  plan.resources.forEach((resource, index) => {
    if (values[`resource_${index}_include`] === true) {
      selectedResourceIds.push(resource.sourceId);
      resourceNames[resource.sourceId] = values[`resource_${index}_name`];
      resourceDescriptions[resource.sourceId] =
        values[`resource_${index}_description`];
    }
  });
  // What replaces each dependency, or "pack" for the pack's own; empty is
  // unchosen.
  const dependencyReplacements = Object.fromEntries(
    (plan.dependencies ?? []).map((dependency, index) => [
      dependency.sourceId,
      values[`dependency_${index}`] ?? "",
    ]),
  );
  // Where each link goes; empty is unchosen.
  const linkTargets = Object.fromEntries(
    (plan.links ?? []).map((link, index) => [
      link.id,
      values[`link_${index}`] ?? "",
    ]),
  );
  return {
    selectedResourceIds,
    resourceNames,
    resourceDescriptions,
    linkTargets,
    dependencyReplacements,
  };
};

const mergeReviewValues = (store, values) => {
  const mergedValues = {};
  Object.assign(mergedValues, store.selectReviewValues(), values);
  return mergedValues;
};

const handleReviewSubmit = async (deps, values) => {
  const { dispatchEvent, projectService, store, render } = deps;
  store.saveReviewValues({ values });
  const plan = store.selectPlan();
  const choices = buildReviewPayload({ plan, values });
  const validation = projectService.validateResourceImportPlan({
    planId: plan.planId,
    ...choices,
  });
  if (validation.valid === false) {
    store.setError({
      error: mapErrorMessage(validation.error, deps.i18n),
      step: SELECTION_STEP,
    });
    render();
    return;
  }

  const operationId = generateId();
  store.startExecution({ values, operationId });
  render();
  const result = await projectService.executeResourceImportPlan({
    planId: plan.planId,
    operationId,
    ...choices,
    onProgress(progress) {
      store.setProgress({ progress });
      render();
    },
  });
  if (result.valid === false) {
    store.setError({
      error: mapErrorMessage(result.error, deps.i18n),
      step: SELECTION_STEP,
    });
    render();
    return;
  }
  dispatchEvent(
    new CustomEvent("import-complete", {
      detail: result,
    }),
  );
};

// The store keeps the choices made here, so the pack's Import reopens them.
export const handleSelectionBack = (deps) => {
  const { store, render } = deps;
  store.openPackStep();
  render();
};

// The form reports its values only on Import, so each dependency and link
// choice is kept as it is made: after Back, even on to the creator's page and
// back, the pack's Import reopens the selection with it.
export const handleFormChange = (deps, payload) => {
  const { store } = deps;
  const { name, value } = payload._event.detail;
  store.saveReviewValues({ values: { [name]: value } });
};

export const handleFormAction = async (deps, payload) => {
  const { store, render } = deps;
  const { actionId, values, valid } = payload._event.detail;
  if (valid === false) return;
  const step = store.selectStep();
  if (actionId === "import" && step === SELECTION_STEP) {
    const mergedValues = mergeReviewValues(store, values);
    const hasSelectedResource = store
      .selectPlan()
      .resources.some(
        (_resource, index) =>
          mergedValues[`resource_${index}_include`] === true,
      );
    if (!hasSelectedResource) {
      store.saveReviewValues({ values });
      store.setError({
        error: mapErrorMessage(
          {
            code: "no_resources_selected",
            message: "Choose at least one resource to import.",
          },
          deps.i18n,
        ),
        step: SELECTION_STEP,
      });
      render();
      return;
    }
    await handleReviewSubmit(deps, mergedValues);
  }
};

const findResourceSelectionCard = (_event) =>
  _event
    .composedPath()
    .find((target) => target?.dataset?.resourceSourceId !== undefined);

const toggleResourceSelection = (deps, _event) => {
  const { store, render } = deps;
  const card = findResourceSelectionCard(_event);
  if (!card) return;
  const sourceId = card.dataset.resourceSourceId;
  const selected = card.getAttribute("aria-pressed") !== "true";
  store.setResourceSelected({ sourceId, selected });
  render();
};

export const handleResourceSelectionToggle = (deps, payload) => {
  toggleResourceSelection(deps, payload._event);
};

export const handleResourceSelectionKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") return;
  if (!findResourceSelectionCard(_event)) return;
  _event.preventDefault();
  toggleResourceSelection(deps, _event);
};

export const handleSelectionToggleAll = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget } = payload._event;
  const selected = currentTarget.dataset.allSelected !== "true";
  store.setAllResourcesSelected({ selected });
  render();
};

export const handleCancelProgress = (deps) => {
  const operationId = deps.store.selectOperationId();
  if (operationId) {
    deps.projectService.cancelResourceImport({ operationId });
  }
};
