import { describe, expect, it } from "vitest";
import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../src/internal/assetPackageResources.js";
import { createAssetImportPlan } from "../../src/internal/assetImportPlan.js";
import {
  closeResourceTypeContextMenu,
  closeResourceFolderPicker,
  confirmResourceFolderSelection,
  createInitialState,
  moveResourceType,
  openResourceFolderPicker,
  openResourceTypeContextMenu,
  selectAssetPackage,
  selectAssetPackageData,
  selectPackageMetadata,
  selectViewData,
  setFilesData,
  setPackageMetadata,
  setAssetPackage,
  setResourceData,
  setUiConfig,
  toggleResourceFolderSelection,
} from "../../src/pages/assetPackage/assetPackage.store.js";
import { createAssetPackageManifest } from "../../src/pages/assetPackage/support/assetPackageManifest.js";
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

const PACKAGE_METADATA = {
  id: "example.asset-package",
  name: "Example Asset Package",
  version: "1.0.0",
  description: "Example resources.",
};

const createResourceDataByType = () => {
  const resourceDataByType = Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_CONFIGS.map(({ resourceType }) => [
      resourceType,
      { items: {}, tree: [] },
    ]),
  );
  resourceDataByType.images = IMAGES_DATA;
  resourceDataByType.sounds = SOUNDS_DATA;
  resourceDataByType.videos = VIDEOS_DATA;
  resourceDataByType.characters = CHARACTERS_DATA;
  resourceDataByType.colors = COLORS_DATA;
  resourceDataByType.fonts = FONTS_DATA;
  resourceDataByType.textStyles = TEXT_STYLES_DATA;
  return resourceDataByType;
};

