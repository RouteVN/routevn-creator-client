export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;
  const project = appService.getCurrentProjectEntry();
  store.setCurrentProject({ project });
};

export const handleEditButtonClick = (deps) => {
  const { store, render, refs } = deps;
  store.openEditDialog();
  render();

  const { editForm } = refs;
  const { editDefaultValues } = store.getState();
  editForm.reset();
  editForm.setValues({ values: editDefaultValues });
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, store, render, subject } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Project name is required.", {
      title: "Warning",
    });
    return;
  }

  const currentProject = appService.getCurrentProjectEntry();
  if (!currentProject.id || currentProject.source !== "local") {
    store.closeEditDialog();
    render();
    return;
  }

  const patch = {
    name,
    description: values?.description ?? "",
    iconFileId: store.getState().editIconFileId,
  };

  await appService.updateProjectEntry(currentProject.id, patch);

  store.setCurrentProject({
    project: {
      ...currentProject,
      ...patch,
    },
  });
  store.closeEditDialog();
  subject.dispatch("project-image-update");
  render();
};

export const handleEditDialogIconClick = async (deps) => {
  const { appService, render, store } = deps;
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
  store.setEditIconFileId({ iconFileId: result.fileId });
  render();
};

export const handleBackToProjects = async (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};
