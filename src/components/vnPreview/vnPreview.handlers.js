import { constructProjectData } from "../../utils/projectDataConstructor.js";
import { extractFileIdsFromRenderState } from "../../utils/index.js";

/**
 * Load assets (images and fonts) for rendering
 * @param {Object} deps - Component dependencies
 * @param {Array} fileReferences - File references with url and type to load
 * @returns {Promise<Object>} Loaded assets
 */
const loadAssets = async (deps, fileReferences) => {
  const { projectService } = deps;
  const assets = {};

  for (const fileObj of fileReferences) {
    const { url: fileId, type } = fileObj;
    const result = await projectService.getFileContent(fileId);
    assets[fileId] = {
      url: result.url,
      type: type || result.type || "image/png",
    };
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
  console.log("vnPreview: handleAfterMount started");
  console.log("vnPreview: attrs", attrs);

  await projectService.ensureRepository();
  const state = projectService.getState();
  console.log("vnPreview: repository state", state);

  const { canvas } = getRefIds();
  console.log("vnPreview: canvas", canvas);

  await graphicsService.init({ canvas: canvas.elm });
  console.log("vnPreview: graphicsService initialized");

  const projectData = constructProjectData(state, {
    initialSceneId: attrs["scene-id"],
  });
  console.log("vnPreview: projectData", projectData);

  const fileReferences = extractFileIdsFromRenderState(projectData.resources);
  console.log("vnPreview: fileReferences", fileReferences);

  const assets = await loadAssets(deps, fileReferences);
  console.log("vnPreview: assets loaded", assets);

  await graphicsService.loadAssets(assets);
  console.log("vnPreview: graphicsService assets loaded");

  await graphicsService.initRouteEngine(projectData);
  console.log("vnPreview: graphicsService initRouteEngine complete");

  graphicsService.engineRenderCurrentState();
};
