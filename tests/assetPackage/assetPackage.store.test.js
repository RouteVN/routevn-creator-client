import { describe, expect, it } from "vitest";
import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../src/internal/assetPackageResources.js";
import { createAssetImportPlan } from "../../src/internal/assetImportPlan.js";
import * as assetPackageStore from "../../src/pages/assetPackage/assetPackage.store.js";
import {
  applyPicker,
  closePicker,
  closeTypeMenu,
  createInitialState,
  finishSavingPicks,
  moveResourceType,
  openPicker,
  openTypeMenu,
  selectAssetPackage,
  selectAssetPackageData,
  selectBaseResources,
  selectIsSavingPicks,
  selectIsTypeMenuOpen,
  selectResourceTypeMove,
  selectTypeMenuResourceType,
  startSavingPicks,
  setPickerResourceType,
  selectViewData,
  setFilesData,
  setAssetPack,
  setAssetPackage,
  setResourceData,
  setScenesData,
  setUiConfig,
  toggleFolder,
} from "../../src/pages/assetPackage/assetPackage.store.js";
import {
  createAssetPackageManifest,
  createSavedAssetPackContents,
} from "../../src/internal/assetPackageManifest.js";
import { visitAssetPackageReferences } from "../../src/internal/assetPackageResources.js";
import { EN_I18N } from "../support/i18n.js";

const IMAGES_DATA = {
  items: {
    "folder-1": { type: "folder", name: "Backgrounds" },
    "folder-2": { type: "folder", name: "Night" },
    "folder-3": { type: "folder", name: "Characters" },
    "image-1": {
      type: "image",
      name: "City",
      fileId: "file-image-1",
    },
    "image-2": {
      type: "image",
      name: "Hero",
      fileId: "file-image-2",
    },
  },
  tree: [
    {
      id: "folder-1",
      children: [{ id: "folder-2", children: [{ id: "image-1" }] }],
    },
    { id: "folder-3", children: [{ id: "image-2" }] },
  ],
};

const SOUNDS_DATA = {
  items: {
    "sound-folder": { type: "folder", name: "Music" },
    "sound-1": {
      type: "sound",
      name: "Theme",
      fileId: "file-sound-1",
    },
  },
  tree: [{ id: "sound-folder", children: [{ id: "sound-1" }] }],
};

const VIDEOS_DATA = {
  items: {
    "video-folder": { type: "folder", name: "Cutscenes" },
    "video-1": {
      type: "video",
      name: "Intro",
      fileId: "file-video-1",
      thumbnailFileId: "file-video-thumbnail-1",
    },
  },
  tree: [{ id: "video-folder", children: [{ id: "video-1" }] }],
};

const AUDIO_EFFECTS_DATA = {
  items: {
    "audio-effect-folder": { type: "folder", name: "Mixing" },
    "audio-effect-1": {
      type: "audioEffect",
      name: "Fade Out",
      audioEffect: {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ duration: 500, value: 0 }],
          },
        },
      },
    },
  },
  tree: [
    {
      id: "audio-effect-folder",
      children: [{ id: "audio-effect-1" }],
    },
  ],
};

const CHARACTERS_DATA = {
  items: {
    "character-folder": { type: "folder", name: "Cast" },
    "character-1": {
      type: "character",
      name: "Hero",
      nameVariableId: "",
      tagIds: ["tag-character"],
      spriteGroups: [{ tagId: "tag-sprite", name: "Pose" }],
      sprites: {
        items: {
          "sprite-1": {
            id: "sprite-1",
            type: "image",
            name: "Default",
            fileId: "file-character-sprite",
            tagIds: ["tag-sprite"],
            parentId: "sprite-folder",
          },
        },
        tree: [{ id: "sprite-1" }],
      },
    },
  },
  tree: [{ id: "character-folder", children: [{ id: "character-1" }] }],
};

const COLORS_DATA = {
  items: {
    "color-folder": { type: "folder", name: "Colors" },
    "color-1": {
      type: "color",
      name: "Body Color",
      hex: "#112233",
    },
  },
  tree: [{ id: "color-folder", children: [{ id: "color-1" }] }],
};

const FONTS_DATA = {
  items: {
    "font-folder": { type: "folder", name: "Fonts" },
    "font-1": {
      type: "font",
      name: "Body Font",
      fileId: "file-font-1",
      fontFamily: "Body",
    },
  },
  tree: [{ id: "font-folder", children: [{ id: "font-1" }] }],
};

const TEXT_STYLES_DATA = {
  items: {
    "text-style-folder": { type: "folder", name: "Text Styles" },
    "text-style-1": {
      type: "textStyle",
      name: "Body",
      fontId: ["font-1"],
      colorId: "color-1",
      fontSize: 24,
      fontWeight: "400",
      lineHeight: 1.5,
    },
  },
  tree: [{ id: "text-style-folder", children: [{ id: "text-style-1" }] }],
};

const LAYOUTS_DATA = {
  items: {
    "layout-folder": { type: "folder", name: "Layouts" },
    "layout-1": { type: "layout", name: "Dialogue" },
  },
  tree: [{ id: "layout-folder", children: [{ id: "layout-1" }] }],
};

const FILES_DATA = {
  items: Object.fromEntries(
    [
      ["file-image-1", "image/png"],
      ["file-image-2", "image/webp"],
      ["file-sound-1", "audio/mpeg"],
      ["file-video-1", "video/mp4"],
      ["file-video-thumbnail-1", "image/webp"],
      ["file-character-sprite", "image/png"],
      ["file-font-1", "font/woff2"],
    ].map(([id, mimeType], index) => [id, { id, mimeType, size: index + 1 }]),
  ),
};

const createResourceDataByType = () => {
  const resourceDataByType = Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_CONFIGS.map(({ resourceType }) => [
      resourceType,
      { items: {}, tree: [] },
    ]),
  );
  // Copies, so a test that edits its data leaves the next test's intact.
  Object.assign(
    resourceDataByType,
    structuredClone({
      images: IMAGES_DATA,
      sounds: SOUNDS_DATA,
      videos: VIDEOS_DATA,
      audioEffects: AUDIO_EFFECTS_DATA,
      characters: CHARACTERS_DATA,
      colors: COLORS_DATA,
      fonts: FONTS_DATA,
      textStyles: TEXT_STYLES_DATA,
      layouts: LAYOUTS_DATA,
    }),
  );
  return resourceDataByType;
};

