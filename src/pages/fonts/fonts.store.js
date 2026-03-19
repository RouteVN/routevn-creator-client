import { formatFontFileTypeLabel } from "../../internal/fileTypes.js";
import { formatFileSize } from "../../internal/files.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";

const fontInfoForm = {
  title: "Font Details",
  fields: [
    {
      name: "fontFamily",
      type: "read-only-text",
      label: "Font Family",
      content: "${fontFamily}",
    },
    {
      name: "fileName",
      type: "read-only-text",
      label: "File Name",
      content: "${fileName}",
    },
    {
      name: "fileSize",
      type: "read-only-text",
      label: "File Size",
      content: "${fileSize}",
    },
    {
      name: "format",
      type: "read-only-text",
      label: "Format",
      content: "${format}",
    },
  ],
};

const getGlyphList = () => {
  const glyphs = [];

  const addGlyph = (char) => {
    const code = char.charCodeAt(0);
    const unicode = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    glyphs.push({ char, unicode });
  };

  for (let i = 65; i <= 90; i++) {
    addGlyph(String.fromCharCode(i));
  }
  for (let i = 97; i <= 122; i++) {
    addGlyph(String.fromCharCode(i));
  }
  for (let i = 48; i <= 57; i++) {
    addGlyph(String.fromCharCode(i));
  }

  const punctuation = " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
  for (const char of punctuation) {
    addGlyph(char);
  }

  const extendedLatin =
    "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ";
  for (const char of extendedLatin) {
    addGlyph(char);
  }

  return glyphs;
};

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "font-preview",
      label: "",
    },
    {
      type: "text",
      label: "Font Family",
      value: item.fontFamily ?? "",
    },
    {
      type: "text",
      label: "File Type",
      value: formatFontFileTypeLabel({
        fileType: item.fileType,
        fileName: item.name ?? "",
      }),
    },
    {
      type: "text",
      label: "File Size",
      value: item.fileSize ? formatFileSize(item.fileSize) : "",
    },
  ];
};

const buildMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "font",
  fontFamily: item.fontFamily ?? "sans-serif",
  previewText: "Aa",
  fontFileId: item.fileId,
});

const {
  createInitialState: createMediaInitialState,
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  selectViewData: selectMediaViewData,
} = createMediaPageStore({
  itemType: "font",
  resourceType: "fonts",
  title: "Fonts",
  selectedResourceId: "fonts",
  resourceCategory: "userInterface",
  uploadText: "Upload Font",
  acceptedFileTypes: [".ttf", ".otf", ".woff", ".woff2", ".ttc", ".eot"],
  centerItemContextMenuItems: [
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  buildDetailFields,
  buildMediaItem,
  getSelectedPreviewFileId: (item) => item?.fileId,
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const selectedFontInfo = state.selectedFontInfo;

    return {
      ...baseViewData,
      isModalOpen: state.isModalOpen,
      selectedFontInfo,
      selectedFontFamily: selectedItem?.fontFamily ?? "",
      fontInfoForm,
      fontInfoValues: selectedFontInfo
        ? {
            fontFamily: selectedFontInfo.fontFamily ?? "",
            fileName: selectedFontInfo.fileName ?? "",
            fileSize: selectedFontInfo.fileSize ?? "",
            format: selectedFontInfo.format ?? "Unknown",
            weightClass: selectedFontInfo.weightClass ?? "Unknown",
            isVariableFont: selectedFontInfo.isVariableFont ?? "Unknown",
            supportsItalics: selectedFontInfo.supportsItalics ?? "Unknown",
            glyphCount: selectedFontInfo.glyphCount?.toString() ?? "0",
            languageSupport: selectedFontInfo.languageSupport ?? "Unknown",
          }
        : {},
      glyphList: selectedFontInfo?.glyphs ?? getGlyphList(),
    };
  },
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  isModalOpen: false,
  selectedFontInfo: undefined,
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectFontItemById = selectItemById;

export const setModalOpen = ({ state }, { isOpen } = {}) => {
  state.isModalOpen = isOpen;
};

export const setSelectedFontInfo = ({ state }, { fontInfo } = {}) => {
  state.selectedFontInfo = fontInfo;
};

export const selectViewData = (context) => {
  return selectMediaViewData(context);
};
