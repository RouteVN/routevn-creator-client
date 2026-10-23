import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { formatCalendarDate, formatPercent } from "../../internal/dates.js";
import { generateId } from "../../internal/id.js";

const STORE_STEP = "store";
const PACK_STEP = "pack";
const AUTHOR_STEP = "author";
const SELECTION_STEP = "selection";
const PROGRESS_STEP = "progress";

// The asset store's tag filter, in the order it shows them. Each tag names a
// kind of resource a pack holds, takes that resource type's name, and is
// chosen when the store opens from that resource type's page.
const STORE_TAGS = Object.freeze([
  { tag: "IMAGES", resourceType: "images", path: "/project/images" },
  { tag: "SOUNDS", resourceType: "sounds", path: "/project/sounds" },
  { tag: "VIDEOS", resourceType: "videos", path: "/project/videos" },
  {
    tag: "CHARACTERS",
    resourceType: "characters",
    path: "/project/characters",
  },
  {
    tag: "TRANSFORMS",
    resourceType: "transforms",
    path: "/project/transforms",
  },
  {
    tag: "ANIMATIONS",
    resourceType: "animations",
    path: "/project/animations",
  },
  {
    tag: "AUDIO_EFFECTS",
    resourceType: "audioEffects",
    path: "/project/audio-effects",
  },
  { tag: "PARTICLES", resourceType: "particles", path: "/project/particles" },
  {
    tag: "SPRITESHEETS",
    resourceType: "spritesheets",
    path: "/project/spritesheets",
  },
  { tag: "COLORS", resourceType: "colors", path: "/project/colors" },
  { tag: "FONTS", resourceType: "fonts", path: "/project/fonts" },
  {
    tag: "TEXT_STYLES",
    resourceType: "textStyles",
    path: "/project/text-styles",
  },
  { tag: "VARIABLES", resourceType: "variables", path: "/project/variables" },
  { tag: "CONTROLS", resourceType: "controls", path: "/project/controls" },
]);

const createCatalogState = () => ({
  status: "idle",
  query: "",
  tags: [],
  packs: [],
  nextCursor: undefined,
  requestId: undefined,
  loadingMore: false,
  failedCursor: undefined,
});

const createAuthorState = () => ({
  status: "idle",
  id: undefined,
  requestId: undefined,
  profile: undefined,
  error: undefined,
  packs: [],
  nextCursor: undefined,
  packsRequestId: undefined,
  loadingMorePacks: false,
  packsFailedCursor: undefined,
  morePacksFailed: false,
});

const getResourceLabel = (resource, index, copy) =>
  resource.name || `${copy.resourceFallback ?? "Resource"} ${index + 1}`;

const hasPackageMetadata = (plan) =>
  ["name", "publisher", "source"].some((key) => plan?.package?.[key]);

const getIncludedResourceIndexes = ({ plan, values }) =>
  plan.resources
    .map((_resource, index) => index)
    .filter((index) => values[`resource_${index}_include`] === true);

const getRequiredDependencySourceIds = ({ plan, values }) => {
  const resourceBySourceId = new Map(
    plan.resources.map((resource) => [resource.sourceId, resource]),
  );
  const selectedSourceIds = new Set(
    getIncludedResourceIndexes({ plan, values }).map(
      (index) => plan.resources[index].sourceId,
    ),
  );
  const requiredSourceIds = new Set();
  const pendingSourceIds = [...selectedSourceIds];
  while (pendingSourceIds.length > 0) {
    const sourceId = pendingSourceIds.pop();
    const resource = resourceBySourceId.get(sourceId);
    for (const dependencySourceId of resource?.dependencySourceIds ?? []) {
      if (!requiredSourceIds.has(dependencySourceId)) {
        requiredSourceIds.add(dependencySourceId);
        pendingSourceIds.push(dependencySourceId);
      }
    }
  }
  return requiredSourceIds;
};

const getReviewResources = ({ plan, values }) => {
  const requiredSourceIds = getRequiredDependencySourceIds({ plan, values });
  return plan.resources.map((resource, resourceIndex) => {
    const selected = values[`resource_${resourceIndex}_include`] === true;
    return {
      resource,
      resourceIndex,
      selected,
      required: selected && requiredSourceIds.has(resource.sourceId),
    };
  });
};

