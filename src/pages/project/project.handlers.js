export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;
  const project = appService.getCurrentProjectEntry();
  store.setCurrentProject({ project });
};

export const handleFormChange = async (deps, payload) => {
  const { appService } = deps;
  const currentProject = appService.getCurrentProjectEntry();
  if (!currentProject.id || currentProject.source !== "local") {
    return;
  }

  await appService.updateProjectEntry(currentProject.id, {
    [payload._event.detail.name]: payload._event.detail.value,
  });
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, subject, render, store } = deps;

  try {
    const file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: [{ type: "square" }],
      upload: true,
    });

    if (!file || !file.uploadSucessful || !file.uploadResult) {
      return; // User cancelled
    }

    const result = file.uploadResult;
    const currentProject = appService.getCurrentProjectEntry();
    if (currentProject.id && currentProject.source === "local") {
      await appService.updateProjectEntry(currentProject.id, {
        iconFileId: result.fileId,
      });
    }

    store.setIconFileId({ iconFileId: result.fileId });
    subject.dispatch("project-image-update");
    render();
  } catch (error) {
    console.error("Project image upload failed:", error);
  }
};

export const handleBackToProjects = async (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};
