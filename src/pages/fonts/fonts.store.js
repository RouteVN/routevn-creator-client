import { toFlatGroups, toFlatItems } from "#v2-tree-helpers";
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
      type: "image",
    },
    {
      name: "fileId",
      type: "font",
      previewText: "Aa",
      fontFamily: "${fileId.fontFamily}",
    },
    { name: "name", type: "popover-input", label: "Name" },
    {
      name: "fontFamily",
      type: "read-only-text",
      label: "Font Family",
      content: "${fontFamily}",
    },
    {
      name: "fileType",
      type: "read-only-text",
      label: "File Type",
      content: "${fileType}",
    },
    {
      name: "fileSize",
      type: "read-only-text",
      label: "File Size",
      content: "${fileSize}",
    },
  ],
};

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
    // NOTE: The following fields are commented out because the current implementation
    // does not accurately extract this information from font files
    // {
    //   name: "weightClass",
    //   type: "read-only-text",
    //   description: "Weight Class",
    // },
    // {
    //   name: "isVariableFont",
    //   type: "read-only-text",
    //   description: "Variable Font",
    // },
    // {
    //   name: "supportsItalics",
    //   type: "read-only-text",
    //   description: "Italic Support",
    // },
    // {
    //   name: "glyphCount",
    //   type: "read-only-text",
    //   description: "Glyph Count",
    // },
    // {
    //   name: "languageSupport",
    //   type: "read-only-text",
    //   description: "Languages",
    // },
  ],
};

export const createInitialState = () => ({
  fontsData: { tree: [], items: {} },
  selectedItemId: null,
  context: {
    fileId: {
      fontFamily: "",
    },
  },
  isModalOpen: false,
  selectedFontInfo: null,
  searchQuery: "",
  collapsedIds: [],
});

export const setItems = ({ state }, { fontsData } = {}) => {
  state.fontsData = fontsData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.fontsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const setContext = ({ state }, { context } = {}) => {
  state.context = context;
};

export const setModalOpen = ({ state }, { isOpen } = {}) => {
  state.isModalOpen = isOpen;
};

export const setSelectedFontInfo = ({ state }, { fontInfo } = {}) => {
  state.selectedFontInfo = fontInfo;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const toggleGroupCollapse = ({ state }, { groupId } = {}) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const getGlyphList = (_context = {}, _payload = {}) => {
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

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.fontsData);
  const rawFlatGroups = toFlatGroups(state.fontsData);
  const searchQuery = state.searchQuery.toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  // Apply collapsed state and search filtering to flatGroups
  const flatGroups = rawFlatGroups
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        isCollapsed: state.collapsedIds.includes(group.id),
        children: state.collapsedIds.includes(group.id)
          ? []
          : filteredChildren.map((item) => ({
              ...item,
              fontFamily: item.fontFamily || "sans-serif",
              previewText: "Aa",
              selectedStyle:
                item.id === state.selectedItemId
                  ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
                  : "",
            })),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  let formContext = {
    ...state.context,
    fileId: {
      ...state.context?.fileId,
      fontFamily: state.context?.fileId?.fontFamily || "",
    },
    fontFamily: "",
    fileType: "",
    fileSize: "",
  };
  if (selectedItem) {
    // Generate font preview image for the main form
    const previewImage = fontToBase64Image(selectedItem.fontFamily, "Aa");

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

    const fontFamily = selectedItem.fontFamily || "";
    const fileType =
      selectedItem.fileType || getFileTypeFromName(selectedItem.name);
    const fileSize = selectedItem.fileSize
      ? formatFileSize(selectedItem.fileSize)
      : "";

    defaultValues = {
      fontPreview: previewImage || null,
      name: selectedItem.name,
      fontFamily,
      fileType,
      fileSize,
    };

    formContext = {
      ...state.context,
      fileId: {
        ...state.context?.fileId,
        fontFamily,
      },
      fontFamily,
      fileType,
      fileSize,
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
    title: "Fonts",
    form,
    defaultValues,
    context: formContext,
    isModalOpen: state.isModalOpen,
    selectedFontInfo: state.selectedFontInfo,
    glyphList: state.selectedFontInfo?.glyphs || getGlyphList(),
    fontInfoForm,
    fontInfoValues,
    searchQuery: state.searchQuery,
    collapsedIds: state.collapsedIds,
    uploadText: "Upload Font",
    acceptedFileTypes: [".ttf", ".otf", ".woff", ".woff2", ".ttc", ".eot"],
    resourceType: "fonts",
  };

  return viewData;
};
