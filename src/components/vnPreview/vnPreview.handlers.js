import { constructProjectData } from "../../utils/projectDataConstructor.js";
import { extractFileIdsFromRenderState } from "../../utils/index.js";

/**
 * Load assets (images and fonts) for rendering
 * @param {Object} deps - Component dependencies
 * @param {Array} fileIds - File IDs to load
 * @returns {Promise<Object>} Loaded assets
 */
const loadAssets = async (deps, fileIds) => {
  const { fileManagerFactory, router } = deps;
  const { p } = router.getPayload();
  const assets = {};

  const fileManager = await fileManagerFactory.getByProject(p);

  for (const fileId of fileIds) {
    const result = await fileManager.getFileContent({
      fileId: fileId,
    });
    assets[`file:${fileId}`] = {
      url: result.url,
      type: result.type || "image/png",
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
  const { router, repositoryFactory, drenderer, getRefIds, attrs } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const state = repository.getState();
  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });
  const projectData = constructProjectData(state, {
    initialSceneId: attrs["scene-id"],
  });
  const fileIds = extractFileIdsFromRenderState(projectData);
  const assets = await loadAssets(deps, fileIds);
  await drenderer.loadAssets(assets);
  await drenderer.initRouteEngine(projectData);
};