describe("asset package store", () => {
  it("lists each type with resources and its folders, and uses the compact touch shell", () => {
    const state = createInitialState();
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      resourceCategory: "releases",
      selectedResourceId: "asset-pack-editor",
      showExplorerPanel: true,
      contentLeftPadding: "sm",
      hasPicks: false,
      pickerTypes: [],
      exportDisabled: true,
    });

    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    openPicker({ state });
    const viewData = selectViewData({ state, i18n: EN_I18N });
    // Types without resources are left out, and so are audio effects, which
    // the asset store does not take for now.
    expect(viewData.pickerTypes.map((type) => type.resourceType)).toEqual([
      "images",
      "sounds",
      "videos",
      "characters",
      "colors",
      "fonts",
      "textStyles",
      "layouts",
    ]);
    // The picker opens on the first type with folders and shows only it.
    expect(viewData.pickerTypes[0]).toMatchObject({
      resourceType: "images",
      label: "Images",
      isCurrent: true,
      selectedCount: "",
    });
    expect(viewData.pickerSection.resourceType).toBe("images");
    // Folders at any depth, in tree order, indented by depth, each with the
    // resources directly in it, so a resource shows once.
    expect(viewData.pickerSection.folders).toMatchObject([
      {
        folderId: "folder-1",
        name: "Backgrounds",
        indent: "0",
        selected: false,
        isIncluded: false,
        pickOrder: "",
        items: [],
        resourceCount: 0,
      },
      {
        folderId: "folder-2",
        name: "Night",
        indent: "24",
        selected: false,
        isIncluded: false,
        pickOrder: "",
        items: [
          {
            id: "image-1",
            name: "City",
            kind: "image",
            fileId: "file-image-1",
            showName: true,
          },
        ],
        resourceCount: 1,
      },
      { folderId: "folder-3", name: "Characters", indent: "0" },
    ]);

    setUiConfig({ state }, { uiConfig: { id: "touch" } });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isTouchMode: true,
      showExplorerPanel: false,
      contentLeftPadding: "0",
    });
  });

  it("ticks folders in the picker, in the order picked, and applies them on Done", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );

    openPicker({ state });
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-3" });
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-1" });
    // A folder inside a ticked one comes with it, and is not ticked alone.
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-2" });
    // Neither is a folder the type does not have.
    toggleFolder({ state }, { resourceType: "images", folderId: "image-1" });
    toggleFolder({ state }, { resourceType: "sounds", folderId: "folder-1" });
    // Ticking a picked folder again leaves it where it is.
    toggleFolder(
      { state },
      { resourceType: "images", folderId: "folder-3", selected: true },
    );
    // The picker shows its ticks; the page waits for Done.
    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.pickerTypes[0].selectedCount).toBe("2");
    expect(
      viewData.pickerSection.folders.map((folder) => [
        folder.folderId,
        folder.pickOrder,
      ]),
    ).toEqual([
      ["folder-1", "2"],
      ["folder-2", ""],
      ["folder-3", "1"],
    ]);
    expect(state.pickerFolderIdsByType.images).toEqual([
      "folder-3",
      "folder-1",
    ]);
    expect(state.pickerFolderIdsByType.sounds).toEqual([]);
    expect(viewData.pickedSections).toEqual([]);
    expect(viewData.exportDisabled).toBe(true);

    applyPicker({ state });
    expect(state.isPickerOpen).toBe(false);
    expect(state.selectedFolderIdsByType.images).toEqual([
      "folder-3",
      "folder-1",
    ]);
    viewData = selectViewData({ state, i18n: EN_I18N });
    // The page lists only what is picked, in the order picked.
    expect(
      viewData.pickedSections[0].folders.map((folder) => folder.folderId),
    ).toEqual(["folder-3", "folder-1"]);
    expect(viewData.pickedSections[0].folders[1]).toMatchObject({
      name: "Backgrounds",
      items: [{ id: "image-1", name: "City", showName: true }],
    });
    expect(viewData.exportDisabled).toBe(false);

    // Closing the picker without Done drops its ticks.
    openPicker({ state });
    toggleFolder(
      { state },
      { resourceType: "images", folderId: "folder-3", selected: false },
    );
    closePicker({ state });
    expect(state.selectedFolderIdsByType.images).toEqual([
      "folder-3",
      "folder-1",
    ]);
    openPicker({ state });
    expect(state.pickerFolderIdsByType.images).toEqual([
      "folder-3",
      "folder-1",
    ]);

    // Unticked and ticked again, a folder goes after those picked before it.
    toggleFolder(
      { state },
      { resourceType: "images", folderId: "folder-3", selected: false },
    );
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-3" });
    applyPicker({ state });
    expect(state.selectedFolderIdsByType.images).toEqual([
      "folder-1",
      "folder-3",
    ]);
    openPicker({ state });

    // Choosing another type shows only its folders; an unknown one is ignored.
    setPickerResourceType({ state }, { resourceType: "sounds" });
    setPickerResourceType({ state }, { resourceType: "scenes" });
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.pickerSection.resourceType).toBe("sounds");
    expect(
      viewData.pickerTypes
        .filter((type) => type.isCurrent)
        .map((type) => type.resourceType),
    ).toEqual(["sounds"]);
    closePicker({ state });
    expect(selectViewData({ state, i18n: EN_I18N }).pickerTypes).toEqual([]);
    // Reopening shows the type shown last.
    openPicker({ state });
    expect(
      selectViewData({ state, i18n: EN_I18N }).pickerSection.resourceType,
    ).toBe("sounds");
  });

  it("leaves empty folders out of the picker, unless they are picked", () => {
    const resourceDataByType = createResourceDataByType();
    // An empty folder, and one holding only an empty folder.
    Object.assign(resourceDataByType.images.items, {
      "folder-empty": { type: "folder", name: "Empty" },
      "folder-nested-empty": { type: "folder", name: "Nested Empty" },
      "folder-inner-empty": { type: "folder", name: "Inner Empty" },
    });
    resourceDataByType.images.tree.push(
      { id: "folder-empty", children: [] },
      {
        id: "folder-nested-empty",
        children: [{ id: "folder-inner-empty", children: [] }],
      },
    );
    // A type with only an empty folder.
    resourceDataByType.colors = {
      items: { "color-folder": { type: "folder", name: "Palette" } },
      tree: [{ id: "color-folder", children: [] }],
    };
    const state = createInitialState();
    setResourceData({ state }, { resourceDataByType });

    openPicker({ state });
    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.pickerSection.resourceType).toBe("images");
    expect(
      viewData.pickerSection.folders.map((folder) => folder.folderId),
    ).toEqual(["folder-1", "folder-2", "folder-3"]);
    expect(viewData.pickerTypes.map((type) => type.resourceType)).not.toContain(
      "colors",
    );
    setPickerResourceType({ state }, { resourceType: "colors" });
    expect(state.pickerResourceType).toBe("images");
    closePicker({ state });

    // A picked folder that is now empty stays, so it can be unticked.
    setAssetPackage(
      { state },
      {
        assetPackage: {
          schemaVersion: 1,
          resources: [{ resourceType: "images", folderIds: ["folder-empty"] }],
        },
      },
    );
    openPicker({ state });
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(
      viewData.pickerSection.folders.map((folder) => [
        folder.folderId,
        folder.selected,
      ]),
    ).toEqual([
      ["folder-1", false],
      ["folder-2", false],
      ["folder-3", false],
      ["folder-empty", true],
    ]);
    toggleFolder(
      { state },
      { resourceType: "images", folderId: "folder-empty", selected: false },
    );
    applyPicker({ state });
    expect(state.selectedFolderIdsByType.images).toEqual([]);
    closePicker({ state });

    // So does an emptied folder picked inside another, with the folders it
    // sits in, which hold nothing else.
    setAssetPackage(
      { state },
      {
        assetPackage: {
          schemaVersion: 1,
          resources: [
            { resourceType: "images", folderIds: ["folder-inner-empty"] },
          ],
        },
      },
    );
    openPicker({ state });
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(
      viewData.pickerSection.folders.map((folder) => [
        folder.folderId,
        folder.indent,
        folder.selected,
      ]),
    ).toEqual([
      ["folder-1", "0", false],
      ["folder-2", "24", false],
      ["folder-3", "0", false],
      ["folder-nested-empty", "0", false],
      ["folder-inner-empty", "24", true],
    ]);
  });

  it("picks a folder at any depth, and shows one inside a ticked folder as included", () => {
    const resourceDataByType = createResourceDataByType();
    // Backgrounds > Night > Late, with a resource of its own.
    Object.assign(resourceDataByType.images.items, {
      "folder-late": { type: "folder", name: "Late" },
      "image-late": { type: "image", name: "Moon", fileId: "file-image-1" },
    });
    resourceDataByType.images.tree[0].children[0].children.push({
      id: "folder-late",
      children: [{ id: "image-late" }],
    });
    const state = createInitialState();
    setResourceData({ state }, { resourceDataByType });
    const pickerFolders = () =>
      selectViewData({ state, i18n: EN_I18N }).pickerSection.folders.map(
        (folder) => ({
          folderId: folder.folderId,
          selected: folder.selected,
          isIncluded: folder.isIncluded,
          includedHint: folder.includedHint,
          pickOrder: folder.pickOrder,
        }),
      );
    const selectedCount = () =>
      selectViewData({ state, i18n: EN_I18N }).pickerTypes[0].selectedCount;

    openPicker({ state });
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-2" });
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-3" });
    expect(pickerFolders()).toEqual([
      {
        folderId: "folder-1",
        selected: false,
        isIncluded: false,
        includedHint: "",
        pickOrder: "",
      },
      {
        folderId: "folder-2",
        selected: true,
        isIncluded: false,
        includedHint: "",
        pickOrder: "1",
      },
      {
        folderId: "folder-late",
        selected: true,
        isIncluded: true,
        includedHint: "Included in “Night”",
        pickOrder: "",
      },
      {
        folderId: "folder-3",
        selected: true,
        isIncluded: false,
        includedHint: "",
        pickOrder: "2",
      },
    ]);
    expect(selectedCount()).toBe("2");

    // Ticking the folder Night sits in includes Night, which keeps its own
    // pick; the numbers count the folders the pack carries.
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-1" });
    expect(state.pickerFolderIdsByType.images).toEqual([
      "folder-2",
      "folder-3",
      "folder-1",
    ]);
    expect(pickerFolders()).toMatchObject([
      { folderId: "folder-1", selected: true, pickOrder: "2" },
      {
        folderId: "folder-2",
        selected: true,
        isIncluded: true,
        includedHint: "Included in “Backgrounds”",
        pickOrder: "",
      },
      {
        folderId: "folder-late",
        isIncluded: true,
        includedHint: "Included in “Night”",
      },
      { folderId: "folder-3", pickOrder: "1" },
    ]);
    expect(selectedCount()).toBe("2");
    // An included folder is not unticked on its own.
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-2" });
    expect(state.pickerFolderIdsByType.images).toContain("folder-2");

    // Unticking Backgrounds leaves Night picked.
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-1" });
    expect(pickerFolders()).toMatchObject([
      { folderId: "folder-1", selected: false, pickOrder: "" },
      { folderId: "folder-2", selected: true, pickOrder: "1" },
      { folderId: "folder-late", isIncluded: true },
      { folderId: "folder-3", pickOrder: "2" },
    ]);
    applyPicker({ state });
    expect(state.selectedFolderIdsByType.images).toEqual([
      "folder-2",
      "folder-3",
    ]);
  });

  it("lists a nested pick on the page with its path, and a pick inside another once", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    const pickedFolders = () =>
      selectViewData({ state, i18n: EN_I18N }).pickedSections[0].folders.map(
        (folder) => [
          folder.folderId,
          folder.name,
          folder.items.map((item) => item.id),
        ],
      );

    state.selectedFolderIdsByType.images = ["folder-3", "folder-2"];
    expect(pickedFolders()).toEqual([
      ["folder-3", "Characters", ["image-2"]],
      ["folder-2", "Backgrounds > Night", ["image-1"]],
    ]);
    expect(selectViewData({ state, i18n: EN_I18N }).exportDisabled).toBe(false);

    // Night comes with Backgrounds, which shows all it holds.
    state.selectedFolderIdsByType.images = ["folder-2", "folder-1"];
    expect(pickedFolders()).toEqual([["folder-1", "Backgrounds", ["image-1"]]]);
  });

  // The store runs exports named select* on read-only state, so an action
  // named so would throw on its first write.
  it("only reads the state in its select* exports", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    openPicker({ state });
    const freeze = (value) => {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    };
    freeze(state);

    const selectors = Object.entries(assetPackageStore).filter(([name]) =>
      name.startsWith("select"),
    );
    expect(selectors.length).toBeGreaterThan(0);
    for (const [, selector] of selectors) {
      expect(() =>
        selector({ state, i18n: EN_I18N }, { resourceType: "sounds" }),
      ).not.toThrow();
    }
  });

  it("shows every resource in a folder, with its name", () => {
    const state = createInitialState();
    const resourceDataByType = createResourceDataByType();
    resourceDataByType.colors = {
      items: {
        palette: { type: "folder", name: "Palette" },
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, index) => [
            `color-${index}`,
            { type: "color", name: `Color ${index}`, hex: "#112233" },
          ]),
        ),
      },
      tree: [
        {
          id: "palette",
          children: Array.from({ length: 8 }, (_, index) => ({
            id: `color-${index}`,
          })),
        },
      ],
    };
    setResourceData({ state }, { resourceDataByType });

    openPicker({ state });
    setPickerResourceType({ state }, { resourceType: "colors" });
    const colors = selectViewData({ state, i18n: EN_I18N }).pickerSection;
    expect(colors.folders[0].items).toHaveLength(8);
    expect(colors.folders[0].items[7]).toMatchObject({
      kind: "color",
      name: "Color 7",
      hex: "#112233",
      showName: true,
    });
  });

  it("previews fonts, text styles and resources without one as their pages do", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    openPicker({ state });
    const previewOf = (resourceType) => {
      setPickerResourceType({ state }, { resourceType });
      return selectViewData({ state, i18n: EN_I18N }).pickerSection.folders[0]
        .items[0];
    };

    expect(previewOf("fonts")).toMatchObject({
      kind: "font",
      fontFamily: "Body",
      fontFileId: "file-font-1",
    });
    expect(previewOf("textStyles")).toMatchObject({
      kind: "textStyle",
      fontFamilies: ["Body"],
      fontFileIds: ["file-font-1"],
      color: "#112233",
      previewText: "Body",
    });
    expect(previewOf("videos")).toMatchObject({
      kind: "thumbnail",
      fileId: "file-video-thumbnail-1",
    });
    // A type the store does not take is offered only while folders of it are
    // picked, so they can be unticked.
    expect(
      selectViewData({ state, i18n: EN_I18N }).pickerTypes.map(
        (type) => type.resourceType,
      ),
    ).not.toContain("audioEffects");
    setPickerResourceType({ state }, { resourceType: "audioEffects" });
    expect(state.pickerResourceType).toBe("videos");
    state.selectedFolderIdsByType.audioEffects = ["audio-effect-folder"];
    expect(previewOf("audioEffects")).toMatchObject({
      kind: "icon",
      icon: "audioEffects",
    });
  });

  it("hydrates the saved asset package in its saved type order, keeping folders at any depth and removing stale ones", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );

    setAssetPackage(
      { state },
      {
        assetPackage: {
          schemaVersion: 1,
          resources: [
            {
              resourceType: "videos",
              folderIds: ["video-folder", "missing-folder"],
            },
            {
              resourceType: "images",
              folderIds: ["folder-3", "folder-2", "image-1", "folder-1"],
            },
            {
              resourceType: "layouts",
              folderIds: ["layout-folder"],
            },
          ],
        },
      },
    );

    // The types stay in the order the pack lists them, not the default one.
    const resources = [
      { resourceType: "videos", folderIds: ["video-folder"] },
      {
        resourceType: "images",
        folderIds: ["folder-3", "folder-2", "folder-1"],
      },
      { resourceType: "layouts", folderIds: ["layout-folder"] },
    ];
    expect(selectAssetPackage({ state })).toEqual({
      schemaVersion: 1,
      resources,
    });
    // A save starts from the picks as loaded.
    expect(selectBaseResources({ state })).toEqual(resources);
  });

  const loadPack = (resources) => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    setAssetPack({ state }, { assetPackId: "pack-1", name: "Pack", resources });
    return state;
  };
  const listedTypes = (state) =>
    selectViewData({ state, i18n: EN_I18N }).pickedSections.map(
      (section) => section.resourceType,
    );

  it("lists the picked types in the pack's order, and saves them in it", () => {
    const state = loadPack([
      { resourceType: "videos", folderIds: ["video-folder"] },
      { resourceType: "images", folderIds: ["folder-1"] },
      { resourceType: "colors", folderIds: ["color-folder"] },
    ]);

    expect(listedTypes(state)).toEqual(["videos", "images", "colors"]);
    const savedTypes = (resources) =>
      resources.map(({ resourceType }) => resourceType);
    expect(savedTypes(selectAssetPackage({ state }).resources)).toEqual([
      "videos",
      "images",
      "colors",
    ]);
    expect(savedTypes(selectBaseResources({ state }))).toEqual([
      "videos",
      "images",
      "colors",
    ]);
  });

  it("puts types picked since after the pack's, in the default order", () => {
    const state = loadPack([
      { resourceType: "videos", folderIds: ["video-folder"] },
      { resourceType: "colors", folderIds: ["color-folder"] },
    ]);

    openPicker({ state });
    toggleFolder(
      { state },
      { resourceType: "layouts", folderId: "layout-folder" },
    );
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-1" });
    toggleFolder(
      { state },
      { resourceType: "sounds", folderId: "sound-folder" },
    );
    applyPicker({ state });

    expect(listedTypes(state)).toEqual([
      "videos",
      "colors",
      "images",
      "sounds",
      "layouts",
    ]);
    expect(
      selectAssetPackage({ state }).resources.map(
        ({ resourceType }) => resourceType,
      ),
    ).toEqual(["videos", "colors", "images", "sounds", "layouts"]);
    // The base is still the pack as loaded, until a save ends.
    expect(
      selectBaseResources({ state }).map(({ resourceType }) => resourceType),
    ).toEqual(["videos", "colors"]);
    finishSavingPicks(
      { state },
      { savedResources: selectAssetPackage({ state }).resources },
    );
    expect(
      selectBaseResources({ state }).map(({ resourceType }) => resourceType),
    ).toEqual(["videos", "colors", "images", "sounds", "layouts"]);
  });

  it("puts a type that was unpicked and picked again last", () => {
    const state = loadPack([
      { resourceType: "images", folderIds: ["folder-1"] },
      { resourceType: "videos", folderIds: ["video-folder"] },
      { resourceType: "colors", folderIds: ["color-folder"] },
    ]);

    openPicker({ state });
    toggleFolder(
      { state },
      { resourceType: "images", folderId: "folder-1", selected: false },
    );
    applyPicker({ state });
    expect(listedTypes(state)).toEqual(["videos", "colors"]);

    openPicker({ state });
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-1" });
    applyPicker({ state });
    expect(listedTypes(state)).toEqual(["videos", "colors", "images"]);

    // Unticked and ticked again in one picker, it never left.
    openPicker({ state });
    toggleFolder(
      { state },
      { resourceType: "videos", folderId: "video-folder", selected: false },
    );
    toggleFolder(
      { state },
      { resourceType: "videos", folderId: "video-folder" },
    );
    applyPicker({ state });
    expect(listedTypes(state)).toEqual(["videos", "colors", "images"]);
  });

  it("goes back to the pack's order when the saved pack is loaded again", () => {
    const state = loadPack([
      { resourceType: "videos", folderIds: ["video-folder"] },
      { resourceType: "images", folderIds: ["folder-1"] },
    ]);
    openPicker({ state });
    toggleFolder(
      { state },
      { resourceType: "colors", folderId: "color-folder" },
    );
    applyPicker({ state });
    expect(listedTypes(state)).toEqual(["videos", "images", "colors"]);

    // A save that failed.
    setAssetPack(
      { state },
      {
        assetPackId: "pack-1",
        name: "Pack",
        resources: [
          { resourceType: "videos", folderIds: ["video-folder"] },
          { resourceType: "images", folderIds: ["folder-1"] },
        ],
      },
    );
    expect(listedTypes(state)).toEqual(["videos", "images"]);
  });

  it("offers each picked type a menu of the moves it can make, and none when it is alone", () => {
    const state = loadPack([
      { resourceType: "images", folderIds: ["folder-1"] },
      { resourceType: "videos", folderIds: ["video-folder"] },
      { resourceType: "colors", folderIds: ["color-folder"] },
    ]);
    const menuFor = (resourceType) => {
      openTypeMenu({ state, i18n: EN_I18N }, { x: 10, y: 20, resourceType });
      return state.typeMenu;
    };

    // The first type can only go down, the last only up.
    expect(menuFor("images")).toEqual({
      isOpen: true,
      x: 10,
      y: 20,
      resourceType: "images",
      items: [{ label: "Move Down", type: "item", value: "move-down" }],
    });
    expect(menuFor("videos").items).toEqual([
      { label: "Move Up", type: "item", value: "move-up" },
      { label: "Move Down", type: "item", value: "move-down" },
    ]);
    expect(menuFor("colors").items).toEqual([
      { label: "Move Up", type: "item", value: "move-up" },
    ]);
    expect(selectIsTypeMenuOpen({ state })).toBe(true);
    expect(selectTypeMenuResourceType({ state })).toBe("colors");
    closeTypeMenu({ state });
    expect(state.typeMenu).toEqual({
      isOpen: false,
      x: 0,
      y: 0,
      resourceType: undefined,
      items: [],
    });

    // A type the pack does not list has no menu.
    openTypeMenu({ state, i18n: EN_I18N }, { resourceType: "sounds" });
    expect(selectIsTypeMenuOpen({ state })).toBe(false);

    // Each heading has a button, unless there is only one type.
    const sections = selectViewData({ state, i18n: EN_I18N }).pickedSections;
    expect(sections.map((section) => section.hasTypeMenu)).toEqual([
      true,
      true,
      true,
    ]);
    const lone = loadPack([
      { resourceType: "images", folderIds: ["folder-1"] },
    ]);
    expect(
      selectViewData({ state: lone, i18n: EN_I18N }).pickedSections,
    ).toMatchObject([{ resourceType: "images", hasTypeMenu: false }]);
  });

  it("moves a type before the one above it or after the one below it", () => {
    const state = loadPack([
      { resourceType: "images", folderIds: ["folder-1"] },
      { resourceType: "videos", folderIds: ["video-folder"] },
      { resourceType: "colors", folderIds: ["color-folder"] },
    ]);

    expect(
      selectResourceTypeMove(
        { state },
        { resourceType: "videos", value: "move-up" },
      ),
    ).toEqual({
      resourceType: "videos",
      position: "before",
      positionTargetResourceType: "images",
    });
    expect(
      selectResourceTypeMove(
        { state },
        { resourceType: "videos", value: "move-down" },
      ),
    ).toEqual({
      resourceType: "videos",
      position: "after",
      positionTargetResourceType: "colors",
    });
    // There is nothing above the first or below the last, or for an unknown
    // item or type.
    for (const [resourceType, value] of [
      ["images", "move-up"],
      ["colors", "move-down"],
      ["videos", "remove"],
      ["sounds", "move-up"],
    ]) {
      expect(
        selectResourceTypeMove({ state }, { resourceType, value }),
      ).toBeUndefined();
    }

    // A saved move changes the order the page lists and the next save uses.
    moveResourceType(
      { state },
      {
        resourceType: "colors",
        position: "before",
        positionTargetResourceType: "images",
      },
    );
    expect(listedTypes(state)).toEqual(["colors", "images", "videos"]);
    moveResourceType(
      { state },
      {
        resourceType: "colors",
        position: "after",
        positionTargetResourceType: "videos",
      },
    );
    expect(listedTypes(state)).toEqual(["images", "videos", "colors"]);
    expect(
      selectAssetPackage({ state }).resources.map(
        ({ resourceType }) => resourceType,
      ),
    ).toEqual(["images", "videos", "colors"]);
    expect(
      selectBaseResources({ state }).map(({ resourceType }) => resourceType),
    ).toEqual(["images", "videos", "colors"]);

    // A move naming a type the page does not list changes nothing.
    moveResourceType(
      { state },
      {
        resourceType: "sounds",
        position: "first",
        positionTargetResourceType: "images",
      },
    );
    moveResourceType(
      { state },
      {
        resourceType: "videos",
        position: "before",
        positionTargetResourceType: "sounds",
      },
    );
    expect(listedTypes(state)).toEqual(["images", "videos", "colors"]);
  });

  it("disables the type menus while the picks save", () => {
    const state = loadPack([
      { resourceType: "images", folderIds: ["folder-1"] },
      { resourceType: "videos", folderIds: ["video-folder"] },
    ]);
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      typeMenuDisabled: false,
      typeOptionsLabel: "Type options",
    });
    startSavingPicks({ state });
    expect(selectViewData({ state, i18n: EN_I18N }).typeMenuDisabled).toBe(
      true,
    );
  });

  it("disables Done while the picks save, and saves the next time from the saved picks", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    setAssetPack(
      { state },
      {
        assetPackId: "pack-1",
        name: "Pack",
        resources: [{ resourceType: "images", folderIds: ["folder-1"] }],
      },
    );
    expect(selectIsSavingPicks({ state })).toBe(false);
    expect(selectViewData({ state, i18n: EN_I18N }).pickerDoneDisabled).toBe(
      false,
    );

    openPicker({ state });
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-3" });
    applyPicker({ state });
    startSavingPicks({ state });
    expect(selectIsSavingPicks({ state })).toBe(true);
    expect(selectViewData({ state, i18n: EN_I18N }).pickerDoneDisabled).toBe(
      true,
    );
    // Until the save ends, a save would still start from the loaded picks.
    expect(selectBaseResources({ state })).toEqual([
      { resourceType: "images", folderIds: ["folder-1"] },
    ]);

    const { resources } = selectAssetPackage({ state });
    finishSavingPicks({ state }, { savedResources: resources });
    expect(selectIsSavingPicks({ state })).toBe(false);
    expect(selectBaseResources({ state })).toEqual([
      { resourceType: "images", folderIds: ["folder-1", "folder-3"] },
    ]);

    // A failed save leaves the base as it was.
    startSavingPicks({ state });
    finishSavingPicks({ state });
    expect(selectIsSavingPicks({ state })).toBe(false);
    expect(selectBaseResources({ state })).toEqual(resources);
  });

  it("exports a saved pack from the project's state as its editor does", () => {
    const resourceDataByType = createResourceDataByType();
    const resources = [
      { resourceType: "sounds", folderIds: ["sound-folder"] },
      { resourceType: "images", folderIds: ["folder-3", "folder-1"] },
    ];
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData({ state }, { resourceDataByType });
    setAssetPack({ state }, { assetPackId: "pack-1", name: "Pack", resources });

    const repositoryState = {
      ...structuredClone(resourceDataByType),
      files: FILES_DATA,
      assetPacks: {
        items: {
          "pack-1": {
            id: "pack-1",
            type: "assetPack",
            name: "Pack",
            resources,
          },
        },
        tree: [{ id: "pack-1" }],
      },
    };
    const savedContents = createSavedAssetPackContents({
      repositoryState,
      assetPackId: "pack-1",
    });
    expect(savedContents).toEqual(selectAssetPackageData({ state }));
    // Both list the picked types in the pack's order, which import follows.
    expect(Object.keys(savedContents.repository)).toEqual([
      "files",
      "sounds",
      "images",
    ]);
    expect(Object.keys(selectAssetPackageData({ state }).repository)).toEqual([
      "files",
      "sounds",
      "images",
    ]);
  });

  it("exports selected folders from any resource type and nested file references", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    state.selectedFolderIdsByType.images = ["folder-1"];
    state.selectedFolderIdsByType.characters = ["character-folder"];

    const { repository } = selectAssetPackageData({ state });

    expect(Object.keys(repository)).toEqual(["files", "images", "characters"]);

    expect(repository.images.tree).toEqual([
      {
        id: "folder-1",
        children: [{ id: "folder-2", children: [{ id: "image-1" }] }],
      },
    ]);
    expect(repository.characters.items["character-1"]).toMatchObject({
      id: "character-1",
      type: "character",
      name: "Hero",
      nameVariableId: "",
      sprites: {
        items: {
          "sprite-1": expect.objectContaining({
            id: "sprite-1",
            fileId: "file-character-sprite",
          }),
        },
      },
    });
    expect(repository.characters.items["character-1"]).not.toHaveProperty(
      "tagIds",
    );
    expect(repository.characters.items["character-1"]).not.toHaveProperty(
      "spriteGroups",
    );
    expect(
      repository.characters.items["character-1"].sprites.items["sprite-1"],
    ).not.toHaveProperty("tagIds");
    expect(repository.files.items).toEqual(
      expect.objectContaining({
        "file-image-1": expect.any(Object),
        "file-character-sprite": expect.any(Object),
      }),
    );
  });

  it("exports a nested pick as a top-level folder, and a pick inside another once", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    const exportedImages = () =>
      selectAssetPackageData({ state }).repository.images;

    // Night goes without Backgrounds, the folder it sits in.
    state.selectedFolderIdsByType.images = ["folder-3", "folder-2"];
    let images = exportedImages();
    expect(images.tree).toEqual([
      { id: "folder-3", children: [{ id: "image-2" }] },
      { id: "folder-2", children: [{ id: "image-1" }] },
    ]);
    expect(Object.keys(images.items).sort()).toEqual([
      "folder-2",
      "folder-3",
      "image-1",
      "image-2",
    ]);
    expect(images.items["folder-2"]).toEqual({
      id: "folder-2",
      type: "folder",
      name: "Night",
    });

    // Picked with Backgrounds, Night comes with it, once, where Backgrounds
    // is picked.
    state.selectedFolderIdsByType.images = ["folder-2", "folder-3", "folder-1"];
    images = exportedImages();
    expect(images.tree).toEqual([
      { id: "folder-3", children: [{ id: "image-2" }] },
      {
        id: "folder-1",
        children: [{ id: "folder-2", children: [{ id: "image-1" }] }],
      },
    ]);
    expect(
      createAssetPackageManifest(selectAssetPackageData({ state })).repository
        .images.tree,
    ).toEqual(images.tree);

    // An empty nested pick exports nothing, so Export stays disabled.
    const resourceDataByType = createResourceDataByType();
    resourceDataByType.images.items["folder-empty"] = {
      type: "folder",
      name: "Empty",
    };
    resourceDataByType.images.tree[1].children.push({
      id: "folder-empty",
      children: [],
    });
    setResourceData({ state }, { resourceDataByType });
    state.selectedFolderIdsByType.images = ["folder-empty"];
    expect(selectViewData({ state, i18n: EN_I18N }).exportDisabled).toBe(true);
    expect(() =>
      createAssetPackageManifest(selectAssetPackageData({ state })),
    ).toThrow(expect.objectContaining({ code: "no_resources" }));
  });

  it("lists and exports what a nested pick uses", () => {
    const resourceDataByType = createResourceDataByType();
    // The text styles sit in a folder inside another.
    resourceDataByType.textStyles.items["text-style-outer"] = {
      type: "folder",
      name: "UI",
    };
    resourceDataByType.textStyles.tree = [
      { id: "text-style-outer", children: resourceDataByType.textStyles.tree },
    ];
    const resources = [
      { resourceType: "textStyles", folderIds: ["text-style-folder"] },
    ];
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData({ state }, { resourceDataByType });
    setAssetPack({ state }, { assetPackId: "pack-1", name: "Pack", resources });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.pickedSections[0].folders[0].name).toBe("UI > Text Styles");
    expect(
      viewData.comesWith.groups.map((group) => group.resourceType),
    ).toEqual(["colors", "fonts"]);
    expect(viewData.exportDisabled).toBe(false);

    const contents = selectAssetPackageData({ state });
    expect(contents.repository.textStyles.tree).toEqual([
      { id: "text-style-folder", children: [{ id: "text-style-1" }] },
    ]);
    expect(Object.keys(contents.dependencies)).toEqual(["colors", "fonts"]);
    // The list page exports the saved pack as its editor does.
    expect(
      createSavedAssetPackContents({
        repositoryState: {
          ...structuredClone(resourceDataByType),
          files: FILES_DATA,
          assetPacks: {
            items: {
              "pack-1": {
                id: "pack-1",
                type: "assetPack",
                name: "Pack",
                resources,
              },
            },
            tree: [{ id: "pack-1" }],
          },
        },
        assetPackId: "pack-1",
      }),
    ).toEqual(contents);
  });

  it("exports audio effect folders added by the current repository schema", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    state.selectedFolderIdsByType.audioEffects = ["audio-effect-folder"];

    const { repository } = selectAssetPackageData({ state });

    expect(repository.audioEffects.tree).toEqual([
      {
        id: "audio-effect-folder",
        children: [{ id: "audio-effect-1" }],
      },
    ]);
    expect(repository.audioEffects.items["audio-effect-1"]).toMatchObject({
      type: "audioEffect",
      name: "Fade Out",
      audioEffect: {
        type: "update",
      },
    });
  });

  it("puts what the picks use in dependencies, without its folders", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    state.selectedFolderIdsByType.textStyles = ["text-style-folder"];

    const { repository, dependencies } = selectAssetPackageData({ state });

    expect(Object.keys(repository)).toEqual(["files", "textStyles"]);
    expect(repository.textStyles.items).toHaveProperty("text-style-1");
    expect(Object.keys(dependencies)).toEqual(["colors", "fonts"]);
    expect(Object.keys(dependencies.fonts.items)).toEqual(["font-1"]);
    expect(dependencies.fonts).not.toHaveProperty("tree");
    expect(Object.keys(dependencies.colors.items)).toEqual(["color-1"]);
    expect(repository.files.items).toHaveProperty("file-font-1");
  });

  it("lists what the picks use under Comes with, with the picks that use it", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    expect(selectViewData({ state, i18n: EN_I18N }).comesWith.isVisible).toBe(
      false,
    );

    state.selectedFolderIdsByType.textStyles = ["text-style-folder"];
    const { comesWith } = selectViewData({ state, i18n: EN_I18N });

    expect(comesWith).toMatchObject({
      isVisible: true,
      title: "Dependencies",
      groups: [
        {
          resourceType: "colors",
          items: [
            {
              name: "Body Color",
              usedBy: "Used by Body",
              preview: { kind: "color", name: "Body Color", showName: true },
            },
          ],
        },
        {
          resourceType: "fonts",
          items: [{ name: "Body Font", usedBy: "Used by Body" }],
        },
      ],
    });
  });

  it("lists nothing under Comes with when the selection cannot be exported", () => {
    const state = createInitialState();
    const resourceDataByType = createResourceDataByType();
    delete resourceDataByType.fonts.items["font-1"];
    resourceDataByType.fonts.tree[0].children = [];
    setResourceData({ state }, { resourceDataByType });
    state.selectedFolderIdsByType.textStyles = ["text-style-folder"];

    // It names the resource at fault.
    expect(selectViewData({ state, i18n: EN_I18N }).comesWith).toMatchObject({
      isVisible: false,
      isInvalid: true,
      invalidMessage:
        "“Body” in Text Styles uses a resource that no longer exists, so this selection can't be exported.",
    });
  });

  it("keeps a resource the author picked as a pick when another pick uses it", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    state.selectedFolderIdsByType.textStyles = ["text-style-folder"];
    state.selectedFolderIdsByType.colors = ["color-folder"];

    const { repository, dependencies } = selectAssetPackageData({ state });

    expect(repository.colors.items).toHaveProperty("color-1");
    expect(Object.keys(dependencies)).toEqual(["fonts"]);
  });

  it("rejects a selected resource with a missing dependency", () => {
    const state = createInitialState();
    const resourceDataByType = createResourceDataByType();
    delete resourceDataByType.fonts.items["font-1"];
    resourceDataByType.fonts.tree[0].children = [];
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData({ state }, { resourceDataByType });
    state.selectedFolderIdsByType.textStyles = ["text-style-folder"];

    expect(() => selectAssetPackageData({ state })).toThrow(
      "Referenced resource 'font-1' is missing.",
    );
  });

  it("exports a story jump, even a dependency's, as a link", () => {
    const state = createInitialState();
    const resourceDataByType = createResourceDataByType();
    resourceDataByType.layouts = {
      items: {
        "layout-folder": { type: "folder", name: "Layouts" },
        "layout-1": {
          type: "layout",
          name: "Menu",
          elements: {
            items: {
              "button-1": {
                click: {
                  payload: {
                    actions: {
                      resetStoryAtSection: { sectionId: "section-1" },
                      sectionTransition: {
                        sceneId: "scene-1",
                        sectionId: "section-1",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      tree: [{ id: "layout-folder", children: [{ id: "layout-1" }] }],
    };
    resourceDataByType.controls = {
      items: {
        "control-folder": { type: "folder", name: "Controls" },
        "control-1": {
          type: "control",
          name: "Continue",
          layoutId: "layout-1",
        },
      },
      tree: [{ id: "control-folder", children: [{ id: "control-1" }] }],
    };
    setResourceData({ state }, { resourceDataByType });
    setScenesData(
      { state },
      {
        scenesData: {
          items: {
            "scene-1": {
              type: "scene",
              name: "Title",
              sections: {
                items: { "section-1": { name: "Start" } },
                tree: [{ id: "section-1" }],
              },
            },
          },
          tree: [{ id: "scene-1" }],
        },
      },
    );
    state.selectedFolderIdsByType.controls = ["control-folder"];

    const contents = selectAssetPackageData({ state });
    // The jump points at the link; a section jump drops its scene.
    expect(
      contents.dependencies.layouts.items["layout-1"].elements.items["button-1"]
        .click.payload.actions,
    ).toEqual({
      resetStoryAtSection: { sectionId: "link.section-1" },
      sectionTransition: { sectionId: "link.section-1" },
    });
    expect(contents.links).toEqual({
      items: {
        "link.section-1": {
          kind: "section",
          name: "Start",
          sceneName: "Title",
        },
      },
    });
    expect(createAssetPackageManifest(contents).links).toEqual(contents.links);

    // The page lists the link with the layout that jumps there.
    const { comesWith } = selectViewData({ state, i18n: EN_I18N });
    expect(comesWith.isInvalid).toBe(false);
    expect(comesWith.links).toMatchObject({
      isVisible: true,
      title: "Links",
      items: [
        {
          id: "link.section-1",
          icon: "section",
          label: "Title / Start",
          usedBy: "Used by Menu",
        },
      ],
    });
  });

  it("exports a layout an action opens as a link, unless the pack carries it", () => {
    const state = createInitialState();
    const resourceDataByType = createResourceDataByType();
    resourceDataByType.layouts = {
      items: {
        "title-folder": { type: "folder", name: "Title" },
        "menu-folder": { type: "folder", name: "Menus" },
        title: {
          type: "layout",
          name: "Title",
          layoutType: "general",
          elements: {
            items: {
              options: {
                click: {
                  payload: { actions: { pushOverlay: { resourceId: "menu" } } },
                },
              },
            },
          },
        },
        menu: {
          type: "layout",
          name: "Menu Page",
          layoutType: "general",
          elements: { items: { background: { imageId: "image-1" } } },
        },
      },
      tree: [
        { id: "title-folder", children: [{ id: "title" }] },
        { id: "menu-folder", children: [{ id: "menu" }] },
      ],
    };
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData({ state }, { resourceDataByType });
    state.selectedFolderIdsByType.layouts = ["title-folder"];

    // Title opens Menu Page, which the pack does not carry, nor what it uses.
    let contents = selectAssetPackageData({ state });
    expect(
      contents.repository.layouts.items.title.elements.items.options.click
        .payload.actions.pushOverlay,
    ).toEqual({ resourceId: "link.menu" });
    expect(contents.dependencies).toEqual({});
    expect(contents.links.items).toEqual({
      "link.menu": { kind: "layout", name: "Menu Page", layoutType: "general" },
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).comesWith.links.items,
    ).toMatchObject([
      { icon: "layout", label: "Menu Page", usedBy: "Used by Title" },
    ]);

    // Picked too, Menu Page is opened as itself.
    state.selectedFolderIdsByType.layouts = ["title-folder", "menu-folder"];
    contents = selectAssetPackageData({ state });
    expect(
      contents.repository.layouts.items.title.elements.items.options.click
        .payload.actions.pushOverlay,
    ).toEqual({ resourceId: "menu" });
    expect(contents.links.items).toEqual({});
  });

  it("rejects a jump to a line of the story", () => {
    const state = createInitialState();
    const resourceDataByType = createResourceDataByType();
    resourceDataByType.layouts = {
      items: {
        "layout-folder": { type: "folder", name: "Layouts" },
        "layout-1": {
          type: "layout",
          name: "Dialogue",
          interaction: { jump: { lineId: "line-1" } },
        },
      },
      tree: [{ id: "layout-folder", children: [{ id: "layout-1" }] }],
    };
    setResourceData({ state }, { resourceDataByType });
    state.selectedFolderIdsByType.layouts = ["layout-folder"];

    expect(() => selectAssetPackageData({ state })).toThrow(
      "Resource 'layout-1' contains unsupported project reference 'lineId'.",
    );
    expect(
      selectViewData({ state, i18n: EN_I18N }).comesWith.invalidMessage,
    ).toBe(
      "“Dialogue” in Layouts jumps to a line of the story, so this selection can't be exported.",
    );
  });

  it("creates a manifest accepted by the multi-resource asset importer", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    state.selectedFolderIdsByType.images = ["folder-3", "folder-1"];
    state.selectedFolderIdsByType.sounds = ["sound-folder"];
    state.selectedFolderIdsByType.videos = ["video-folder"];
    const manifest = createAssetPackageManifest(
      selectAssetPackageData({ state }),
    );
    expect(manifest.schema).toBe("routevn.import-pack.v2");
    expect(manifest.package).toEqual({
      kind: "routevn.creator.asset-package",
    });
    // Nothing the picks use is left out, so there is no dependencies section.
    expect(manifest).not.toHaveProperty("dependencies");
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/asset-package/asset-package.json",
      projectId: "project-1",
      repositoryState: createResourceDataByType(),
      createId: () => `generated-${++id}`,
      resolveFileUrl: ({ descriptor, manifestUrl }) =>
        new URL(descriptor.source.url, manifestUrl).href,
    });

    expect(plan.resources).toMatchObject([
      { type: "image", name: "Hero", resourceType: "images" },
      { type: "image", name: "City", resourceType: "images" },
      { type: "sound", name: "Theme", resourceType: "sounds" },
      { type: "video", name: "Intro", resourceType: "videos" },
    ]);
    expect(plan.files).toHaveLength(5);
  });
  it("round-trips: every reference an import commits points to something it commits", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    // Saved characters never keep an empty name variable; the project model
    // removes it.
    const resourceDataByType = createResourceDataByType();
    delete resourceDataByType.characters.items["character-1"].nameVariableId;
    setResourceData({ state }, { resourceDataByType });
    state.selectedFolderIdsByType.images = ["folder-1"];
    state.selectedFolderIdsByType.characters = ["character-folder"];
    state.selectedFolderIdsByType.textStyles = ["text-style-folder"];
    state.selectedFolderIdsByType.audioEffects = ["audio-effect-folder"];
    const manifest = createAssetPackageManifest(
      selectAssetPackageData({ state }),
    );
    expect(Object.keys(manifest.dependencies)).toEqual(["colors", "fonts"]);
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/asset-package/asset-package.json",
      projectId: "project-1",
      repositoryState: createResourceDataByType(),
      createId: () => `generated-${++id}`,
      dependencyFolderName: "Pack",
    });

    const imported = [...plan.resources, ...plan.dependencies];
    const resourceIds = new Set(
      imported.map((resource) => resource.destinationId),
    );
    const fileIds = new Set(plan.files.map((file) => file.destinationId));
    const dangling = [];
    for (const resource of imported) {
      visitAssetPackageReferences(resource.data, ({ kind, value }) => {
        const known = kind === "file" ? fileIds : resourceIds;
        if (!known.has(value)) dangling.push(`${resource.name}: ${value}`);
      });
    }
    expect(dangling).toEqual([]);
    // Picks keep their own folders; dependencies sit in the pack's folders.
    expect(
      plan.resources.map((resource) => resource.resourceType),
    ).not.toContain("fonts");
    const folderIds = new Set(
      plan.entries
        .filter((entry) => entry.folder && entry.dependency)
        .map((entry) => entry.destinationId),
    );
    expect(
      plan.dependencies.every((resource) =>
        folderIds.has(resource.parentDestinationId),
      ),
    ).toBe(true);
  });
});
