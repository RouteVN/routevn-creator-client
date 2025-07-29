import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const fontToBase64Image = (fontFamily, text = "Aa") => {
  if (!fontFamily) return "";

  // Create a canvas element
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Set canvas size
  canvas.width = 200;
  canvas.height = 100;

  // Use dark mode colors as default
  const backgroundColor = "#1a1a1a"; // Dark background
  const foregroundColor = "#ffffff"; // Light text

  // Fill with background color
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, 200, 100);

  // Set font and draw text
  ctx.fillStyle = foregroundColor;
  ctx.font = `48px "${fontFamily}", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 100, 50);

  // Convert to base64
  return canvas.toDataURL("image/png");
};

const form = {
  fields: [
    {
      name: "fontPreview",
      inputType: "image",
    },
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
  let formWithPreview = { ...form };

  if (selectedItem) {
    // Generate font preview image for the main form
    const previewImage = fontToBase64Image(selectedItem.fontFamily, "Aa");

    // Update the form with the preview image
    formWithPreview.fields = form.fields.map((field) => {
      if (field.name === "fontPreview") {
        return { ...field, src: previewImage };
      }
      return field;
    });

    // Get file type from extension if browser MIME type is empty
    const getFileTypeFromName = (fileName) => {
      if (!fileName) return "";
      const extension = fileName.toLowerCase().split(".").pop();
      const extensionMap = {
        ttf: "font/ttf",
        otf: "font/otf",
        woff: "font/woff",
        woff2: "font/woff2",
        ttc: "font/ttc",
        eot: "font/eot",
      };
      return extensionMap[extension] || `font/${extension}`;
    };

    defaultValues = {
      name: selectedItem.name,
      fontFamily: selectedItem.fontFamily || "",
      fileType: selectedItem.fileType || getFileTypeFromName(selectedItem.name),
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
      fileSize: state.selectedFontInfo.fileSize || "",
      format: state.selectedFontInfo.format || "Unknown",
      weightClass: state.selectedFontInfo.weightClass || "Unknown",
      isVariableFont: state.selectedFontInfo.isVariableFont || "Unknown",
      supportsItalics: state.selectedFontInfo.supportsItalics || "Unknown",
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
    form: formWithPreview,
    defaultValues,
    fieldResources: state.fieldResources,
    isModalOpen: state.isModalOpen,
    selectedFontInfo: state.selectedFontInfo,
    glyphList: state.selectedFontInfo?.glyphs || getGlyphList(),
    fontInfoForm,
    fontInfoValues,
  };

  return viewData;
};
