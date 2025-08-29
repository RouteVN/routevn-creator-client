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

// Web-specific configuration
const httpClient = createRouteVnHttpClient({
  baseUrl: "http://localhost:8788",
  headers: {
    "X-Platform": "web",
  },
});

// Create font manager (needed by fileManager)
const fontManager = createFontManager();

// File management setup with indexedDB storage for web
const storageAdapter = createIndexedDBStorageAdapter();

// Create the unified file manager
const fileManager = createFileManager({
  storageAdapter,
  fontManager,
});

// Create legacy uploaders for backward compatibility
const {
  uploadImageFiles,
  uploadAudioFiles,
  uploadVideoFiles,
  uploadFontFiles,
  downloadWaveformData,
  getFileContent,
  loadFontFile: loadFontFileFunc,
} = createLegacyUploaders({ fileManager, httpClient, fontManager });

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
  transforms: {
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

const createIndexeddbRepositoryAdapter = () => {
  const DB_NAME = "RouteVNRepository";
  const STORE_NAME = "actionStream";
  let db = null;

  const openDB = async () => {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { autoIncrement: true });
        }
      };
    });
  };

  return {
    async addAction(action) {
      const database = await openDB();
      const transaction = database.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.add(action);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    async getAllEvents() {
      const database = await openDB();
      const transaction = database.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },

    async saveAllActions(actions) {
      const database = await openDB();
      const transaction = database.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      // Clear and re-add all actions
      await new Promise((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      });

      for (const action of actions) {
        await new Promise((resolve, reject) => {
          const request = store.add(action);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    },
  };
};

const repositoryAdapter = createIndexeddbRepositoryAdapter();
const repository = createRepository(initialData, repositoryAdapter);

// Initialize repository with stored data
await repository.init();

// Fetch template images from static folder
async function fetchTemplateImages() {
  const templateImageUrls = [
    "/public/template/dialogue_box.png",
    "/public/template/choice_box.png",
    "/public/template/choice_box_activated.png",
  ];

  const fetchedImages = {};
  const imageItems = {};
  const imageTree = [];

  // Create the Template Images folder
  const folderId = "template-images-folder";
  imageItems[folderId] = {
    type: "folder",
    name: "Template Images",
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
          const imageId = `image-${fileName.replace(".png", "")}`;

          // Store the file ID for layout references
          fetchedImages[fileName] = result.fileId;

          // Create the image item for the repository
          imageItems[imageId] = {
            type: "image",
            fileId: result.fileId,
            name: fileName.replace(".png", "").replace(/_/g, " "),
            src: result.downloadUrl,
            width: result.dimensions?.width || 100,
            height: result.dimensions?.height || 100,
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

  return { fetchedFonts, fontItems, fontTree };
}

// Check if we need to add template data
const actionStream = repository.getActionStream();

if (actionStream.length === 0) {
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
    transforms: templateData.transforms,
    colors: templateData.colors,
    typography: templateData.typography,
    layouts: templateData.layouts,
    scenes: templateData.scenes,
    audio: templateData.audio,
    videos: templateData.videos,
    characters: templateData.characters,
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

// Initialize async resources first
const drenderer = await create2dRenderer({ subject });

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
  fileManager,
  // Platform-specific info
  platform: "web",
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
  fileManager,
  // Platform-specific info
  platform: "web",
};

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
};

const patch = createWebPatch();

export { h, patch, deps };
