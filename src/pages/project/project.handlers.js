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
  store.setPlatform({ platform: appService.getPlatform() });
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

const getActionMenuPosition = (event) => {
  const rect = event.currentTarget?.getBoundingClientRect?.();
  return {
    x: event.clientX || rect?.right || 0,
    y: rect?.bottom || event.clientY || 0,
  };
};

const resolveFolderUri = (folder) => {
  if (typeof folder === "string") {
    return folder;
  }

  return folder?.uri ?? "";
};

const exportCurrentAndroidProject = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const currentProject = appService.getCurrentProjectEntry();
  const projectId = currentProject?.id ?? "";

  if (
    appService.getPlatform() !== "android" ||
    currentProject?.source !== "local"
  ) {
    return;
  }

  if (!projectId) {
    appService.showAlert({
      message: "No local project is currently open.",
      title: "Warning",
    });
    return;
  }

  let folder;
  try {
    folder = await appService.openFolderPicker({
      title: "Select Export Folder",
      writable: true,
    });
  } catch {
    appService.showAlert({
      message: "Failed to select an export folder.",
      title: "Error",
    });
    return;
  }

  const destinationUri = resolveFolderUri(folder);
  if (!destinationUri) {
    return;
  }

  store.setProjectExportLoading({ isLoading: true });
  render();

  try {
    const result = await projectService.exportProjectFolder({
      projectId,
      destinationUri,
    });
    store.setProjectExportLoading({ isLoading: false });
    render();
    await appService.showAlert({
      message: `Project exported to "${result.name}".`,
      title: "Export Complete",
    });
  } catch (error) {
    const message = String(error?.message ?? "").trim();
    store.setProjectExportLoading({ isLoading: false });
    render();
    await appService.showAlert({
      message: message || "Failed to export project.",
      title: "Error",
    });
  }
};

export const handleProjectActionsClick = (deps, payload) => {
  const { store, render } = deps;
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();

  store.openProjectActionMenu(getActionMenuPosition(event));
  render();
};

export const handleProjectActionMenuClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsProjectActionMenuOpen()) {
    return;
  }

  store.closeProjectActionMenu();
  render();
};

export const handleProjectActionMenuClickItem = async (deps, payload) => {
  const { store, render } = deps;
  const item = payload._event.detail.item || payload._event.detail;

  store.closeProjectActionMenu();
  render();

  if (item?.value === "export") {
    await exportCurrentAndroidProject(deps);
  }
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
