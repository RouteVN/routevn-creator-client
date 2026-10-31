import { describe, expect, it } from "vitest";
import {
  closeAssetPreview,
  returnFromCreatorPage,
  setCreatorError,
  setCreatorPage,
  startCreatorLoad,
  createInitialState,
  openAssetPreview,
  openPackStep,
  openStoreStep,
  reopenLoadedPlan,
  selectViewData,
  setAllResourcesSelected,
  setCatalogError,
  setCatalogPage,
  setCatalogQuery,
  setCatalogAssetTypes,
  setPackDetails,
  setPackLoadError,
  setPackPage,
  setResourceSelected,
  togglePackGroup,
  setPlan,
  startCatalogLoad,
  startOpeningPack,
  syncFromProps,
} from "../../src/components/resource-import-dialog/resource-import-dialog.store.js";

const createMultiResourcePlan = () => ({
  planId: "plan-1",
  package: {
    name: "Pack",
    version: "1.0.0",
    defaultFolderName: "Imported Transforms",
  },
  resources: [
    {
      sourceId: "source.one",
      resourceType: "transforms",
      type: "transform",
      name: "Transform One",
      description: "First transform",
      previewSourceId: "file.transform-one",
    },
    {
      sourceId: "source.two",
      resourceType: "transforms",
      type: "transform",
      name: "Transform Two",
      description: "Second transform",
      previewSourceId: "file.transform-two",
      previewKind: "video",
    },
  ],
  reviewSections: [
    {
      resourceType: "transforms",
      items: [
        {
          kind: "folder",
          sourceId: "transforms:folder-one",
          name: "Folder One",
          depth: 0,
        },
        { kind: "resources", sourceIds: ["source.one"], depth: 1 },
        {
          kind: "folder",
          sourceId: "transforms:folder-two",
          name: "Folder Two",
          depth: 0,
        },
        { kind: "resources", sourceIds: ["source.two"], depth: 1 },
      ],
    },
  ],
  warnings: [
    {
      code: "name_conflict",
      message: "A transform with this name already exists.",
    },
  ],
});