const formatResourceType = (resourceType = "resource") => {
  const label = resourceType.replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const RESOURCE_TYPE_COPY_KEYS = Object.freeze({
  animations: "animationTypeLabel",
  audioEffects: "audioEffectTypeLabel",
  characters: "characterTypeLabel",
  colors: "colorTypeLabel",
  controls: "controlTypeLabel",
  fonts: "fontTypeLabel",
  images: "imageTypeLabel",
  layouts: "layoutTypeLabel",
  particles: "particleTypeLabel",
  sounds: "soundTypeLabel",
  spritesheets: "spritesheetTypeLabel",
  textStyles: "textStyleTypeLabel",
  transforms: "transformTypeLabel",
  variables: "variableTypeLabel",
  videos: "videoTypeLabel",
});

const getResourceTypeLabel = ({ resource, copy }) => {
  const copyKey = RESOURCE_TYPE_COPY_KEYS[resource.resourceType];
  return (
    copy[copyKey] ?? formatResourceType(resource.type ?? resource.resourceType)
  );
};

const createFallbackReviewSections = (resources) => {
  const sectionsByResourceType = new Map();
  for (const resource of resources) {
    let section = sectionsByResourceType.get(resource.resourceType);
    if (!section) {
      section = {
        resourceType: resource.resourceType,
        items: [{ kind: "resources", sourceIds: [], depth: 0 }],
      };
      sectionsByResourceType.set(resource.resourceType, section);
    }
    section.items[0].sourceIds.push(resource.sourceId);
  }
  return [...sectionsByResourceType.values()];
};

// The title and Back are in the selection-header slot, so they scroll with
// the resources and only Import stays in place.
const selectionForm = ({ copy }) => {
  return {
    fields: [
      { type: "slot", slot: "selection-header" },
      { type: "slot", slot: "selection-controls" },
      { type: "slot", slot: "resource-selection-grid" },
    ],
    actions: {
      buttons: [
        {
          id: "import",
          variant: "pr",
          label: copy.importButton ?? "Import",
          validate: true,
        },
      ],
    },
  };
};

const createReviewValues = (plan) => {
  const values = {};
  plan.resources.forEach((resource, index) => {
    values[`resource_${index}_include`] = true;
    values[`resource_${index}_name`] = resource.name;
    values[`resource_${index}_description`] = resource.description ?? "";
  });
  return values;
};

export const createInitialState = () => ({
  // Tells this dialog's search events apart from another mounted dialog's.
  instanceId: generateId(),
  open: false,
  step: STORE_STEP,
  searchText: "",
  catalog: createCatalogState(),
  planPackId: undefined,
  pack: undefined,
  // The pack page loads in order: "details", then "assets", then "ready";
  // "failed" keeps what it has under the error.
  packStatus: "idle",
  // Where Back leads from the pack page and from the author page.
  packReturnStep: STORE_STEP,
  authorReturnStep: STORE_STEP,
  author: createAuthorState(),
  // Folder groups collapsed on the pack page.
  collapsedPackGroupKeys: [],
  previewAssetSourceId: undefined,
  reviewValues: {},
  plan: undefined,
  error: undefined,
  isBusy: false,
  operationId: undefined,
  progress: { phase: "downloading", completed: 0, total: 0 },
  formKey: 0,
});

export const syncFromProps = ({ state }, { props, reset = false } = {}) => {
  const wasOpen = state.open;
  state.open = props.open === true;

  if (reset || (!wasOpen && state.open)) {
    state.step = STORE_STEP;
    state.searchText = "";
    state.catalog = createCatalogState();
    state.planPackId = undefined;
    state.pack = undefined;
    state.packStatus = "idle";
    state.packReturnStep = STORE_STEP;
    state.authorReturnStep = STORE_STEP;
    state.author = createAuthorState();
    state.collapsedPackGroupKeys = [];
    state.previewAssetSourceId = undefined;
    state.reviewValues = {};
    state.plan = undefined;
    state.error = undefined;
    state.isBusy = false;
    state.operationId = undefined;
    state.formKey += 1;
  }
};

export const setSearchText = ({ state }, { value } = {}) => {
  state.searchText = value;
};

// A new query reloads the store from its first page.
export const setCatalogQuery = ({ state }, { query } = {}) => {
  state.catalog.query = query;
};

// New tags reload the store from its first page.
export const setCatalogTags = ({ state }, { tags } = {}) => {
  state.catalog.tags = tags;
};

// Chooses the tag of the resource page at `path`, or none.
export const setCatalogTagsForPath = ({ state }, { path } = {}) => {
  const pageTag = STORE_TAGS.find((storeTag) => storeTag.path === path);
  state.catalog.tags = pageTag ? [pageTag.tag] : [];
};

// A first page replaces the list; a cursor appends the next page to it.
export const startCatalogLoad = ({ state }, { requestId, cursor } = {}) => {
  state.catalog.status = "loading";
  state.catalog.requestId = requestId;
  state.catalog.loadingMore = cursor !== undefined;
  state.catalog.failedCursor = undefined;
  if (cursor === undefined) {
    state.catalog.packs = [];
    state.catalog.nextCursor = undefined;
  }
};

export const setCatalogPage = ({ state }, { packs, nextCursor } = {}) => {
  state.catalog.status = "ready";
  state.catalog.requestId = undefined;
  state.catalog.loadingMore = false;
  state.catalog.packs.push(...packs);
  state.catalog.nextCursor = nextCursor;
};

export const setCatalogError = ({ state }, { cursor } = {}) => {
  state.catalog.status = "error";
  state.catalog.requestId = undefined;
  state.catalog.loadingMore = false;
  state.catalog.failedCursor = cursor;
};

// A pack opens from the store list or an author page at once, with what its
// card shows: everything but the version, the last update and the assets,
// which load next. Back returns there.
export const startOpeningPack = ({ state }, { operationId, pack } = {}) => {
  state.operationId = operationId;
  state.packReturnStep = state.step;
  state.step = PACK_STEP;
  state.pack = {
    id: pack.id,
    title: pack.title,
    coverUrl: pack.coverUrl,
    assetCount: pack.assetCount,
    author: pack.author,
    description: pack.description,
    screenshotUrls: pack.screenshotUrls,
    releasedAt: pack.releasedAt,
  };
  state.packStatus = "details";
  state.plan = undefined;
  state.planPackId = undefined;
  state.reviewValues = {};
  state.previewAssetSourceId = undefined;
  state.collapsedPackGroupKeys = [];
  state.error = undefined;
};

export const setPackDetails = ({ state }, { pack } = {}) => {
  state.pack = pack;
  state.packStatus = "assets";
};

// The page stays open with what it has, under the error.
export const setPackLoadError = ({ state }, { error } = {}) => {
  state.error = error;
  state.operationId = undefined;
  state.packStatus = "failed";
};

export const setPlan = ({ state }, { plan } = {}) => {
  state.plan = plan;
  state.previewAssetSourceId = undefined;
  state.reviewValues = createReviewValues(plan);
  state.step = SELECTION_STEP;
  state.isBusy = false;
  state.operationId = undefined;
  state.error = undefined;
  state.formKey += 1;
};

// The pack's assets, read from its manifest, finish the pack page. Import then
// opens the selection without another request. The step stays as it is, so
// a page the user moved on to, such as the author's, stays open.
export const setPackPage = ({ state }, { plan } = {}) => {
  state.plan = plan;
  state.planPackId = state.pack.id;
  state.reviewValues = createReviewValues(plan);
  state.operationId = undefined;
  state.packStatus = "ready";
  state.formKey += 1;
};

export const togglePackGroup = ({ state }, { key } = {}) => {
  const keys = state.collapsedPackGroupKeys;
  const index = keys.indexOf(key);
  if (index === -1) {
    keys.push(key);
  } else {
    keys.splice(index, 1);
  }
};

export const openAssetPreview = ({ state }, { sourceId } = {}) => {
  state.previewAssetSourceId = sourceId;
};

export const closeAssetPreview = ({ state }) => {
  state.previewAssetSourceId = undefined;
};

export const reopenPackPage = ({ state }) => {
  state.packReturnStep = state.step;
  state.step = PACK_STEP;
  state.error = undefined;
};

// Leaving a pack that is still loading drops its requests.
export const returnFromPackPage = ({ state }) => {
  state.step = state.packReturnStep;
  state.operationId = undefined;
  state.error = undefined;
};

// The author page opens from a pack page or, for an author already loaded,
// again from wherever it was left.
export const startAuthorLoad = ({ state }, { requestId, authorId } = {}) => {
  if (state.step !== AUTHOR_STEP) state.authorReturnStep = state.step;
  state.step = AUTHOR_STEP;
  state.error = undefined;
  state.author = createAuthorState();
  state.author.status = "loading";
  state.author.id = authorId;
  state.author.requestId = requestId;
};

export const reopenAuthorPage = ({ state }) => {
  state.authorReturnStep = state.step;
  state.step = AUTHOR_STEP;
  state.error = undefined;
};

export const setAuthorPage = (
  { state },
  { profile, packs, nextCursor } = {},
) => {
  state.author.status = "ready";
  state.author.requestId = undefined;
  state.author.profile = profile;
  state.author.packs = packs;
  state.author.nextCursor = nextCursor;
};

export const setAuthorError = ({ state }, { error } = {}) => {
  state.author.status = "error";
  state.author.requestId = undefined;
  state.author.error = error;
};

export const startAuthorPacksLoad = ({ state }, { requestId } = {}) => {
  state.author.packsRequestId = requestId;
  state.author.loadingMorePacks = true;
  state.author.morePacksFailed = false;
  state.author.packsFailedCursor = undefined;
};

export const setAuthorPacksPage = ({ state }, { packs, nextCursor } = {}) => {
  state.author.packsRequestId = undefined;
  state.author.loadingMorePacks = false;
  state.author.packs.push(...packs);
  state.author.nextCursor = nextCursor;
};

export const setAuthorPacksError = ({ state }, { cursor } = {}) => {
  state.author.packsRequestId = undefined;
  state.author.loadingMorePacks = false;
  state.author.morePacksFailed = true;
  state.author.packsFailedCursor = cursor;
};

export const returnFromAuthorPage = ({ state }) => {
  state.step =
    state.authorReturnStep === PACK_STEP && state.plan ? PACK_STEP : STORE_STEP;
  state.error = undefined;
};

export const openStoreStep = ({ state }) => {
  state.step = STORE_STEP;
  state.error = undefined;
};

export const openPackStep = ({ state }) => {
  state.step = PACK_STEP;
  state.error = undefined;
  state.formKey += 1;
};

export const reopenLoadedPlan = ({ state }) => {
  if (!state.plan) return;
  state.step = SELECTION_STEP;
  state.error = undefined;
  state.formKey += 1;
};

export const saveReviewValues = ({ state }, { values } = {}) => {
  for (const [key, value] of Object.entries(values ?? {})) {
    state.reviewValues[key] = value;
  }
};

export const setResourceSelected = ({ state }, { sourceId, selected } = {}) => {
  const resourceIndexBySourceId = new Map(
    state.plan.resources.map((item, index) => [item.sourceId, index]),
  );
  const resource = state.plan.resources[resourceIndexBySourceId.get(sourceId)];
  if (selected !== true) {
    const dependentSourceIdsByDependencySourceId = new Map();
    for (const item of state.plan.resources) {
      for (const dependencySourceId of item.dependencySourceIds ?? []) {
        const dependentSourceIds =
          dependentSourceIdsByDependencySourceId.get(dependencySourceId) ?? [];
        dependentSourceIds.push(item.sourceId);
        dependentSourceIdsByDependencySourceId.set(
          dependencySourceId,
          dependentSourceIds,
        );
      }
    }

    const pendingSourceIds = [resource.sourceId];
    const deselectedSourceIds = new Set();
    while (pendingSourceIds.length > 0) {
      const sourceId = pendingSourceIds.pop();
      if (deselectedSourceIds.has(sourceId)) continue;
      deselectedSourceIds.add(sourceId);
      const index = resourceIndexBySourceId.get(sourceId);
      if (index === undefined) continue;
      state.reviewValues[`resource_${index}_include`] = false;
      for (const dependentSourceId of dependentSourceIdsByDependencySourceId.get(
        sourceId,
      ) ?? []) {
        const dependentIndex = resourceIndexBySourceId.get(dependentSourceId);
        if (state.reviewValues[`resource_${dependentIndex}_include`] === true) {
          pendingSourceIds.push(dependentSourceId);
        }
      }
    }
    return;
  }

  const pendingSourceIds = [resource.sourceId];
  while (pendingSourceIds.length > 0) {
    const sourceId = pendingSourceIds.pop();
    const index = resourceIndexBySourceId.get(sourceId);
    if (index === undefined) continue;
    state.reviewValues[`resource_${index}_include`] = true;
    pendingSourceIds.push(
      ...(state.plan.resources[index].dependencySourceIds ?? []),
    );
  }
};

export const setAllResourcesSelected = ({ state }, { selected } = {}) => {
  state.plan.resources.forEach((_resource, index) => {
    state.reviewValues[`resource_${index}_include`] = selected === true;
  });
};

export const startExecution = ({ state }, { values, operationId } = {}) => {
  for (const [key, value] of Object.entries(values ?? {})) {
    state.reviewValues[key] = value;
  }
  state.step = PROGRESS_STEP;
  state.isBusy = true;
  state.operationId = operationId;
  state.error = undefined;
};

export const setProgress = ({ state }, { progress } = {}) => {
  state.progress = progress;
};

export const setError = ({ state }, { error, step } = {}) => {
  state.error = error;
  state.isBusy = false;
  state.operationId = undefined;
  if (step) state.step = step;
  state.formKey += 1;
};

export const selectPlan = ({ state }) => state.plan;
export const selectPlanPackId = ({ state }) => state.planPackId;
export const selectStep = ({ state }) => state.step;
export const selectOperationId = ({ state }) => state.operationId;
export const selectReviewValues = ({ state }) => state.reviewValues;
export const selectInstanceId = ({ state }) => state.instanceId;
export const selectCatalogQuery = ({ state }) => state.catalog.query;
export const selectCatalogTags = ({ state }) => state.catalog.tags;
export const selectCatalogRequestId = ({ state }) => state.catalog.requestId;
export const selectCatalogNextCursor = ({ state }) => state.catalog.nextCursor;
export const selectCatalogFailedCursor = ({ state }) =>
  state.catalog.failedCursor;
export const selectCatalogPackById = ({ state }, { packId } = {}) =>
  state.catalog.packs.find((pack) => pack.id === packId) ??
  state.author.packs.find((pack) => pack.id === packId);
export const selectPack = ({ state }) => state.pack;
export const selectAuthorId = ({ state }) => state.author.id;
export const selectAuthorStatus = ({ state }) => state.author.status;
export const selectAuthorRequestId = ({ state }) => state.author.requestId;
export const selectAuthorPacksRequestId = ({ state }) =>
  state.author.packsRequestId;
export const selectAuthorNextCursor = ({ state }) => state.author.nextCursor;
export const selectAuthorPacksFailedCursor = ({ state }) =>
  state.author.packsFailedCursor;

// One pack card, the same in the store list and on an author page.
const getPackCardViewData = (pack, copy) => ({
  id: pack.id,
  title: pack.title,
  coverUrl: pack.coverUrl,
  authorName: pack.author.name,
  authorAvatarUrl: pack.author.avatarUrl,
  assetCountLabel: formatI18nCopy(copy.assetCountLabel ?? "{count} assets", {
    count: pack.assetCount,
  }),
  openLabel: formatI18nCopy(copy.openPackLabel ?? "Open {name}", {
    name: pack.title,
  }),
});

const getAuthorViewData = ({ state, copy }) => {
  const { author } = state;
  return {
    isLoading: author.status === "loading",
    isFailed: author.status === "error",
    isReady: author.status === "ready",
    errorMessage: author.error?.message,
    loadingLabel: copy.authorLoading ?? "Loading author",
    retryLabel: copy.retryButton ?? "Try Again",
    backLabel: copy.backButton ?? "Back",
    name: author.profile?.name,
    avatarUrl: author.profile?.avatarUrl,
    description: author.profile?.description ?? [],
    links: author.profile?.links ?? [],
    packsTitle: copy.authorPacksTitle ?? "Asset packs",
    noPacksLabel: copy.authorNoPacks ?? "This author has no asset packs yet.",
    hasNoPacks: author.status === "ready" && author.packs.length === 0,
    packs: author.packs.map((pack) => getPackCardViewData(pack, copy)),
    hasMorePacks:
      author.nextCursor !== undefined &&
      !author.loadingMorePacks &&
      !author.morePacksFailed,
    isLoadingMorePacks: author.loadingMorePacks,
    morePacksFailed: author.morePacksFailed,
    morePacksFailedLabel:
      copy.storeLoadFailed ??
      "The asset store could not be loaded. Check your connection and try again.",
    loadMoreLabel: copy.loadMoreButton ?? "Load More",
  };
};

const getCatalogViewData = ({ state, copy, resourceTypeCopy }) => {
  const { catalog } = state;
  const isFiltered = catalog.query !== "" || catalog.tags.length > 0;
  return {
    storeTitle: copy.storeTitle ?? "Asset Store",
    isCatalogLoading: catalog.status === "loading" && !catalog.loadingMore,
    searchTitle: copy.searchTitle ?? "Search",
    searchLabel: copy.searchPlaceholder ?? "Search asset packs",
    searchText: state.searchText,
    tagsTitle: copy.tagsTitle ?? "Tags",
    tagsPlaceholder: copy.tagsPlaceholder ?? "Choose tags",
    tagOptions: STORE_TAGS.map(({ tag, resourceType }) => ({
      value: tag,
      label: resourceTypeCopy[resourceType] ?? formatResourceType(resourceType),
    })),
    selectedTags: catalog.tags,
    isCatalogEmpty:
      catalog.status === "ready" && catalog.packs.length === 0 && !isFiltered,
    isNoResults:
      catalog.status === "ready" && catalog.packs.length === 0 && isFiltered,
    noResultsLabel: copy.storeNoResults ?? "No asset packs match your search.",
    isCatalogFailed: catalog.status === "error",
    catalogLoadingLabel: copy.storeLoading ?? "Loading asset packs",
    catalogEmptyLabel: copy.storeEmpty ?? "No asset packs are available yet.",
    catalogFailedLabel:
      copy.storeLoadFailed ??
      "The asset store could not be loaded. Check your connection and try again.",
    retryLabel: copy.retryButton ?? "Try Again",
    hasMorePacks:
      catalog.nextCursor !== undefined &&
      catalog.status !== "error" &&
      !catalog.loadingMore,
    isLoadingMorePacks: catalog.loadingMore,
    loadMoreLabel: copy.loadMoreButton ?? "Load More",
    packs: catalog.packs.map((pack) => getPackCardViewData(pack, copy)),
  };
};
// The pack page groups its assets the way resource pages do: the type's own
// assets first under the type's name, then one group per folder with assets
// of its own, labelled with its path from the type.
const getPackGroups = ({
  reviewSections,
  resourceBySourceId,
  resourceTypeCopy,
  collapsedKeys,
}) => {
  const groups = [];
  for (const section of reviewSections) {
    const { resourceType } = section;
    const typeName =
      resourceTypeCopy[resourceType] ?? formatResourceType(resourceType);
    const folderLabels = new Map();
    const groupsByKey = new Map([
      [resourceType, { key: resourceType, label: typeName, resources: [] }],
    ]);
    for (const item of section.items) {
      if (item.kind === "folder") {
        const parentLabel = folderLabels.get(item.parentSourceId) ?? typeName;
        folderLabels.set(item.sourceId, `${parentLabel} > ${item.name}`);
        continue;
      }
      const key = item.parentSourceId ?? resourceType;
      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, {
          key,
          label: folderLabels.get(key),
          resources: [],
        });
      }
      for (const sourceId of item.sourceIds) {
        groupsByKey.get(key).resources.push(resourceBySourceId.get(sourceId));
      }
    }
    for (const group of groupsByKey.values()) {
      if (group.resources.length === 0) continue;
      const isCollapsed = collapsedKeys.includes(group.key);
      group.isCollapsed = isCollapsed;
      group.expanded = isCollapsed ? "false" : "true";
      groups.push(group);
    }
  }
  return groups;
};

