import { createWebPatch } from "@rettangoli/fe";
import { h } from "snabbdom/build/h";

import { createRepository } from "./deps/repository";
import { createUserConfig } from "./deps/userConfig";
import Subject from "./deps/subject";
import createRouteVnHttpClient from "./deps/createRouteVnHttpClient";
import Router from "./deps/router";
import AudioManager from "./deps/audioManager";
// File management imports
import { createFileManager } from "./deps/fileManager";
import { createIndexedDBStorageAdapter } from "./deps/indexedDBStorageAdapter";
import { createLegacyUploaders } from "./deps/fileUploaderCompat";
import { createFontManager } from "./deps/fontManager";
import { create2dRenderer } from "./deps/2drenderer";
import { createFilePicker } from "./deps/filePicker";
import { createTemplateProjectData } from "./utils/templateProjectData";

const httpClient = createRouteVnHttpClient({
  baseUrl: "http://localhost:8788",
  headers: {
    "X-Platform": "web",
  },
});

// Initialize async resources first
const drenderer = await create2dRenderer();

// Create font manager (needed by fileManager)
const fontManager = createFontManager();

// File management setup with new architecture
// TODO: Make this configurable via userConfig

// Use indexedDB for local storage. This can be configured to use other adapters like HTTP etc...
const storageAdapter = createIndexedDBStorageAdapter();

// Create the unified file manager
const fileManager = createFileManager({
  storageAdapter,
  fontManager,
});

// Create legacy uploaders for backward compatibility
// This ensures existing code continues to work without changes
const {
  uploadImageFiles,
  uploadAudioFiles,
  uploadVideoFiles,
  uploadFontFiles,
  downloadWaveformData,
  getFileContent,
  loadFontFile: loadFontFileFunc,
} = createLegacyUploaders({ fileManager, httpClient, fontManager });

// Fetch template images from static folder
async function fetchTemplateImages() {
  const templateImageUrls = [
    // Import all template images
    "/public/template/dialogue_box.png",
    "/public/template/choice_box.png",
    "/public/template/choice_box_activated.png",
  ];

  const fetchedImages = {};
  const imageItems = {};
  const imageTree = [];

  // Create the Template UI folder
  const folderId = "template-ui-folder";
  imageItems[folderId] = {
    type: "folder",
    name: "Template UI",
  };

  const folderChildren = [];

  for (const url of templateImageUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const fileName = url.split("/").pop();
        const file = new File([blob], fileName, { type: blob.type });

        // Upload to local storage and get fileId
        const results = await uploadImageFiles([file], "template-project");
        if (results && results.length > 0) {
          const result = results[0];
          const imageId = `template-${fileName.replace(/\./g, "-")}`;

          // Store the image ID for layout references
          fetchedImages[fileName] = imageId;

          // Create the image item for the repository
          imageItems[imageId] = {
            type: "image",
            fileId: result.fileId,
            name: fileName,
            fileType: file.type || "image/png",
            fileSize: file.size,
            width: result.dimensions?.width || 1920,
            height: result.dimensions?.height || 1080,
          };

          // Add to folder children
          folderChildren.push({ id: imageId });
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch template image ${url}:`, error);
    }
  }

  // Create the tree structure with folder
  imageTree.push({
    id: folderId,
    children: folderChildren,
  });

  return { fetchedImages, imageItems, imageTree };
}

// Fetch template fonts from static folder
async function fetchTemplateFonts() {
  const templateFontUrls = ["/public/template/sample_font.ttf"];

  const fetchedFonts = {};
  const fontItems = {};
  const fontTree = [];

  // Create the Template Fonts folder
  const folderId = "template-fonts-folder";
  fontItems[folderId] = {
    type: "folder",
    name: "Template Fonts",
  };

  const folderChildren = [];

  for (const url of templateFontUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const fileName = url.split("/").pop();
        const file = new File([blob], fileName, { type: "font/ttf" });

        // Upload to local storage and get fileId
        const results = await uploadFontFiles([file], "template-project");
        if (results && results.length > 0) {
          const result = results[0];
          const fontId = `font-sample`;

          // Store the file ID for layout references
          fetchedFonts[fileName] = result.fileId;

          // Create the font item for the repository
          fontItems[fontId] = {
            type: "font",
            fileId: result.fileId,
            name: "Sample Font",
            fontFamily: result.fontName || "SampleFont",
            fileType: "font/ttf",
            fileSize: file.size,
          };

          // Add to folder children
          folderChildren.push({ id: fontId });
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch template font ${url}:`, error);
    }
  }

  // Create the tree structure with folder only if we have fonts
  if (folderChildren.length > 0) {
    fontTree.push({
      id: folderId,
      children: folderChildren,
    });
  }

  // No longer needed - we use actionStream.length to check

  return { fetchedFonts, fontItems, fontTree };
}

