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
  let file;

  try {
    file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: [{ type: "square" }],
      upload: true,
    });
  } catch {
    appService.showToast("Failed to select file.", {
      title: "Error",
    });
    return;
  }

  if (!file) {
    return; // User cancelled
  }

  if (!file.uploadSucessful || !file.uploadResult) {
    appService.showToast("Failed to upload project icon.", {
      title: "Error",
    });
    return;
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
};

export const handleBackToProjects = async (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};