const getPackViewData = ({ state, copy, dateTime }) => {
  const { pack } = state;
  if (!pack) return undefined;
  const formatDay = (epochMs) =>
    epochMs === undefined ? undefined : formatCalendarDate(epochMs, dateTime);
  return {
    id: pack.id,
    title: pack.title,
    coverUrl: pack.coverUrl,
    screenshotUrls: pack.screenshotUrls,
    hasGallery: pack.screenshotUrls.length > 0,
    description: pack.description,
    authorName: pack.author.name,
    authorAvatarUrl: pack.author.avatarUrl,
    versionName: pack.versionName,
    released: formatDay(pack.releasedAt),
    updated: formatDay(pack.updatedAt),
    assetCountLabel: formatI18nCopy(copy.assetCountLabel ?? "{count} assets", {
      count: pack.assetCount,
    }),
    backLabel: copy.backButton ?? "Back",
    importLabel: copy.importButton ?? "Import",
    infoTitle: copy.packInfoTitle ?? "Pack info",
    authorLabel: copy.authorLabel ?? "Author",
    openAuthorLabel: formatI18nCopy(copy.openAuthorLabel ?? "View {name}", {
      name: pack.author.name,
    }),
    versionLabel: copy.versionLabel ?? "Version",
    releasedLabel: copy.releasedLabel ?? "Released",
    updatedLabel: copy.lastUpdatedLabel ?? "Last updated",
    assetsTitle: copy.assetsInPackTitle ?? "Assets in this pack",
    isLoadingAssets:
      state.packStatus === "details" || state.packStatus === "assets",
    importDisabled: state.packStatus !== "ready",
    assetsLoadingLabel: copy.packAssetsLoading ?? "Loading assets",
    // Placeholder cards while the assets load, at most two rows.
    assetPlaceholders: Array.from(
      { length: Math.min(pack.assetCount, 8) },
      (_value, index) => index,
    ),
  };
};

