import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  title: "Font Information",
  fields: [
    {
      name: "fileId",
      inputType: "font",
      previewText: "Aa",
    },
    { name: "name", inputType: "popover-input", description: "Name" },
    {
      name: "fontFamily",
      inputType: "read-only-text",
      description: "Font Family",
    },
    { name: "fileType", inputType: "read-only-text", description: "File Type" },
    {
      name: "fileSize",
      inputType: "read-only-text",
      description: "File Size",
    },
  ],
};

const fontInfoForm = {
  title: "Font Details",
  fields: [
    {
      name: "fontFamily",
      inputType: "read-only-text",
      description: "Font Family",
    },
    {
      name: "fileName",
      inputType: "read-only-text",
      description: "File Name",
    },
    {
      name: "fileSize",
      inputType: "read-only-text",
      description: "File Size",
    },
    {
      name: "format",
      inputType: "read-only-text",
      description: "Format",
    },
    {
      name: "weightClass",
      inputType: "read-only-text",
      description: "Weight Class",
    },
    {
      name: "isVariableFont",
      inputType: "read-only-text",
      description: "Variable Font",
    },
    {
      name: "supportsItalics",
      inputType: "read-only-text",
      description: "Italic Support",
    },
    {
      name: "glyphCount",
      inputType: "read-only-text",
      description: "Glyph Count",
    },
    {
      name: "languageSupport",
      inputType: "read-only-text",
      description: "Languages",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  fontsData: { tree: [], items: {} },
  selectedItemId: null,
  fieldResources: {},
  isModalOpen: false,
  selectedFontInfo: null,
});

export const setItems = (state, fontsData) => {
  state.fontsData = fontsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.fontsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const setModalOpen = (state, isOpen) => {
  state.isModalOpen = isOpen;
};

export const setSelectedFontInfo = (state, fontInfo) => {
  state.selectedFontInfo = fontInfo;
};

export const getGlyphList = () => {
  const glyphs = [];

  const addGlyph = (char) => {
    const code = char.charCodeAt(0);
    const unicode = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    glyphs.push({ char, unicode });
  };

  // Basic Latin (A-Z, a-z, 0-9)
  for (let i = 65; i <= 90; i++) {
    addGlyph(String.fromCharCode(i));
  }
  for (let i = 97; i <= 122; i++) {
    addGlyph(String.fromCharCode(i));
  }
  for (let i = 48; i <= 57; i++) {
    addGlyph(String.fromCharCode(i));
  }

  // Common punctuation
  const punctuation = " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
  for (const char of punctuation) {
    addGlyph(char);
  }

  // Extended Latin characters (common accented characters)
  const extendedLatin =
    "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ";
  for (const char of extendedLatin) {
    addGlyph(char);
  }

  return glyphs;
};

export const getUnicodeValue = (char) => {
  if (!char) return "";
  const code = char.charCodeAt(0);
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.fontsData);
  const flatGroups = toFlatGroups(state.fontsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      fontFamily: selectedItem.fontFamily || "",
      fileType: selectedItem.fileType || "",
      fileSize: selectedItem.fileSize
        ? formatFileSize(selectedItem.fileSize)
        : "",
    };
  }

  // Font info form values
  let fontInfoValues = {};
  if (state.selectedFontInfo) {
    fontInfoValues = {
      fontFamily: state.selectedFontInfo.fontFamily || "",
      fileName: state.selectedFontInfo.fileName || "",
      fileSize: state.selectedFontInfo.fileSize
        ? formatFileSize(state.selectedFontInfo.fileSize)
        : "",
      format: state.selectedFontInfo.format || "Unknown",
      version: state.selectedFontInfo.version || "Unknown",
      designer: state.selectedFontInfo.designer || "Unknown",
      copyright: state.selectedFontInfo.copyright || "Unknown",
      weightClass: state.selectedFontInfo.weightClass || "Unknown",
      isVariableFont: state.selectedFontInfo.isVariableFont ? "Yes" : "No",
      supportsItalics: state.selectedFontInfo.supportsItalics ? "Yes" : "No",
      glyphCount: state.selectedFontInfo.glyphCount?.toString() || "0",
      languageSupport: state.selectedFontInfo.languageSupport || "Unknown",
    };
  }

  const viewData = {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "fonts",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "fonts",
    form,
    defaultValues,
    fieldResources: state.fieldResources,
    isModalOpen: state.isModalOpen,
    selectedFontInfo: state.selectedFontInfo,
    glyphList: state.selectedFontInfo?.glyphs || getGlyphList(),
    fontInfoForm,
    fontInfoValues,
  };

  console.log(
    "🎨 toViewData - isModalOpen:",
    state.isModalOpen,
    "selectedFontInfo:",
    state.selectedFontInfo,
  );

  return viewData;
};
