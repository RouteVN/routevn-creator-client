import { createWebPatch } from "@rettangoli/fe";
import { h } from "snabbdom/build/h";

import { createRepository } from "./deps/repository";
import { createUserConfig } from "./deps/userConfig";
import Subject from "./deps/subject";
import createRouteVnHttpClient from "./deps/createRouteVnHttpClient";
import Router from "./deps/router";
import AudioManager from "./deps/audioManager";
import {
  createImageFileUploader,
  createAudioFileUploader,
  createVideoFileUploader,
  createFontFileUploader,
  downloadWaveformData,
} from "./deps/createFileUploader";
import { createFontManager, loadFontFile } from "./deps/fontManager";
import { create2dRenderer } from "./deps/2drenderer";
import { createFilePicker } from "./deps/filePicker";

const httpClient = createRouteVnHttpClient({
  baseUrl: "http://localhost:8788",
  headers: {
    "X-Platform": "web",
  },
});

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

const repository = createRepository(initialData, "repositoryEventStream");
const userConfig = createUserConfig();

const subject = new Subject();
const router = new Router();
const audioManager = new AudioManager();
const drenderer = await create2dRenderer();
const uploadImageFiles = createImageFileUploader({
  httpClient,
});
const uploadAudioFiles = createAudioFileUploader({
  httpClient,
});
const uploadVideoFiles = createVideoFileUploader({
  httpClient,
});
const fontManager = createFontManager();
const uploadFontFiles = createFontFileUploader({
  httpClient,
  fontManager,
});
const loadFontFileFunc = loadFontFile({ httpClient, fontManager });
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
};

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
};

const patch = createWebPatch();

export { h, patch, deps };