export const selectViewData = ({ state, i18n = {} }) => {
  const copy = i18n.resourceImport ?? {};
  const plan = state.plan;
  const warnings = (plan?.warnings ?? []).filter(
    (warning) => warning.code !== "name_conflict",
  );
  const progressPercent = state.progress.total
    ? Math.round((state.progress.completed / state.progress.total) * 100)
    : 0;
  const progressLabelByPhase = {
    downloading: copy.downloadingLabel ?? "Downloading package files",
    processing: copy.processingLabel ?? "Validating and processing files",
    committing: copy.committingLabel ?? "Saving imported resources",
    complete: copy.completeLabel ?? "Import complete",
  };
  const isSelectionStep = state.step === SELECTION_STEP;
  const allResourcesSelected =
    (plan?.resources.length ?? 0) > 0 &&
    plan.resources.every(
      (_resource, index) =>
        state.reviewValues[`resource_${index}_include`] === true,
    );
  const resources = plan
    ? getReviewResources({
        plan,
        values: state.reviewValues,
      }).map(({ resource, resourceIndex, selected, required }) => ({
        ...resource,
        planResourceIndex: resourceIndex,
        typeLabel: getResourceTypeLabel({ resource, copy }),
        selectionLabel: (copy.includeResource ?? "Import {name}").replace(
          "{name}",
          getResourceLabel(resource, resourceIndex, copy),
        ),
        selected,
        required,
        selectionBorderColor: selected ? "pr" : "bo",
        selectionHoverBorderColor: selected ? "pr" : "ac",
        selectionStatus: required
          ? (copy.requiredStatus ?? "Required")
          : selected
            ? (copy.selectedStatus ?? "Selected")
            : (copy.notSelectedStatus ?? "Not selected"),
        selectionStatusColor: selected ? "pr" : "mu-fg",
        previewLabel: formatI18nCopy(
          copy.previewAssetLabel ?? "Preview {name}",
          { name: getResourceLabel(resource, resourceIndex, copy) },
        ),
      }))
    : [];
  const previewResource = resources.find(
    (resource) => resource.sourceId === state.previewAssetSourceId,
  );
  const resourceBySourceId = new Map(
    resources.map((resource) => [resource.sourceId, resource]),
  );
  const reviewSections =
    plan?.reviewSections ?? createFallbackReviewSections(resources);
  const resourceSections = reviewSections.map((section) => {
    const groups = section.items.map((item) => {
      if (item.kind === "folder") {
        return {
          ...item,
          indent: item.depth * 16,
        };
      }
      // A folder's resources line up with its header.
      return {
        ...item,
        indent: Math.max((item.depth ?? 0) - 1, 0) * 16,
        resources: item.sourceIds.map((sourceId) =>
          resourceBySourceId.get(sourceId),
        ),
      };
    });
    const firstResource = groups
      .find((group) => group.kind === "resources")
      ?.resources.at(0);
    return {
      resourceType: section.resourceType,
      typeLabel: getResourceTypeLabel({
        resource: firstResource ?? { resourceType: section.resourceType },
        copy,
      }),
      groups,
    };
  });

  return {
    open: state.open,
    step: state.step,
    isStoreStep: state.step === STORE_STEP,
    isPackStep: state.step === PACK_STEP,
    isAuthorStep: state.step === AUTHOR_STEP,
    author: getAuthorViewData({ state, copy }),
    isSelectionStep,
    allResourcesSelected,
    selectionToggleAllLabel: allResourcesSelected
      ? (copy.deselectAllButton ?? "Deselect All")
      : (copy.selectAllButton ?? "Select All"),
    isProgressStep: state.step === PROGRESS_STEP,
    isBusy: state.isBusy,
    formKey: state.formKey,
    form: isSelectionStep ? selectionForm({ copy }) : undefined,
    defaultValues: state.reviewValues,
    formContext: state.reviewValues,
    errorMessage: state.error?.message,
    catalog: getCatalogViewData({
      state,
      copy,
      resourceTypeCopy: i18n.resourceTypes ?? {},
    }),
    pack: getPackViewData({ state, copy, dateTime: i18n.dateTime }),
    isAssetPreviewOpen: previewResource !== undefined,
    assetPreview: previewResource && {
      name: previewResource.name,
      typeLabel: previewResource.typeLabel,
      description: previewResource.description,
      sourceFileId:
        previewResource.largePreviewSourceId ?? previewResource.previewSourceId,
    },
    selectionTitle: copy.selectResourcesTitle ?? "Choose Resources",
    selectionBackLabel: copy.backButton ?? "Back",
    packageName: plan?.package?.name,
    hasPackageMetadata: hasPackageMetadata(plan),
    planId: plan?.planId,
    packagePublisher: plan?.package?.publisher,
    packagePublisherText: formatI18nCopy(
      copy.labelValue ?? "{label}: {value}",
      {
        label: copy.publisherLabel ?? "Publisher",
        value: plan?.package?.publisher,
      },
    ),
    packageSource: plan?.package?.source,
    packageSourceText: formatI18nCopy(copy.labelValue ?? "{label}: {value}", {
      label: copy.sourceLabel ?? "Source",
      value: plan?.package?.source,
    }),
    resources,
    resourceSections,
    packGroups: getPackGroups({
      reviewSections,
      resourceBySourceId,
      resourceTypeCopy: i18n.resourceTypes ?? {},
      collapsedKeys: state.collapsedPackGroupKeys,
    }),
    warnings,
    warningsLabel: copy.warningsLabel ?? "Warnings",
    progressLabel:
      progressLabelByPhase[state.progress.phase] ??
      copy.preparingLabel ??
      "Preparing import",
    progressCountLabel: `${state.progress.completed} / ${state.progress.total}`,
    progressPercentLabel: formatPercent(progressPercent, i18n.dateTime),
    cancelButton: copy.cancelButton ?? "Cancel Import",
    dialogAriaLabel: copy.title ?? "Import Package",
  };
};
