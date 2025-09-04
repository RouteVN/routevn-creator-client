import { createWebPatch } from "@rettangoli/fe";
import { h } from "snabbdom/build/h";

import { createWebRepositoryFactory } from "./deps/repository";
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
import { createIndexeddbRepositoryAdapter } from "./deps/webRepositoryAdapter";
import { fetchTemplateImages, fetchTemplateFonts } from "./utils/templateSetup";

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

const repositoryAdapter = createIndexeddbRepositoryAdapter();
const repositoryFactory = createWebRepositoryFactory(
  initialData,
  repositoryAdapter,
);

// Get the single repository for web
const repository = await repositoryFactory.getByProject();

// Check if we need to add template data
const actionStream = repository.getAllEvents();

if (actionStream.length === 0) {
  console.log("First time user - adding template data to repository...");

  // Fetch and upload template resources
  const templateImagesData = await fetchTemplateImages(uploadImageFiles);
  const templateFontsData = await fetchTemplateFonts(uploadFontFiles);

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
  repositoryFactory,
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
  repositoryFactory,
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
