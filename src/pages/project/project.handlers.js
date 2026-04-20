import { requireProjectResolution } from "../../internal/projectResolution.js";

const ICON_VALIDATIONS = [
  {
    type: "image-min-size",
    minWidth: 64,
    minHeight: 64,
  },
];

export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;
  store.setCurrentProject({
    project: {
      source: appService.getCurrentProjectEntry()?.source,
    },
  });
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, store, render } = deps;
  await projectService.ensureRepository();
  const projectInfo = await projectService.getCurrentProjectInfo();
  const repositoryState = projectService.getRepositoryState();
  const projectResolution = requireProjectResolution(
    repositoryState?.project?.resolution,
    "Project resolution",
  );
  store.setCurrentProject({
    project: {
      ...projectInfo,
      resolution: projectResolution,
      source: appService.getCurrentProjectEntry()?.source,
    },
  });
  render();
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
  const { appService, projectService, store, render, subject } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Project name is required.",
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

  const nextProjectInfo = await projectService.updateCurrentProjectInfo(patch);

  store.setCurrentProject({
    project: {
      ...store.getState().project,
      ...nextProjectInfo,
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
      validations: ICON_VALIDATIONS,
    });
  } catch {
    appService.showAlert({
      message: "Failed to select project icon.",
      title: "Error",
    });
    return;
  }

  if (!file) {
    return;
  }

  store.openEditIconCropDialog({ file });
  render();
};

export const handleEditIconCropDialogClose = (deps) => {
  const { render, store } = deps;
  if (!store.getState().isEditIconCropDialogOpen) {
    return;
  }

  store.closeEditIconCropDialog();
  render();
};

export const handleEditIconCropDialogConfirm = async (deps) => {
  const { appService, projectService, refs, render, store } = deps;

  let croppedFile;
  try {
    croppedFile = await refs.editIconCropDialog?.getCroppedFile?.();
    if (!croppedFile) {
      throw new Error("Project icon crop is not ready.");
    }
  } catch {
    appService.showAlert({
      message: "Failed to crop project icon.",
      title: "Error",
    });
    return;
  }

  let uploadResult;
  try {
    const uploadResults = await projectService.uploadFiles([croppedFile], {
      skipImageThumbnail: true,
    });
    uploadResult = uploadResults?.[0];
  } catch {
    uploadResult = undefined;
  }

  if (!uploadResult?.fileId) {
    appService.showAlert({
      message: "Failed to upload project icon.",
      title: "Error",
    });
    return;
  }

  store.setEditIconFileId({ iconFileId: uploadResult.fileId });
  store.closeEditIconCropDialog();
  render();
};

export const handleBackToProjects = async (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};
