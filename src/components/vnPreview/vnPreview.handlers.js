import { constructProjectData } from "../../utils/projectDataConstructor.js";

export const handleAfterMount = async (deps) => {
  const { router, repositoryFactory, drenderer, getRefIds } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const state = repository.getState();

  const { canvas } = getRefIds();

  await drenderer.init(canvas.elm);

  // TODO: load assets
  const projectData = constructProjectData(state);

  console.log("state", state);
  console.log("projectData", projectData);

  await drenderer.initRouteEngine(projectData);
};