describe("resource-import-dialog.store", () => {
  it("opens on the asset store while its first page loads", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    startCatalogLoad({ state }, { requestId: "request-1" });

    const view = selectViewData({ state, i18n: {} });

    expect(view).toMatchObject({
      isStoreStep: true,
      isSelectionStep: false,
      form: undefined,
      catalog: {
        storeTitle: "Asset Store",
        isCatalogLoading: true,
        isCatalogEmpty: false,
        isCatalogFailed: false,
        hasMorePacks: false,
        packs: [],
      },
    });
  });

  it("shows store packs with localized card labels", () => {
    const state = createInitialState();
    startCatalogLoad({ state }, { requestId: "request-1" });
    setCatalogPage(
      { state },
      {
        packs: [
          {
            id: "pack-1",
            title: "Pack One",
            summary: "Forest backgrounds.",
            assetCounts: [
              { assetType: "IMAGES", count: 40 },
              { assetType: "SOUNDS", count: 2 },
            ],
            assetCount: 42,
            coverUrl: "https://files.example/cover.png",
            creator: {
              id: "creator-1",
              name: "Creator One",
              avatarUrl: "https://files.example/avatar.png",
            },
          },
        ],
        nextCursor: "cursor-2",
      },
    );

    const view = selectViewData({
      state,
      i18n: {
        resourceImport: {
          imageCount_one: "{count} picture",
          imageCount_other: "{count} pictures",
          openPackLabel: "View {name}",
        },
      },
    });

    expect(view.catalog.packs).toEqual([
      {
        id: "pack-1",
        title: "Pack One",
        summary: "Forest backgrounds.",
        coverUrl: "https://files.example/cover.png",
        creatorName: "Creator One",
        creatorAvatarUrl: "https://files.example/avatar.png",
        openLabel: "View Pack One",
      },
    ]);
    expect(view.catalog).toMatchObject({
      isCatalogLoading: false,
      hasMorePacks: true,
      isLoadingMorePacks: false,
    });

    startCatalogLoad({ state }, { requestId: "request-2", cursor: "cursor-2" });
    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogLoading: false,
      isLoadingMorePacks: true,
      hasMorePacks: false,
    });
    expect(state.catalog.packs).toHaveLength(1);
  });

  it("shows the empty and failed store states", () => {
    const state = createInitialState();
    startCatalogLoad({ state }, { requestId: "request-1" });
    setCatalogPage({ state }, { packs: [] });
    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogEmpty: true,
      catalogEmptyLabel: "No asset packs are available yet.",
    });

    startCatalogLoad({ state }, { requestId: "request-2" });
    setCatalogError({ state }, { cursor: undefined });
    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogLoading: false,
      isCatalogEmpty: false,
      isCatalogFailed: true,
      retryLabel: "Try Again",
      hasMorePacks: false,
    });
  });

  it("tells an empty search apart from an empty store", () => {
    const state = createInitialState();
    setCatalogQuery({ state }, { query: "dragon" });
    startCatalogLoad({ state }, { requestId: "request-1" });
    setCatalogPage({ state }, { packs: [] });

    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogEmpty: false,
      isNoResults: true,
      noResultsLabel: "No asset packs match your search.",
      searchLabel: "Search asset packs",
    });

    setCatalogQuery({ state }, { query: "" });
    setCatalogAssetTypes({ state }, { assetTypes: ["FONTS"] });
    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogEmpty: false,
      isNoResults: true,
    });

    setCatalogAssetTypes({ state }, { assetTypes: [] });
    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogEmpty: true,
      isNoResults: false,
    });
  });

  it("offers every asset type under the resource type's name and shows the chosen ones", () => {
    const state = createInitialState();
    setCatalogAssetTypes({ state }, { assetTypes: ["ANIMATIONS"] });

    const { catalog } = selectViewData({
      state,
      i18n: {
        resourceImport: {
          searchTitle: "検索",
          assetTypesTitle: "アセットの種類",
          assetTypesPlaceholder: "アセットの種類を選択",
        },
        resourceTypes: { images: "画像", animations: "アニメーション" },
      },
    });

    expect(catalog).toMatchObject({
      searchTitle: "検索",
      assetTypesTitle: "アセットの種類",
      assetTypesPlaceholder: "アセットの種類を選択",
      selectedAssetTypes: ["ANIMATIONS"],
    });
    expect(catalog.assetTypeOptions.map((option) => option.value)).toEqual([
      "IMAGES",
      "SOUNDS",
      "VIDEOS",
      "CHARACTERS",
      "TRANSFORMS",
      "ANIMATIONS",
      "AUDIO_EFFECTS",
      "PARTICLES",
      "SPRITESHEETS",
      "COLORS",
      "FONTS",
      "TEXT_STYLES",
      "VARIABLES",
      "CONTROLS",
    ]);
    expect(catalog.assetTypeOptions[0]).toEqual({
      value: "IMAGES",
      label: "画像",
    });
    expect(catalog.assetTypeOptions[5].label).toBe("アニメーション");
    expect(catalog.assetTypeOptions[6].label).toBe("Audio Effects");
  });

  it("groups the pack's assets by folder, labelled with their path, and collapses a group", () => {
    const state = createInitialState();
    const plan = createMultiResourcePlan();
    plan.reviewSections = [
      {
        resourceType: "transforms",
        items: [
          {
            kind: "folder",
            sourceId: "transforms:folder-one",
            name: "Folder One",
            depth: 0,
          },
          {
            kind: "folder",
            sourceId: "transforms:folder-two",
            name: "Folder Two",
            depth: 1,
            parentSourceId: "transforms:folder-one",
          },
          {
            kind: "resources",
            sourceIds: ["source.two"],
            depth: 2,
            parentSourceId: "transforms:folder-two",
          },
          { kind: "resources", sourceIds: ["source.one"], depth: 0 },
        ],
      },
    ];
    const pack = {
      id: "pack-1",
      title: "Pack One",
      assetCounts: [{ assetType: "TRANSFORMS", count: 2 }],
      assetCount: 2,
      creator: { id: "creator-1", name: "Creator One" },
    };
    startOpeningPack({ state }, { operationId: "operation-1", pack });
    setPackPage({ state }, { plan });
    const groups = () =>
      selectViewData({
        state,
        i18n: { resourceTypes: { transforms: "トランスフォーム" } },
      }).packGroups.map((group) => ({
        key: group.key,
        label: group.label,
        isCollapsed: group.isCollapsed,
        expanded: group.expanded,
        sourceIds: group.resources.map((resource) => resource.sourceId),
      }));

    expect(groups()).toEqual([
      {
        key: "transforms",
        label: "トランスフォーム",
        isCollapsed: false,
        expanded: "true",
        sourceIds: ["source.one"],
      },
      {
        key: "transforms:folder-two",
        label: "トランスフォーム > Folder One > Folder Two",
        isCollapsed: false,
        expanded: "true",
        sourceIds: ["source.two"],
      },
    ]);

    // On the resource choice, a folder's resources line up with its header.
    expect(
      selectViewData({ state, i18n: {} }).resourceSections[0].groups.map(
        (group) => [group.kind, group.indent],
      ),
    ).toEqual([
      ["folder", 0],
      ["folder", 16],
      ["resources", 16],
      ["resources", 0],
    ]);

    togglePackGroup({ state }, { key: "transforms:folder-two" });
    expect(groups()[1]).toMatchObject({ isCollapsed: true, expanded: "false" });
    togglePackGroup({ state }, { key: "transforms:folder-two" });
    expect(groups()[1].isCollapsed).toBe(false);

    togglePackGroup({ state }, { key: "transforms" });
    startOpeningPack({ state }, { operationId: "operation-2", pack });
    setPackPage({ state }, { plan });
    expect(groups()[0].isCollapsed).toBe(false);
  });

  it("opens a pack's page at once from its card, then fills in its details and assets", () => {
    const state = createInitialState();
    const creator = {
      id: "creator-1",
      name: "Creator One",
      avatarUrl: undefined,
    };
    startOpeningPack(
      { state },
      {
        operationId: "operation-1",
        pack: {
          id: "pack-1",
          title: "Pack One",
          coverUrl: "https://files.example/cover.png",
          releasedAt: 1786492800000,
          assetCounts: [{ assetType: "IMAGES", count: 12 }],
          assetCount: 12,
          creator,
        },
      },
    );
    let view = selectViewData({ state, i18n: {} });
    expect(view).toMatchObject({ isPackStep: true, isSelectionStep: false });
    // A store list card's creator and release date show at once; a card has
    // no description, so the page shows none until the details load.
    expect(view.pack).toMatchObject({
      title: "Pack One",
      coverUrl: "https://files.example/cover.png",
      creatorName: "Creator One",
      creatorLabel: "Creator",
      openCreatorLabel: "View Creator One",
      description: [],
      releaseNotes: undefined,
      released: "Aug 12, 2026",
      versionName: undefined,
      isLoadingAssets: true,
      importDisabled: true,
      assetsLoadingLabel: "Loading assets",
      assetPlaceholders: [0, 1, 2, 3, 4, 5, 6, 7],
    });
    expect(view.packGroups).toEqual([]);

    setPackDetails(
      { state },
      {
        pack: {
          id: "pack-1",
          title: "Pack One",
          coverUrl: "https://files.example/cover.png",
          assetCounts: [
            { assetType: "IMAGES", count: 1 },
            { assetType: "TRANSFORMS", count: 1 },
          ],
          assetCount: 2,
          description: [
            { text: "First paragraph." },
            { text: "Second paragraph." },
          ],
          versionName: "1.0.0",
          releaseNotes: "Adds masks.\nFixes fades.",
          releasedAt: 1786492800000,
          updatedAt: undefined,
          creator,
        },
      },
    );
    view = selectViewData({ state, i18n: {} });
    // The details replace the card.
    expect(view.pack).not.toHaveProperty("screenshotUrls");
    expect(view.pack).toMatchObject({
      id: "pack-1",
      description: [
        { text: "First paragraph." },
        { text: "Second paragraph." },
      ],
      versionName: "1.0.0",
      released: "Aug 12, 2026",
      updated: undefined,
      releaseNotes: "Adds masks.\nFixes fades.",
      releaseNotesTitle: "What's new",
      assetsTitle: "Assets in this pack",
      isLoadingAssets: true,
      importDisabled: true,
    });

    setPackPage({ state }, { plan: createMultiResourcePlan() });
    view = selectViewData({ state, i18n: {} });
    expect(view.pack).toMatchObject({
      isLoadingAssets: false,
      importDisabled: false,
    });
    expect(view.pack).not.toHaveProperty("downloadSize");
    expect(view.pack).not.toHaveProperty("assetCountLabels");
    expect(view.resourceSections[0].groups).toHaveLength(4);
    expect(state.operationId).toBeUndefined();

    reopenLoadedPlan({ state });
    expect(state.step).toBe("selection");
    // Choices are kept in the store, so stepping back and in again keeps them.
    setResourceSelected(
      { state },
      { sourceId: state.plan.resources[0].sourceId, selected: false },
    );
    openPackStep({ state });
    expect(state.step).toBe("pack");
    reopenLoadedPlan({ state });
    expect(state.reviewValues.resource_0_include).toBe(false);
    openPackStep({ state });
    openStoreStep({ state });

    expect(state).toMatchObject({
      step: "store",
      planPackId: "pack-1",
      plan: { planId: "plan-1" },
    });
  });

  it("keeps a pack page that failed to load open under its error", () => {
    const state = createInitialState();
    startOpeningPack(
      { state },
      {
        operationId: "operation-1",
        pack: {
          id: "pack-1",
          title: "Pack One",
          assetCounts: [{ assetType: "TRANSFORMS", count: 2 }],
          assetCount: 2,
          creator: { id: "creator-1", name: "Creator One" },
        },
      },
    );
    setPackLoadError({ state }, { error: { message: "Package unavailable." } });

    const view = selectViewData({ state, i18n: {} });
    expect(view).toMatchObject({
      isPackStep: true,
      errorMessage: "Package unavailable.",
    });
    expect(view.pack).toMatchObject({
      title: "Pack One",
      isLoadingAssets: false,
      importDisabled: true,
    });
    expect(state.operationId).toBeUndefined();
  });

  it("previews an asset with its full-size file, falling back to its grid preview", () => {
    const state = createInitialState();
    const plan = createMultiResourcePlan();
    plan.resources[0].largePreviewSourceId = "file.transform-one-large";
    setPlan({ state }, { plan });

    openAssetPreview({ state }, { sourceId: "source.one" });
    expect(selectViewData({ state, i18n: {} }).assetPreview).toEqual({
      name: "Transform One",
      typeLabel: "Transform",
      description: "First transform",
      sourceFileId: "file.transform-one-large",
    });
    expect(selectViewData({ state, i18n: {} }).resources[0].previewLabel).toBe(
      "Preview Transform One",
    );

    openAssetPreview({ state }, { sourceId: "source.two" });
    expect(selectViewData({ state, i18n: {} }).assetPreview.sourceFileId).toBe(
      "file.transform-two",
    );

    closeAssetPreview({ state });
    expect(selectViewData({ state, i18n: {} }).assetPreview).toBeUndefined();
  });

  it("shows the creator page's loading, profile, packs and failure", () => {
    const state = createInitialState();
    startCreatorLoad(
      { state },
      { requestId: "request-1", creatorId: "creator-1" },
    );
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      isCreatorStep: true,
      creator: { isLoading: true, loadingLabel: "Loading creator" },
    });

    const creator = {
      id: "creator-1",
      name: "Creator One",
      avatarUrl: "https://files.example/avatar.png",
    };
    setCreatorPage(
      { state },
      {
        profile: {
          ...creator,
          description: ["Free tools."],
          links: [{ label: "X", url: "https://x.example" }],
        },
        packs: [
          {
            id: "pack-1",
            title: "Pack One",
            assetCounts: [{ assetType: "FONTS", count: 1 }],
            assetCount: 1,
            coverUrl: "https://files.example/cover.png",
            creator,
          },
        ],
      },
    );
    const view = selectViewData({ state, i18n: {} }).creator;
    expect(view).toMatchObject({
      isReady: true,
      name: "Creator One",
      description: ["Free tools."],
      links: [{ label: "X", url: "https://x.example" }],
      packsTitle: "Asset packs",
      hasNoPacks: false,
      packs: [
        {
          id: "pack-1",
          title: "Pack One",
          coverUrl: "https://files.example/cover.png",
          creatorName: "Creator One",
          creatorAvatarUrl: "https://files.example/avatar.png",
          openLabel: "Open Pack One",
        },
      ],
    });
    // The creator page has every pack at once, so it has no Load More.
    expect(view).not.toHaveProperty("hasMorePacks");
    expect(view).not.toHaveProperty("loadMoreLabel");

    setCreatorPage(
      { state },
      { profile: { ...creator, description: [], links: [] }, packs: [] },
    );
    expect(selectViewData({ state, i18n: {} }).creator).toMatchObject({
      hasNoPacks: true,
      noPacksLabel: "This creator has no asset packs yet.",
    });

    setCreatorError({ state }, { error: { message: "Creator gone." } });
    expect(selectViewData({ state, i18n: {} }).creator).toMatchObject({
      isFailed: true,
      errorMessage: "Creator gone.",
    });

    returnFromCreatorPage({ state });
    expect(state.step).toBe("store");
  });

  it("opens multi-resource packages on a visual selection page", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan: createMultiResourcePlan() });

    // Nothing starts selected.
    const view = selectViewData({ state, i18n: {} });
    expect(view.step).toBe("selection");
    expect(view.isSelectionStep).toBe(true);
    expect(view.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previewSourceId: "file.transform-one",
          planResourceIndex: 0,
          typeLabel: "Transform",
          selected: false,
          selectionLabel: "Import Transform One",
          selectionBorderColor: "bo",
          selectionHoverBorderColor: "ac",
          selectionStatus: "Not selected",
        }),
        expect.objectContaining({
          previewSourceId: "file.transform-two",
          planResourceIndex: 1,
          previewKind: "video",
        }),
      ]),
    );
    // The title scrolls in the header slot; the form keeps only the actions
    // in place. The pack page already showed the version and description.
    expect(view.form.fields).toEqual([
      { slot: "selection-header", type: "slot" },
      { slot: "selection-controls", type: "slot" },
      { slot: "resource-selection-grid", type: "slot" },
    ]);
    expect(view.form).not.toHaveProperty("title");
    expect(view.selectionTitle).toBe("Choose Resources");
    expect(view).not.toHaveProperty("packageVersion");
    expect(view).not.toHaveProperty("packageDescription");
    expect(view.form.fields.some((field) => field.type === "checkbox")).toBe(
      false,
    );
    expect(
      view.form.fields.some((field) => field.name === "resource_0_name"),
    ).toBe(false);
    // Back is the square button beside the title, not a form action.
    expect(view.form.actions.buttons).toEqual([
      expect.objectContaining({ id: "import", label: "Import" }),
    ]);
    expect(view.selectionBackLabel).toBe("Back");
    expect(view.form).not.toHaveProperty("sticky");
    expect(view).toMatchObject({
      allResourcesSelected: false,
      selectionToggleAllLabel: "Select All",
    });
    expect(view.warnings).toEqual([]);
    expect(view.resourceSections[0]).toMatchObject({
      resourceType: "transforms",
      typeLabel: "Transform",
      groups: [
        { kind: "folder", name: "Folder One", indent: 0 },
        {
          kind: "resources",
          indent: 0,
          resources: [{ sourceId: "source.one" }],
        },
        { kind: "folder", name: "Folder Two", indent: 0 },
        {
          kind: "resources",
          indent: 0,
          resources: [{ sourceId: "source.two" }],
        },
      ],
    });

    setResourceSelected({ state }, { sourceId: "source.one", selected: true });
    const selectedView = selectViewData({ state, i18n: {} });
    expect(selectedView.resources.map(({ sourceId }) => sourceId)).toEqual([
      "source.one",
      "source.two",
    ]);
    expect(
      selectedView.resources.find(({ sourceId }) => sourceId === "source.one"),
    ).toMatchObject({
      selected: true,
      selectionBorderColor: "pr",
      selectionHoverBorderColor: "pr",
      selectionStatus: "Selected",
    });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      allResourcesSelected: false,
      selectionToggleAllLabel: "Select All",
    });

    setAllResourcesSelected({ state }, { selected: true });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      allResourcesSelected: true,
      selectionToggleAllLabel: "Deselect All",
    });
  });

  it("deselects dependents when a required dependency is deselected", () => {
    const state = createInitialState();
    const plan = createMultiResourcePlan();
    plan.resources[1].dependencySourceIds = [plan.resources[0].sourceId];
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan });
    // Selecting a resource selects what it needs.
    setResourceSelected({ state }, { sourceId: "source.two", selected: true });

    expect(selectViewData({ state, i18n: {} }).resources[0]).toMatchObject({
      sourceId: "source.one",
      selected: true,
      required: true,
      selectionStatus: "Required",
    });
    expect(selectViewData({ state, i18n: {} }).resources.at(-1)).toMatchObject({
      sourceId: "source.two",
      selected: true,
      required: false,
    });
    setResourceSelected({ state }, { sourceId: "source.one", selected: false });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: false,
      resource_1_include: false,
    });

    setResourceSelected({ state }, { sourceId: "source.two", selected: true });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: true,
      resource_1_include: true,
    });
    setResourceSelected({ state }, { sourceId: "source.two", selected: false });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: true,
      resource_1_include: false,
    });
    expect(selectViewData({ state, i18n: {} }).resources[0]).toMatchObject({
      sourceId: "source.one",
      selected: true,
      required: false,
      selectionStatus: "Selected",
    });
    expect(
      selectViewData({ state, i18n: {} }).resources.map(
        ({ sourceId }) => sourceId,
      ),
    ).toEqual(["source.one", "source.two"]);
  });

  it("follows the manifest resource-type section order", () => {
    const state = createInitialState();
    const plan = createMultiResourcePlan();
    plan.resources.push({
      sourceId: "image.one",
      resourceType: "images",
      type: "image",
      name: "Image One",
    });
    plan.reviewSections.unshift({
      resourceType: "images",
      items: [
        { kind: "folder", name: "Images Folder", depth: 0 },
        { kind: "resources", sourceIds: ["image.one"] },
      ],
    });
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan });

    const view = selectViewData({ state, i18n: {} });
    expect(
      view.resourceSections.map(({ resourceType }) => resourceType),
    ).toEqual(["images", "transforms"]);
    expect(view.resourceSections[0]).toMatchObject({
      typeLabel: "Image",
      groups: [
        { kind: "folder", name: "Images Folder" },
        { kind: "resources", resources: [{ sourceId: "image.one" }] },
      ],
    });
  });

  it("opens a one-resource package on the selection page", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    const plan = createMultiResourcePlan();
    plan.resources = [plan.resources[0]];
    plan.reviewSections[0].items = plan.reviewSections[0].items.slice(0, 2);
    setPlan({ state }, { plan });

    const view = selectViewData({ state, i18n: {} });
    expect(view.step).toBe("selection");
    expect(view.form.fields.at(-1)).toEqual({
      type: "slot",
      slot: "resource-selection-grid",
    });
    expect(view.form.actions.buttons.at(-1).id).toBe("import");
  });
});
