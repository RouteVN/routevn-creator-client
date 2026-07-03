import { requireProjectResolution } from "../../internal/projectResolution.js";
import {
  formatProjectPageCopy,
  selectProjectPageCopy,
} from "./support/projectPageCopy.js";

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
  const { appService, projectService, store, render, i18n } = deps;
  const copy = selectProjectPageCopy(i18n);
  await projectService.ensureRepository();
  const projectInfo = await projectService.getCurrentProjectInfo();
  const repositoryState = projectService.getRepositoryState();
  const projectResolution = requireProjectResolution(
    repositoryState?.project?.resolution,
    copy.projectResolutionLabel,
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
  const { appService, projectService, store, render, i18n } = deps;
  const copy = selectProjectPageCopy(i18n);
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
      message: copy.noLocalProjectOpen,
      title: copy.warningTitle,
    });
    return;
  }

  let folder;
  try {
    folder = await appService.openFolderPicker({
      title: copy.selectExportFolderTitle,
      writable: true,
    });
  } catch {
    appService.showAlert({
      message: copy.failedSelectExportFolder,
      title: copy.errorTitle,
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
      message: formatProjectPageCopy(copy.exportedProjectMessage, {
        projectName: result.name,
      }),
      title: copy.exportCompleteTitle,
    });
  } catch (error) {
    const message = String(error?.message ?? "").trim();
    store.setProjectExportLoading({ isLoading: false });
    render();
    await appService.showAlert({
      message: message || copy.failedExportProject,
      title: copy.errorTitle,
    });
  }
};

export const handleProjectActionsClick = (deps, payload) => {
  const { store, render, i18n } = deps;
  const copy = selectProjectPageCopy(i18n);
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();

  store.openProjectActionMenu({
    ...getActionMenuPosition(event),
    items: [{ label: copy.exportProject, type: "item", value: "export" }],
  });
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
  const editDefaultValues = store.selectEditDefaultValues();
  editForm.reset();
  editForm.setValues({ values: editDefaultValues });
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, projectService, store, render, subject, i18n } = deps;
  const copy = selectProjectPageCopy(i18n);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.projectNameRequired,
      title: copy.warningTitle,
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
    iconFileId: store.selectEditIconFileId(),
  };

  const nextProjectInfo = await projectService.updateCurrentProjectInfo(patch);

  store.setCurrentProject({
    project: {
      ...store.selectCurrentProject(),
      ...nextProjectInfo,
    },
  });
  store.closeEditDialog();
  subject.dispatch("project-image-update");
  render();
};

export const handleEditDialogIconClick = async (deps) => {
  const { appService, render, store, i18n } = deps;
  const copy = selectProjectPageCopy(i18n);
  let file;

  try {
    file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      validations: ICON_VALIDATIONS,
    });
  } catch {
    appService.showAlert({
      message: copy.failedSelectProjectIcon,
      title: copy.errorTitle,
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
  if (!store.selectIsEditIconCropDialogOpen()) {
    return;
  }

  store.closeEditIconCropDialog();
  render();
};

export const handleEditIconCropDialogConfirm = async (deps) => {
  const { appService, projectService, refs, render, store, i18n } = deps;
  const copy = selectProjectPageCopy(i18n);

  let croppedFile;
  try {
    croppedFile = await refs.editIconCropDialog?.getCroppedFile?.();
    if (!croppedFile) {
      throw new Error(copy.projectIconCropNotReady);
    }
  } catch {
    appService.showAlert({
      message: copy.failedCropProjectIcon,
      title: copy.errorTitle,
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
      message: copy.failedUploadProjectIcon,
      title: copy.errorTitle,
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

export const handleBackButtonKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  handleBackToProjects(deps);
};
