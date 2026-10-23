import { describe, expect, it } from "vitest";
import {
  closeAssetPreview,
  returnFromAuthorPage,
  setAuthorError,
  setAuthorPage,
  startAuthorLoad,
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
  setCatalogTags,
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
            assetCount: 42,
            coverUrl: "https://files.example/cover.png",
            author: {
              id: "author-1",
              name: "Author One",
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
          assetCount_one: "{count} item",
          assetCount_other: "{count} items",
          openPackLabel: "View {name}",
        },
      },
    });

    expect(view.catalog.packs).toEqual([
      {
        id: "pack-1",
        title: "Pack One",
        coverUrl: "https://files.example/cover.png",
        authorName: "Author One",
        authorAvatarUrl: "https://files.example/avatar.png",
        assetCountLabel: "42 items",
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

  it("picks the asset count's plural form for the locale", () => {
    const state = createInitialState();
    startCatalogLoad({ state }, { requestId: "request-1" });
    const pack = (id, assetCount) => ({
      id,
      title: "Pack One",
      assetCount,
      author: { id: "author-1", name: "Author One" },
    });
    setCatalogPage(
      { state },
      { packs: [pack("pack-1", 1), pack("pack-2", 2), pack("pack-3", 5)] },
    );
    const labels = (i18n) =>
      selectViewData({ state, i18n }).catalog.packs.map(
        (card) => card.assetCountLabel,
      );

    expect(labels({})).toEqual(["1 asset", "2 assets", "5 assets"]);
    expect(
      labels({
        dateTime: { pluralRulesLocale: "ru" },
        resourceImport: {
          assetCount_one: "{count} ресурс",
          assetCount_few: "{count} ресурса",
          assetCount_many: "{count} ресурсов",
          assetCount_other: "{count} ресурса",
        },
      }),
    ).toEqual(["1 ресурс", "2 ресурса", "5 ресурсов"]);
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
    setCatalogTags({ state }, { tags: ["FONTS"] });
    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogEmpty: false,
      isNoResults: true,
    });

    setCatalogTags({ state }, { tags: [] });
    expect(selectViewData({ state, i18n: {} }).catalog).toMatchObject({
      isCatalogEmpty: true,
      isNoResults: false,
    });
  });

  it("offers every tag under the resource type's name and shows the chosen ones", () => {
    const state = createInitialState();
    setCatalogTags({ state }, { tags: ["ANIMATIONS"] });

    const { catalog } = selectViewData({
      state,
      i18n: {
        resourceImport: {
          searchTitle: "検索",
          tagsTitle: "タグ",
          tagsPlaceholder: "タグを選択",
        },
        resourceTypes: { images: "画像", animations: "アニメーション" },
      },
    });

    expect(catalog).toMatchObject({
      searchTitle: "検索",
      tagsTitle: "タグ",
      tagsPlaceholder: "タグを選択",
      selectedTags: ["ANIMATIONS"],
    });
    expect(catalog.tagOptions.map((option) => option.value)).toEqual([
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
    expect(catalog.tagOptions[0]).toEqual({ value: "IMAGES", label: "画像" });
    expect(catalog.tagOptions[5].label).toBe("アニメーション");
    expect(catalog.tagOptions[6].label).toBe("Audio Effects");
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
      screenshotUrls: [],
      assetCount: 2,
      description: [],
      author: { id: "author-1", name: "Author One" },
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
    const author = { id: "author-1", name: "Author One", avatarUrl: undefined };
    startOpeningPack(
      { state },
      {
        operationId: "operation-1",
        pack: {
          id: "pack-1",
          title: "Pack One",
          coverUrl: "https://files.example/cover.png",
          description: ["First paragraph.", "Second paragraph."],
          screenshotUrls: ["https://files.example/shot-1.jpg"],
          releasedAt: 1786492800000,
          assetCount: 12,
          author,
        },
      },
    );
    let view = selectViewData({ state, i18n: {} });
    expect(view).toMatchObject({ isPackStep: true, isSelectionStep: false });
    // The card's description, gallery and release date show at once.
    expect(view.pack).toMatchObject({
      title: "Pack One",
      coverUrl: "https://files.example/cover.png",
      authorName: "Author One",
      assetCountLabel: "12 assets",
      description: ["First paragraph.", "Second paragraph."],
      screenshotUrls: ["https://files.example/shot-1.jpg"],
      hasGallery: true,
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
          screenshotUrls: ["https://files.example/shot-1.jpg"],
          assetCount: 2,
          description: ["First paragraph.", "Second paragraph."],
          versionName: "1.0.0",
          releasedAt: 1786492800000,
          updatedAt: undefined,
          author,
        },
      },
    );
    view = selectViewData({ state, i18n: {} });
    expect(view.pack).toMatchObject({
      id: "pack-1",
      screenshotUrls: ["https://files.example/shot-1.jpg"],
      hasGallery: true,
      description: ["First paragraph.", "Second paragraph."],
      versionName: "1.0.0",
      released: "Aug 12, 2026",
      updated: undefined,
      assetCountLabel: "2 assets",
      infoTitle: "Pack info",
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
          description: [],
          screenshotUrls: [],
          assetCount: 2,
          author: { id: "author-1", name: "Author One" },
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

  it("shows the author page's loading, profile, packs and failure", () => {
    const state = createInitialState();
    startAuthorLoad(
      { state },
      { requestId: "request-1", authorId: "author-1" },
    );
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      isAuthorStep: true,
      author: { isLoading: true, loadingLabel: "Loading author" },
    });

    setAuthorPage(
      { state },
      {
        profile: {
          id: "author-1",
          name: "Author One",
          avatarUrl: "https://files.example/avatar.png",
          description: ["Free tools."],
          links: [{ label: "X", url: "https://x.example" }],
        },
        packs: [],
      },
    );
    expect(selectViewData({ state, i18n: {} }).author).toMatchObject({
      isReady: true,
      name: "Author One",
      description: ["Free tools."],
      links: [{ label: "X", url: "https://x.example" }],
      packsTitle: "Asset packs",
      hasNoPacks: true,
      hasMorePacks: false,
    });

    setAuthorError({ state }, { error: { message: "Author gone." } });
    expect(selectViewData({ state, i18n: {} }).author).toMatchObject({
      isFailed: true,
      errorMessage: "Author gone.",
    });

    returnFromAuthorPage({ state });
    expect(state.step).toBe("store");
  });

  it("opens multi-resource packages on a visual selection page", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan: createMultiResourcePlan() });

    const view = selectViewData({ state, i18n: {} });
    expect(view.step).toBe("selection");
    expect(view.isSelectionStep).toBe(true);
    expect(view.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previewSourceId: "file.transform-one",
          planResourceIndex: 0,
          typeLabel: "Transform",
          selected: true,
          selectionLabel: "Import Transform One",
          selectionBorderColor: "pr",
          selectionHoverBorderColor: "pr",
          selectionStatus: "Selected",
          selectionStatusColor: "pr",
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
      allResourcesSelected: true,
      selectionToggleAllLabel: "Deselect All",
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

    setResourceSelected({ state }, { sourceId: "source.one", selected: false });
    const deselectedView = selectViewData({ state, i18n: {} });
    expect(deselectedView.resources.map(({ sourceId }) => sourceId)).toEqual([
      "source.one",
      "source.two",
    ]);
    expect(
      deselectedView.resources.find(
        ({ sourceId }) => sourceId === "source.one",
      ),
    ).toMatchObject({
      selected: false,
      selectionBorderColor: "bo",
      selectionHoverBorderColor: "ac",
      selectionStatus: "Not selected",
      selectionStatusColor: "mu-fg",
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
