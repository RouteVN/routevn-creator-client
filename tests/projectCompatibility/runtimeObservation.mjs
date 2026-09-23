// Logical preview/export projection and engine behavior. Rendering and native
// packaged-player execution remain distinct release checks.
export function observeRuntime({
  state,
  constructProjectData,
  sanitizeProjectDataForRouteEngine,
  createRouteEngine,
}) {
  let engine;
  let stage = "export-projection";
  try {
    const projected = constructProjectData(state);
    const { projectData, changes } =
      sanitizeProjectDataForRouteEngine(projected);
    stage = "engine-init";
    engine = createRouteEngine({ handlePendingEffects: () => {} });
    engine.init({
      namespace: "compatibility-project-one",
      initialState: { projectData },
    });
    const observations = [];
    const snapshot = () => {
      const context = engine.selectSystemState().contexts.at(-1);
      observations.push({
        pointers: context.pointers,
        presentation: engine.selectPresentationState(),
      });
    };
    snapshot();
    stage = "engine-next-line";
    for (let index = 0; index < 2; index++) {
      engine.handleActions({ nextLine: {} });
      snapshot();
    }
    return {
      status: "available",
      projected,
      previewNormalizations: changes,
      observations,
    };
  } catch (error) {
    return {
      status: "unavailable",
      stage,
      error: { name: error.name, message: error.message },
    };
  } finally {
    if (engine) engine.dispose();
  }
}
