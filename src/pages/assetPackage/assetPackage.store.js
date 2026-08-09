import { toFlatItems } from "../../internal/project/tree.js";
import { selectAssetPackagePageCopy } from "./support/assetPackagePageCopy.js";

const RESOURCE_SECTION_TYPES = ["images", "audio", "videos"];

const selectResourceTypeLabel = (type, copy = {}) => {
  if (type === "audio") {
    return copy.audioMenuItem ?? "Audio";
  }
  if (type === "videos") {
    return copy.videosMenuItem ?? "Videos";
  }
  return copy.imagesMenuItem ?? "Images";
};

const selectAddFolderTitle = (type, copy = {}) => {
  if (type === "audio") {
    return copy.addAudioFolderTitle ?? "Add Audio Folder";
  }
  if (type === "videos") {
    return copy.addVideosFolderTitle ?? "Add Videos Folder";
  }
  return copy.addImagesFolderTitle ?? "Add Images Folder";
};

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "assetPackage",
  repositoryTarget: "settings",
  isTouchMode: false,
  createPackageDialogOpen: false,
  resourceTypeMenu: {
    isOpen: false,
    x: 0,
    y: 0,
  },
  imagesData: {
    items: {},
    tree: [],
  },
  nextResourceSectionNumber: 1,
  resourceSections: [],
  folderNameDialog: {
    open: false,
    type: undefined,
    formKey: 0,
  },
  imageSelectorDialog: {
    open: false,
    sectionId: undefined,
    selectedImageId: undefined,
  },
});

export const openCreatePackageDialog = ({ state }, _payload = {}) => {
  state.createPackageDialogOpen = true;
};

export const closeCreatePackageDialog = ({ state }, _payload = {}) => {
  state.createPackageDialogOpen = false;
  state.resourceTypeMenu.isOpen = false;
  state.nextResourceSectionNumber = 1;
  state.resourceSections = [];
  state.folderNameDialog.open = false;
  state.folderNameDialog.type = undefined;
  state.imageSelectorDialog.open = false;
  state.imageSelectorDialog.sectionId = undefined;
  state.imageSelectorDialog.selectedImageId = undefined;
};

export const openResourceTypeMenu = ({ state }, { x, y } = {}) => {
  state.resourceTypeMenu.isOpen = true;
  state.resourceTypeMenu.x = x;
  state.resourceTypeMenu.y = y;
};

export const closeResourceTypeMenu = ({ state }, _payload = {}) => {
  state.resourceTypeMenu.isOpen = false;
};

export const openFolderNameDialog = ({ state }, { type } = {}) => {
  if (!RESOURCE_SECTION_TYPES.includes(type)) {
    return;
  }

  state.folderNameDialog.open = true;
  state.folderNameDialog.type = type;
  state.folderNameDialog.formKey += 1;
};

export const closeFolderNameDialog = ({ state }, _payload = {}) => {
  state.folderNameDialog.open = false;
  state.folderNameDialog.type = undefined;
};

export const selectFolderNameDialogType = ({ state }) => {
  return state.folderNameDialog.type;
};

export const addResourceSection = ({ state }, { type, name } = {}) => {
  const folderName = String(name ?? "").trim();
  if (!RESOURCE_SECTION_TYPES.includes(type) || !folderName) {
    return;
  }

  const sectionNumber = state.nextResourceSectionNumber;
  state.nextResourceSectionNumber += 1;
  state.resourceSections.push({
    id: `${type}-${sectionNumber}`,
    type,
    name: folderName,
    itemIds: [],
  });
};

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData ?? {
    items: {},
    tree: [],
  };
};

export const openImageSelectorDialog = ({ state }, { sectionId } = {}) => {
  const section = state.resourceSections.find((item) => item.id === sectionId);
  if (!section || section.type !== "images") {
    return;
  }

  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.sectionId = sectionId;
  state.imageSelectorDialog.selectedImageId = undefined;
};

export const closeImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog.open = false;
  state.imageSelectorDialog.sectionId = undefined;
  state.imageSelectorDialog.selectedImageId = undefined;
};

export const setImageSelectorSelectedImageId = (
  { state },
  { imageId } = {},
) => {
  state.imageSelectorDialog.selectedImageId = imageId;
};

export const addSelectedImage = ({ state }, { sectionId, imageId } = {}) => {
  const section = state.resourceSections.find((item) => item.id === sectionId);
  if (!section || !imageId || section.itemIds.includes(imageId)) {
    return;
  }

  section.itemIds.push(imageId);
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectAssetPackagePageCopy(i18n);
  const fileExplorerItems = toFlatItems(state.imagesData).filter(
    (item) => item.type === "folder",
  );
  const resourceSections = state.resourceSections.map((section) => ({
    ...section,
    typeLabel: selectResourceTypeLabel(section.type, copy),
    images: section.itemIds.map((imageId) => {
      const image = state.imagesData.items[imageId] ?? {};
      return {
        imageId,
        title: image.name ?? copy.imageFallbackTitle ?? "Image",
        description: image.description ?? "",
      };
    }),
  }));
  const createPackageForm = {
    title: copy.createPackageDialogTitle ?? "Create Asset Package",
    fields: [
      {
        type: "slot",
        slot: "resources",
      },
    ],
  };
  const folderNameForm = {
    title: selectAddFolderTitle(state.folderNameDialog.type, copy),
    fields: [
      {
        name: "name",
        type: "input-text",
        label: copy.folderNameLabel ?? "Folder Name",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: copy.addFolderButton ?? "Add Folder",
        },
      ],
    },
  };
  const resourceTypeMenuItems = [
    {
      label: copy.imagesMenuItem ?? "Images",
      type: "item",
      value: "images",
    },
    {
      label: copy.audioMenuItem ?? "Audio",
      type: "item",
      value: "audio",
    },
    {
      label: copy.videosMenuItem ?? "Videos",
      type: "item",
      value: "videos",
    },
  ];

  return {
    ...state,
    showExplorerPanel: !state.isTouchMode,
    contentPadding: state.isTouchMode ? "0" : "lg",
    contentBodyPadding: state.isTouchMode ? "md" : "0",
    contentBodyMarginTop: state.isTouchMode ? "0" : "lg",
    title: copy.title ?? "Asset Package",
    description:
      copy.description ??
      "This is a tool to create a package to be uploaded to the RouteVN Asset Library.",
    createPackageButton: copy.createPackageButton ?? "Create Package",
    createPackageForm,
    folderNameForm,
    folderNameDefaultValues: { name: "" },
    addResourceButtonLabel:
      copy.addResourceButtonLabel ?? "Add a resource type",
    addImageButtonLabel: copy.addImageButtonLabel ?? "Add image",
    resourceTypeMenuItems,
    fileExplorerItems,
    resourceSections,
    showImageSelectorFileExplorer: !state.isTouchMode,
    cancelButton: copy.cancelButton ?? "Cancel",
    selectImageButton: copy.selectImageButton ?? "Select Image",
  };
};
