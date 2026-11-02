import { describe, expect, it } from "vitest";
import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../src/internal/assetPackageResources.js";
import { createAssetImportPlan } from "../../src/internal/assetImportPlan.js";
import * as assetPackageStore from "../../src/pages/assetPackage/assetPackage.store.js";
import {
  applyPicker,
  closePicker,
  createInitialState,
  openPicker,
  selectAssetPackage,
  selectAssetPackageData,
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
    // Types without resources are left out.
    expect(viewData.pickerTypes.map((type) => type.resourceType)).toEqual([
      "images",
      "sounds",
      "videos",
      "characters",
      "audioEffects",
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
    expect(viewData.pickerSection.folders).toMatchObject([
      {
        folderId: "folder-1",
        name: "Backgrounds",
        selected: false,
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
      },
      { folderId: "folder-3", name: "Characters" },
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
    // Only top-level folders can be picked.
    toggleFolder({ state }, { resourceType: "images", folderId: "folder-2" });
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
      ["folder-3", "1"],
    ]);
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
    ).toEqual(["folder-1", "folder-3"]);
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
      ["folder-3", false],
      ["folder-empty", true],
    ]);
    toggleFolder(
      { state },
      { resourceType: "images", folderId: "folder-empty", selected: false },
    );
    applyPicker({ state });
    expect(state.selectedFolderIdsByType.images).toEqual([]);
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
    expect(previewOf("audioEffects")).toMatchObject({
      kind: "icon",
      icon: "audioEffects",
    });
  });

  it("hydrates the saved asset package in its saved order and removes stale folder selections", () => {
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
              folderIds: ["folder-3", "folder-2", "folder-1"],
            },
            {
              resourceType: "layouts",
              folderIds: ["layout-folder"],
            },
          ],
        },
      },
    );

    expect(selectAssetPackage({ state })).toEqual({
      schemaVersion: 1,
      resources: [
        { resourceType: "images", folderIds: ["folder-3", "folder-1"] },
        { resourceType: "videos", folderIds: ["video-folder"] },
        { resourceType: "layouts", folderIds: ["layout-folder"] },
      ],
    });
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
    expect(
      createSavedAssetPackContents({ repositoryState, assetPackId: "pack-1" }),
    ).toEqual(selectAssetPackageData({ state }));
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
      repositoryRevision: 1,
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
      repositoryRevision: 1,
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
