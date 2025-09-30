import { createWebPatch } from "@rettangoli/fe";
import { h } from "snabbdom/build/h";

import { createUserConfig } from "./deps/userConfig";
import Subject from "./deps/subject";
import createRouteVnHttpClient from "./deps/createRouteVnHttpClient";
import Router from "./deps/router";
import AudioManager from "./deps/audioManager";
import { createGlobalUI } from "https://cdn.jsdelivr.net/npm/@rettangoli/ui@0.1.2-rc35/+esm";
// File management imports
import { createFileManagerFactory } from "./deps/fileManagerFactory";
import { createStorageAdapterFactory } from "./deps/storageAdapterFactory";
import { createFontManager } from "./deps/fontManager";
import { create2dRenderer } from "./deps/2drenderer";
import { createFilePicker } from "./deps/filePicker";
import { createKeyValueStore } from "./deps/keyValueStore";
import { createTauriDialog } from "./deps/tauriDialog";
import { initializeProject } from "./deps/tauriRepositoryAdapter";
import { createRepositoryFactory } from "./deps/repository";
import { createProjectsService } from "./deps/projectsService";
import createUpdater from "./deps/tauriUpdater";
import { createBundleService } from "./deps/bundleService";
import { getVersion } from "@tauri-apps/api/app";

// Tauri-specific configuration
const httpClient = createRouteVnHttpClient({
  baseUrl: "http://localhost:8788",
  headers: {
    "X-Platform": "tauri",
  },
});

// Create font manager (shared across all projects)
const fontManager = createFontManager();

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

// Initialize key-value store
const keyValueStore = await createKeyValueStore();

// Create storage adapter factory
const storageAdapterFactory = createStorageAdapterFactory(keyValueStore);

// Create factories for multi-project support
const repositoryFactory = createRepositoryFactory(initialData, keyValueStore);
const fileManagerFactory = createFileManagerFactory(
  fontManager,
  storageAdapterFactory,
);

const userConfig = createUserConfig();
const subject = new Subject();
const router = new Router();
const audioManager = new AudioManager();
const filePicker = createFilePicker();
const tauriDialog = createTauriDialog();

// Create projects service
const projectsService = createProjectsService({
  keyValueStore,
  repositoryFactory,
});

// Initialize async resources first
const drenderer = await create2dRenderer({ subject });

// Get app version
const appVersion = await getVersion();

// Create bundle service
const bundleService = createBundleService();

const globalUIElement = document.querySelector("rtgl-global-ui");

const globalUI = createGlobalUI(globalUIElement);

const updaterService = createUpdater(globalUI);

const componentDependencies = {
  httpClient,
  subject,
  router,
  repositoryFactory,
  fileManagerFactory,
  userConfig,
  audioManager,
  fontManager,
  drenderer,
  filePicker,
  keyValueStore,
  tauriDialog,
  initializeProject,
  projectsService,
  updaterService,
  globalUI,
  appVersion: `v${appVersion}`,
  platform: "tauri",
};

const pageDependencies = {
  httpClient,
  subject,
  router,
  repositoryFactory,
  fileManagerFactory,
  userConfig,
  audioManager,
  fontManager,
  drenderer,
  filePicker,
  keyValueStore,
  tauriDialog,
  initializeProject,
  projectsService,
  updaterService,
  bundleService,
  globalUI,
  appVersion: `v${appVersion}`,
  platform: "tauri",
};

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
};

const patch = createWebPatch();

export { h, patch, deps };
