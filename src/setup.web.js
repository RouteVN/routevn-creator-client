import { createWebPatch } from "@rettangoli/fe";
import { h } from "snabbdom/build/h";

import { createWebRepositoryFactory } from "./deps/repository";
import { createUserConfig } from "./deps/userConfig";
import Subject from "./deps/subject";
import createRouteVnHttpClient from "./deps/createRouteVnHttpClient";
import Router from "./deps/router";
import AudioManager from "./deps/audioManager";
// File management imports
import { createWebFileManagerFactory } from "./deps/fileManagerFactory";
import { createWebStorageAdapterFactory } from "./deps/storageAdapterFactory";
import { createFontManager } from "./deps/fontManager";
import { create2dRenderer } from "./deps/2drenderer";
import { createFilePicker } from "./deps/filePicker";
import { createIndexeddbRepositoryAdapter } from "./deps/webRepositoryAdapter";
import { initializeWebProject } from "./deps/webProjectInitializer";

// Web-specific configuration
const httpClient = createRouteVnHttpClient({
  baseUrl: "http://localhost:8788",
  headers: {
    "X-Platform": "web",
  },
});

// Create font manager (shared for the single web project)
const fontManager = createFontManager();

// Create storage adapter factory for web
const storageAdapterFactory = createWebStorageAdapterFactory();

// Create file manager factory for web
const fileManagerFactory = createWebFileManagerFactory(
  fontManager,
  storageAdapterFactory,
);

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

// Initialize template data for first-time users (necessary startup initialization)
await initializeWebProject({
  repositoryFactory,
  storageAdapterFactory,
  template: "default",
});

const userConfig = createUserConfig();
const subject = new Subject();
const router = new Router();
const audioManager = new AudioManager();
const filePicker = createFilePicker();

// Initialize async resources first
const drenderer = await create2dRenderer({ subject });

const globalUIElement = document.querySelector("rtgl-global-ui");

const globalUI = createGlobalUI(globalUIElement);

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
  globalUI,
  // Platform-specific info
  platform: "web",
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
  globalUI,
  // Platform-specific info
  platform: "web",
};

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
};

const patch = createWebPatch();

export { h, patch, deps };