// Empty initial data structure
const initialData = {
  project: {
    name: "Project 1",
    description: "Project 1 description",
  },
  images: {
    items: {},
    tree: [],
  },
  animations: {
    items: {},
    tree: [],
  },
  audio: {
    items: {},
    tree: [],
  },
  videos: {
    items: {},
    tree: [],
  },
  characters: {
    items: {},
    tree: [],
  },
  fonts: {
    items: {},
    tree: [],
  },
  placements: {
    items: {},
    tree: [],
  },
  colors: {
    items: {},
    tree: [],
  },
  typography: {
    items: {},
    tree: [],
  },
  variables: {
    items: {},
    tree: [],
  },
  components: {
    items: {},
    tree: [],
  },
  layouts: {
    items: {},
    tree: [],
  },
  preset: {
    items: {},
    tree: [],
  },
  scenes: {
    items: {},
    tree: [],
  },
};

const localStorageKey = "repositoryEventStream";

const repository = createRepository(initialData, localStorageKey);

// Check if we need to add template data
const actionStream = repository.getActionStream();

if (actionStream.length === 0) {
  // First time - action stream is empty, add template data
  console.log("First time user - adding template data to repository...");

  // Fetch and upload template resources
  const templateImagesData = await fetchTemplateImages();
  const templateFontsData = await fetchTemplateFonts();

  // Create template data structure
  const templateData = createTemplateProjectData(
    templateImagesData.fetchedImages,
    templateFontsData.fetchedFonts,
  );

  // Prepare the complete initialization data
  const initData = {
    images: {
      items: templateImagesData.imageItems,
      tree: templateImagesData.imageTree,
    },
    fonts: {
      items: { ...templateFontsData.fontItems, ...templateData.fonts.items },
      tree: [...templateFontsData.fontTree, ...templateData.fonts.tree],
    },
    animations: templateData.animations,
    placements: templateData.placements,
    colors: templateData.colors,
    typography: templateData.typography,
    layouts: templateData.layouts,
  };

  // Use the new init action to set all template data at once
  repository.addAction({
    actionType: "init",
    target: null,
    value: initData,
  });

  // Immediately save to localStorage using flush method
  repository.flush();
  console.log("Template data added to repository and saved to localStorage");
}
const userConfig = createUserConfig();

const subject = new Subject();
const router = new Router();
const audioManager = new AudioManager();
const filePicker = createFilePicker();

const componentDependencies = {
  httpClient,
  subject,
  router,
  repository,
  userConfig,
  audioManager,
  uploadImageFiles,
  uploadAudioFiles,
  uploadVideoFiles,
  uploadFontFiles,
  fontManager,
  loadFontFile: loadFontFileFunc,
  downloadWaveformData,
  drenderer,
  filePicker,
  getFileContent,
  // Also include the new fileManager for components that want to use it
  fileManager,
};

const pageDependencies = {
  httpClient,
  subject,
  router,
  repository,
  userConfig,
  audioManager,
  uploadImageFiles,
  uploadAudioFiles,
  uploadVideoFiles,
  uploadFontFiles,
  fontManager,
  loadFontFile: loadFontFileFunc,
  downloadWaveformData,
  drenderer,
  filePicker,
  getFileContent,
  // Also include the new fileManager for pages that want to use it
  fileManager,
};

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
};

const patch = createWebPatch();

export { h, patch, deps };
