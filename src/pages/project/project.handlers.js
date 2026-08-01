import { requireProjectResolution } from "../../internal/projectResolution.js";
import { requireProjectLanguage } from "../../internal/projectLanguage.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import {
  defer,
  EMPTY,
  firstValueFrom,
  from,
  retry,
  switchMap,
  tap,
  timer,
} from "rxjs";
import {
  formatProjectPageCopy,
  selectProjectPageCopy,
} from "./support/projectPageCopy.js";
import {
  buildProjectAnalytics,
  selectProjectAnalyticsResourceRoute,
} from "./support/projectAnalytics.js";

const ICON_VALIDATIONS = [
  {
    type: "image-min-size",
    minWidth: 512,
    minHeight: 512,
  },
];
const SCENE_TEXT_ANALYTICS_RETRY_DELAY_MS = 250;

const beginProjectAnalyticsRefresh = (deps, { repositoryState } = {}) => {
  const { store, render } = deps;
  const analytics = buildProjectAnalytics({ repositoryState });
  const sceneIds = analytics.scenes.map((scene) => scene.id);
  const language = store.selectCurrentProject().language;
  const requestId = store.selectProjectAnalyticsRequestId() + 1;

  store.setProjectAnalyticsRequestId({ requestId });
  store.setProjectAnalytics({ analytics });
  render();

  return {
    analytics,
    language,
    repositoryState,
    requestId,
    sceneIds,
  };
};

const loadProjectAnalytics = async (deps, request) => {
  const { projectService } = deps;

  const sceneTextStatsById = await projectService.ensureSceneTextStats({
    sceneIds: request.sceneIds,
    language: request.language,
  });
  const hasAllSceneTextStats = request.sceneIds.every(
    (sceneId) => sceneTextStatsById[sceneId]?.language === request.language,
  );
  if (!hasAllSceneTextStats) {
    throw new Error("Scene text analytics recalculation is incomplete.");
  }

  return {
    analytics: buildProjectAnalytics({
      repositoryState: request.repositoryState,
      sceneTextStatsById,
    }),
    requestId: request.requestId,
  };
};

const createProjectAnalyticsLoadStream = (deps, request) => {
  const { store } = deps;

  return defer(() => {
    if (store.selectProjectAnalyticsRequestId() !== request.requestId) {
      return EMPTY;
    }

    return from(loadProjectAnalytics(deps, request));
  }).pipe(
    retry({
      delay: () => timer(SCENE_TEXT_ANALYTICS_RETRY_DELAY_MS),
    }),
  );
};

const completeProjectAnalyticsRefresh = (deps, result) => {
  const { store, render } = deps;
  if (store.selectProjectAnalyticsRequestId() !== result.requestId) {
    return;
  }

  store.setProjectAnalytics({ analytics: result.analytics });
  render();
};

const refreshProjectAnalytics = async (deps, { repositoryState } = {}) => {
  const request = beginProjectAnalyticsRefresh(deps, { repositoryState });
  if (request.sceneIds.length === 0) {
    return;
  }

  const result = await firstValueFrom(
    createProjectAnalyticsLoadStream(deps, request),
    { defaultValue: undefined },
  );
  if (result) {
    completeProjectAnalyticsRefresh(deps, result);
  }
};

export const handleBeforeMount = (deps) => {
  const { appService, projectService, store } = deps;
  store.setPlatform({ platform: appService.getPlatform() });
  store.setCurrentProject({
    project: {
      source: appService.getCurrentProjectEntry()?.source,
    },
  });

  const subscription = createProjectStateStream({
    projectService,
    emitCurrent: false,
  })
    .pipe(
      switchMap(({ repositoryState }) => {
        const request = beginProjectAnalyticsRefresh(deps, {
          repositoryState,
        });
        if (request.sceneIds.length === 0) {
          return EMPTY;
        }

        return createProjectAnalyticsLoadStream(deps, request);
      }),
      tap((result) => {
        completeProjectAnalyticsRefresh(deps, result);
      }),
    )
    .subscribe();

  return () => {
    store.setProjectAnalyticsRequestId({
      requestId: store.selectProjectAnalyticsRequestId() + 1,
    });
    subscription.unsubscribe();
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, store, i18n } = deps;
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
  await refreshProjectAnalytics(deps, { repositoryState });
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

const exportCurrentNativeProject = async (deps) => {
  const { appService, projectService, store, render, i18n } = deps;
  const copy = selectProjectPageCopy(i18n);
  const currentProject = appService.getCurrentProjectEntry();
  const projectId = currentProject?.id ?? "";
  const platform = appService.getPlatform();

  if (
    (platform !== "android" && platform !== "ios") ||
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
    await exportCurrentNativeProject(deps);
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
    language: requireProjectLanguage(values?.language),
    iconFileId: store.selectEditIconFileId(),
  };

  const nextProjectInfo = await projectService.updateCurrentProjectInfo(patch);
  appService.updateCachedProject(currentProject.id, nextProjectInfo);

  store.setCurrentProject({
    project: {
      ...store.selectCurrentProject(),
      ...nextProjectInfo,
    },
  });
  store.closeEditDialog();
  subject.dispatch("project-image-update");
  await refreshProjectAnalytics(deps, {
    repositoryState: projectService.getRepositoryState(),
  });
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
  appService.navigate("/projects", undefined, {
    historyMode: "replace",
    historyState: { preserveProjectsEntryOnProjectOpen: true },
  });
};

export const handleBackButtonKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  handleBackToProjects(deps);
};

const navigateFromAnalyticsLink = (deps, currentTarget) => {
  const { appService } = deps;
  const { resourceKey, characterId, sceneId } = currentTarget.dataset;
  const currentPayload = appService.getPayload();

  if (resourceKey) {
    const route = selectProjectAnalyticsResourceRoute({ resourceKey });
    if (route) {
      appService.navigate(route, currentPayload);
    }
    return;
  }

  if (characterId) {
    appService.navigate("/project/character-sprites", {
      ...currentPayload,
      characterId,
    });
    return;
  }

  if (sceneId) {
    const nextPayload = {
      ...currentPayload,
      s: sceneId,
    };
    delete nextPayload.sceneId;
    appService.navigate("/project/scene-editor", nextPayload);
  }
};

export const handleAnalyticsLinkClick = (deps, payload) => {
  navigateFromAnalyticsLink(deps, payload._event.currentTarget);
};

export const handleAnalyticsLinkKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  navigateFromAnalyticsLink(deps, event.currentTarget);
};
