import { validateIconDimensions } from "../../utils/fileProcessors";

export const handleAfterMount = async (deps) => {
  await handleDataChanged(deps);
};

export const handleDataChanged = async (deps) => {
  const { projectService, store, render } = deps;
  console.log("[routevn.project.page] handleDataChanged start");
  await projectService.ensureRepository();
  const state = projectService.getState();
  const { project } = state;
  console.log("[routevn.project.page] repository state summary", {
    projectId: project?.id || null,
    projectName: project?.name || "",
    projectDescription: project?.description || "",
    imagesCount: Object.keys(state?.images?.items || {}).length,
    scenesCount: Object.keys(state?.scenes?.items || {}).length,
    layoutsCount: Object.keys(state?.layouts?.items || {}).length,
    variablesCount: Object.keys(state?.variables?.items || {}).length,
  });
  store.setProject({ project: project });
  render();
  console.log("[routevn.project.page] render complete");
};

export const handleFormChange = async (deps, payload) => {
  const { projectService } = deps;
  await projectService.updateProjectFields({
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, subject, render, store } = deps;

  try {
    const files = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
    });

    if (!files || files.length === 0) {
      return; // User cancelled
    }

    const file = files[0];

    const { isValid, message } = await validateIconDimensions(file);
    if (!isValid) {
      appService.showToast(message, { title: "Error" });
      return;
    }

    const successfulUploads = await projectService.uploadFiles([file]);

    if (successfulUploads.length > 0) {
      const result = successfulUploads[0];
      await projectService.updateProjectFields({
        patch: {
          iconFileId: result.fileId,
        },
      });

      store.setIconFileId({ iconFileId: result.fileId });
      subject.dispatch("project-image-update");
      render();
    }
  } catch (error) {
    console.error("Project image upload failed:", error);
  }
};

export const handleBackToProjects = async (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};
