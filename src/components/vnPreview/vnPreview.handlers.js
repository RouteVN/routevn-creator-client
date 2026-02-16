import { constructProjectData } from "../../utils/projectDataConstructor.js";
import { extractFileIdsFromRenderState } from "../../utils/index.js";

const getFontMimeType = (fontItem = {}) => {
  const fileName = (fontItem.name || "").toLowerCase();
  if (fileName.endsWith(".woff2")) return "font/woff2";
  if (fileName.endsWith(".woff")) return "font/woff";
  if (fileName.endsWith(".otf")) return "font/otf";
  if (fileName.endsWith(".ttf")) return "font/ttf";
  return "font/ttf";
};

/**
 * Load assets (images and fonts) for rendering
 * @param {Object} deps - Component dependencies
 * @param {Array} fileReferences - File references with url and type to load
 * @param {Object} fontsItems - Font items from repository
 * @returns {Promise<Object>} Loaded assets
 */
const loadAssets = async (deps, fileReferences, fontsItems = {}) => {
  const { projectService } = deps;
  const assets = {};

  for (const fileObj of fileReferences) {
    const { url: fileId, type } = fileObj;
    const result = await projectService.getFileContent(fileId);
    const fontItem = Object.values(fontsItems).find(
      (font) => font.fileId === fileId,
    );

    if (fontItem?.fontFamily) {
      assets[fontItem.fontFamily] = {
        url: result.url,
        type: getFontMimeType(fontItem),
      };
    } else {
      assets[fileId] = {
        url: result.url,
        type: type || result.type || "image/png",
      };
    }
  }

  return assets;
};

export const handleBeforeMount = (deps) => {
  const { dispatchEvent } = deps;
  function handleKeyDown(event) {
    if (event.key === "Escape") {
      dispatchEvent(new CustomEvent("close"));
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
};

export const handleAfterMount = async (deps) => {
  const { projectService, graphicsService, getRefIds, attrs } = deps;
  await projectService.ensureRepository();
  const state = projectService.getState();
  const { canvas } = getRefIds();
  await graphicsService.init({ canvas: canvas.elm });

  const sceneId = attrs["scene-id"];
  const sectionId = attrs["section-id"];
  const lineId = attrs["line-id"];

  const projectData = constructProjectData(state, {
    initialSceneId: sceneId,
  });

  const projectDataWithInitial = structuredClone(projectData);
  const scene = projectDataWithInitial.story.scenes[sceneId];

  if (scene && sectionId && sectionId !== "undefined") {
    scene.initialSectionId = sectionId;

    if (lineId && lineId !== "undefined" && scene.sections[sectionId]) {
      scene.sections[sectionId].initialLineId = lineId;
    }
  }

  const fileReferences = extractFileIdsFromRenderState(
    projectDataWithInitial.resources,
  );
  const fontsItems = state.fonts?.items || {};
  const assets = await loadAssets(deps, fileReferences, fontsItems);
  await graphicsService.loadAssets(assets);
  await graphicsService.initRouteEngine(projectDataWithInitial, {
    handleEffects: true,
  });
};
