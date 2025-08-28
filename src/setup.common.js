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

// Common setup function that can be customized with platform-specific config
export async function setupCommon(platformConfig = {}) {
  // Use platform-specific config or defaults
  const httpClient = createRouteVnHttpClient({
    baseUrl: platformConfig.baseUrl || "http://localhost:8788",
    headers: {
      "X-Platform": platformConfig.platform || "web",
      ...(platformConfig.headers || {}),
    },
  });

  // Create font manager (needed by fileManager)
  const fontManager = createFontManager();

  // File management setup with new architecture
  // Use platform-specific storage adapter if provided, otherwise use indexedDB
  const storageAdapter =
    platformConfig.storageAdapter || createIndexedDBStorageAdapter();

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

          const results = await uploadImageFiles([file], "template-project");
          if (results && results.length > 0) {
            const result = results[0];
            const imageId = `template-${fileName.replace(/\./g, "-")}`;

            fetchedImages[fileName] = imageId;

            imageItems[imageId] = {
              type: "image",
              fileId: result.fileId,
              name: fileName,
              fileType: file.type || "image/png",
              fileSize: file.size,
              width: result.dimensions?.width || 1920,
              height: result.dimensions?.height || 1080,
            };

            folderChildren.push({ id: imageId });
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch template image ${url}:`, error);
      }
    }

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

          const results = await uploadFontFiles([file], "template-project");
          if (results && results.length > 0) {
            const result = results[0];
            const fontId = `font-sample`;

            fetchedFonts[fileName] = result.fileId;

            fontItems[fontId] = {
              type: "font",
              fileId: result.fileId,
              name: "Sample Font",
              fontFamily: result.fontName || "SampleFont",
              fileType: "font/ttf",
              fileSize: file.size,
            };

            folderChildren.push({ id: fontId });
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch template font ${url}:`, error);
      }
    }

    if (folderChildren.length > 0) {
      fontTree.push({
        id: folderId,
        children: folderChildren,
      });
    }

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

  const localStorageKey = "repositoryEventStream";
  const repository = createRepository(initialData, localStorageKey);

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
    platform: platformConfig.platform || "web",
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
    platform: platformConfig.platform || "web",
  };

  const deps = {
    components: componentDependencies,
    pages: pageDependencies,
  };

  const patch = createWebPatch();

  return { h, patch, deps };
}