describe("asset package store", () => {
  it("offers only resource types with folders and uses the compact touch shell", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData).toMatchObject({
      resourceCategory: "releases",
      selectedResourceId: "assetPackage",
      showExplorerPanel: true,
      contentLeftPadding: "sm",
    });
    expect(viewData.resourceTypeMenuItems).toEqual([]);

    openResourceFolderPicker(
      { state },
      { resourceType: "sounds", x: 20, y: 60 },
    );
    expect(state.folderPicker).toMatchObject({
      resourceType: undefined,
      isOpen: false,
    });

    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    expect(
      selectViewData({ state, i18n: EN_I18N }).resourceTypeMenuItems,
    ).toEqual([
      { label: "Images", type: "item", value: "images" },
      { label: "Sounds", type: "item", value: "sounds" },
      { label: "Videos", type: "item", value: "videos" },
      { label: "Characters", type: "item", value: "characters" },
      { label: "Colors", type: "item", value: "colors" },
      { label: "Fonts", type: "item", value: "fonts" },
      { label: "Text Styles", type: "item", value: "textStyles" },
    ]);

    setUiConfig({ state }, { uiConfig: { id: "touch" } });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isTouchMode: true,
      showExplorerPanel: false,
      contentLeftPadding: "0",
    });
  });

  it("orders folder selection and renders a generic resource section", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    openResourceFolderPicker(
      { state },
      { resourceType: "images", x: 20, y: 60 },
    );

    toggleResourceFolderSelection({ state }, { folderId: "folder-2" });
    expect(state.folderPicker.draftSelectedFolderIds).toEqual([]);
    toggleResourceFolderSelection({ state }, { folderId: "folder-3" });
    toggleResourceFolderSelection({ state }, { folderId: "folder-1" });

    expect(selectViewData({ state, i18n: EN_I18N }).folderOptions).toEqual([
      expect.objectContaining({
        id: "folder-1",
        label: "Backgrounds",
        selectionOrder: 2,
        icon: "folder",
      }),
      expect.objectContaining({
        id: "folder-3",
        label: "Characters",
        selectionOrder: 1,
        icon: "folder",
      }),
    ]);

    confirmResourceFolderSelection({ state });
    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.selectedResourceSections).toEqual([
      {
        resourceType: "images",
        label: "Images",
        selectedFolders: [
          { id: "folder-3", label: "Characters" },
          { id: "folder-1", label: "Backgrounds" },
        ],
        editButtonLabel: "Select Images folders",
      },
    ]);
    expect(viewData.resourceTypeMenuItems).not.toContainEqual(
      expect.objectContaining({ value: "images" }),
    );

    openResourceFolderPicker(
      { state },
      { resourceType: "images", x: 20, y: 60 },
    );
    toggleResourceFolderSelection({ state }, { folderId: "folder-3" });
    closeResourceFolderPicker({ state });
    expect(state.selectedFolderIdsByType.images).toEqual([
      "folder-3",
      "folder-1",
    ]);
  });

  it("orders selected resource types and exposes valid move actions", () => {
    const state = createInitialState();
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    state.selectedFolderIdsByType.images = ["folder-1"];
    state.selectedFolderIdsByType.sounds = ["sound-folder"];
    state.selectedFolderIdsByType.videos = ["video-folder"];

    openResourceTypeContextMenu(
      { state },
      { resourceType: "images", x: 30, y: 40 },
    );
    expect(
      selectViewData({ state, i18n: EN_I18N }).resourceTypeContextMenu,
    ).toMatchObject({
      isOpen: true,
      x: 30,
      y: 40,
      resourceType: "images",
      items: [
        {
          label: "Move Down",
          type: "item",
          value: "move-down",
        },
      ],
    });

    moveResourceType({ state }, { resourceType: "images", offset: 1 });
    expect(
      selectViewData({ state, i18n: EN_I18N }).selectedResourceSections.map(
        ({ resourceType }) => resourceType,
      ),
    ).toEqual(["sounds", "images", "videos"]);
    expect(
      selectViewData({ state, i18n: EN_I18N }).resourceTypeContextMenu.items,
    ).toEqual([
      {
        label: "Move Up",
        type: "item",
        value: "move-up",
      },
      {
        label: "Move Down",
        type: "item",
        value: "move-down",
      },
    ]);
    expect(selectAssetPackage({ state })).toEqual({
      schemaVersion: 1,
      metadata: {
        id: "",
        name: "",
        version: "",
        description: "",
      },
      resources: [
        { resourceType: "sounds", folderIds: ["sound-folder"] },
        { resourceType: "images", folderIds: ["folder-1"] },
        { resourceType: "videos", folderIds: ["video-folder"] },
      ],
    });

    closeResourceTypeContextMenu({ state });
    expect(state.resourceTypeContextMenu.isOpen).toBe(false);

    state.selectedFolderIdsByType.sounds = [];
    state.selectedFolderIdsByType.videos = [];
    openResourceTypeContextMenu(
      { state },
      { resourceType: "images", x: 30, y: 40 },
    );
    expect(
      selectViewData({ state, i18n: EN_I18N }).resourceTypeContextMenu,
    ).toMatchObject({
      isOpen: false,
      items: [],
    });
  });

  it("hydrates the saved asset package and removes stale folder selections", () => {
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
              folderIds: ["folder-2", "folder-1"],
            },
          ],
        },
      },
    );

    expect(selectAssetPackage({ state })).toEqual({
      schemaVersion: 1,
      metadata: {
        id: "",
        name: "",
        version: "",
        description: "",
      },
      resources: [
        { resourceType: "videos", folderIds: ["video-folder"] },
        { resourceType: "images", folderIds: ["folder-1"] },
      ],
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).selectedResourceSections.map(
        ({ resourceType }) => resourceType,
      ),
    ).toEqual(["videos", "images"]);
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
    moveResourceType({ state }, { resourceType: "characters", offset: -1 });

    const repository = selectAssetPackageData({ state });

    expect(Object.keys(repository)).toEqual(["files", "characters", "images"]);

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

  it("includes transitive resources required by selected folders", () => {
    const state = createInitialState();
    setFilesData({ state }, { filesData: FILES_DATA });
    setResourceData(
      { state },
      { resourceDataByType: createResourceDataByType() },
    );
    state.selectedFolderIdsByType.textStyles = ["text-style-folder"];

    const repository = selectAssetPackageData({ state });

    expect(repository.textStyles.items).toHaveProperty("text-style-1");
    expect(repository.fonts.items).toHaveProperty("font-1");
    expect(repository.fonts.items).toHaveProperty("font-folder");
    expect(repository.colors.items).toHaveProperty("color-1");
    expect(repository.colors.items).toHaveProperty("color-folder");
    expect(repository.files.items).toHaveProperty("file-font-1");
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
    setPackageMetadata({ state }, { packageMetadata: PACKAGE_METADATA });
    const manifest = createAssetPackageManifest({
      repository: selectAssetPackageData({ state }),
      packageMetadata: selectPackageMetadata({ state }),
    });
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/asset-package/package.json",
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
});
