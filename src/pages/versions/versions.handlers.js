import { generateId } from "../../internal/id.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { normalizeExportFileMimeType } from "../../internal/bundleRuntimeAssets.js";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
  constructProjectData,
} from "../../internal/project/projection.js";
import { createBundleInstructions } from "../../deps/services/shared/projectExportService.js";
import { selectVersionsPageCopy } from "./support/versionsPageCopy.js";

const getVersionDescription = (version) => {
  return version?.description ?? version?.notes ?? "";
};

const syncVersionFormValues = ({ deps, values } = {}) => {
  const { versionForm } = deps.refs;
  versionForm.reset();
  versionForm.setValues({ values });
};

const refreshVersionsData = async (deps) => {
  const { store, render, projectService, appService } = deps;
  const { p: projectId } = appService.getPayload();

  await projectService.ensureRepository();
  const adapter = projectService.getAdapterById(projectId);
  const versions = (await adapter.app.get("versions")) || [];

  store.setVersions({ versions });
  render();
};

const openCreateVersionDialog = ({ deps } = {}) => {
  const { store, render } = deps;

  store.openVersionDialog();
  render();

  syncVersionFormValues({
    deps,
    values: {
      name: "",
      description: "",
    },
  });
};

const openEditVersionDialog = ({ deps, versionId } = {}) => {
  if (!versionId) {
    return;
  }

  const { store, render } = deps;
  const version = store.selectVersion(versionId);
  if (!version) {
    return;
  }

  store.setSelectedItemId({ itemId: versionId });
  store.openVersionDialog({ versionId });
  render();

  syncVersionFormValues({
    deps,
    values: {
      name: version.name ?? "",
      description: getVersionDescription(version),
    },
  });
};

const resolveVersionIdFromPayload = (payload = {}) => {
  return payload?._event?.currentTarget?.dataset?.versionId ?? "";
};

const getVersionZipName = ({ appService, projectId, version } = {}) => {
  const currentProjectEntry = appService.getCurrentProjectEntry();
  const entryName =
    currentProjectEntry?.id === projectId
      ? currentProjectEntry?.name?.trim?.()
      : "";
  const projectName = entryName || "project";

  return `${projectName}_${version?.name ?? "version"}`;
};

const formatReplayFailureMessage = ({ replay, copy = {} } = {}) => {
  const failedEventOffset = replay?.failedEventOffset;
  const targetEventCount = replay?.targetEventCount;
  const failedType = replay?.failedEvent?.type || "unknown";

  if (!Number.isFinite(Number(failedEventOffset))) {
    return (
      copy.historyReplayFailed ??
      "History replay failed. Check the app console for details."
    );
  }

  return formatI18nCopy(
    copy.historyReplayFailedAtEvent ??
      "History replay failed at event {failedEventOffset}/{targetEventCount} ({failedType}). Check the app console for details.",
    {
      failedEventOffset,
      targetEventCount: targetEventCount || "?",
      failedType,
    },
  );
};

export const handleBeforeMount = (deps) => {
  const { store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
};

export const handleAfterMount = async (deps) => {
  await refreshVersionsData(deps);
};

export const handleDataChanged = refreshVersionsData;

export const handleSaveVersionClick = (deps) => {
  openCreateVersionDialog({ deps });
};

export const handleVersionItemClick = (deps, payload) => {
  const { store, render } = deps;
  const versionId = resolveVersionIdFromPayload(payload);
  if (!versionId) {
    return;
  }

  store.setSelectedItemId({ itemId: versionId });
  render();
};

export const handleMobileDetailSheetClose = (deps) => {
  const { store, render } = deps;

  if (!store.selectSelectedItemId()) {
    return;
  }

  store.setSelectedItemId({ itemId: undefined });
  render();
};

export const handleVersionItemDoubleClick = (deps, payload) => {
  const versionId = resolveVersionIdFromPayload(payload);
  if (!versionId) {
    return;
  }

  openEditVersionDialog({ deps, versionId });
};

export const handleDetailHeaderClick = (deps) => {
  const versionId = deps.store.selectSelectedItemId();
  if (!versionId) {
    return;
  }

  openEditVersionDialog({ deps, versionId });
};

export const handleVersionFormClose = (deps) => {
  const { store, render } = deps;
  store.closeVersionDialog();
  render();
};

export const handleVersionFormAction = async (deps, payload) => {
  const { store, render, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { p: projectId } = appService.getPayload();
  const { actionId, values } = payload._event.detail;

  if (actionId === "cancel") {
    store.closeVersionDialog();
    render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.versionNameRequired ?? "Version name is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const description = values?.description ?? "";
  const editingVersionId = store.selectEditingVersionId();

  try {
    if (editingVersionId) {
      const currentVersion = store.selectVersion(editingVersionId);
      if (!currentVersion) {
        store.closeVersionDialog();
        render();
        return;
      }

      const updatedVersion = {
        ...currentVersion,
        name,
        notes: description,
      };

      await projectService.updateVersionInProject(projectId, editingVersionId, {
        name,
        notes: description,
      });

      store.updateVersion({ version: updatedVersion });
      store.setSelectedItemId({ itemId: editingVersionId });
      store.closeVersionDialog();
      render();
      return;
    }

    await projectService.ensureRepository();
    const currentActionIndex = projectService.getRepositoryRevision();

    const newVersion = {
      id: generateId(),
      name,
      notes: description,
      actionIndex: currentActionIndex,
      createdAt: new Date().toISOString(),
    };

    await projectService.addVersionToProject(projectId, newVersion);

    store.addVersion({ version: newVersion });
    store.setSelectedItemId({ itemId: newVersion.id });
    store.closeVersionDialog();
    render();
  } catch {
    appService.showAlert({
      message: editingVersionId
        ? (copy.failedUpdateVersion ?? "Failed to update version.")
        : (copy.failedCreateVersion ?? "Failed to create version."),
      title: copy.errorTitle ?? "Error",
    });
  }
};

export const handleVersionContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const versionId = resolveVersionIdFromPayload(payload);
  const version = store.selectVersion(versionId);

  if (!version) {
    return;
  }

  store.setSelectedItemId({ itemId: versionId });
  store.openDropdownMenu({
    x: payload._event.clientX,
    y: payload._event.clientY,
    versionId,
  });
  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.closeDropdownMenu();
  render();
};

export const handleDownloadZipClick = async (deps, payload) => {
  const { store, render, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  payload._event.stopPropagation();

  const currentPayload = appService.getPayload();
  const projectId = currentPayload.p ?? "";

  const versionId = resolveVersionIdFromPayload(payload);
  const version = store.selectVersion(versionId);

  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound ?? "Version not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  store.closeDropdownMenu();
  store.setSelectedItemId({ itemId: versionId });
  render();

  const zipName = getVersionZipName({
    appService,
    projectId,
    version,
  });
  let outputPath;

  try {
    outputPath = await projectService.promptDistributionZipPath(zipName);
  } catch (error) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedOpenSaveDialog ?? "Failed to open save dialog: {message}",
        { message: error.message },
      ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  if (outputPath === null) {
    appService.closeAll();
    return;
  }

  appService.showAlert({
    message:
      copy.bundleInProgressMessage ??
      "Please wait while the bundle is being created...",
    title: copy.bundleInProgressTitle ?? "Bundle in progress",
  });

  try {
    const projectInfo = await projectService.getCurrentProjectInfo();
    const repositoryState = await projectService.loadRepositoryState(
      version?.actionIndex,
    );
    const usage = collectUsedResourcesForExport(repositoryState);
    const filteredState = buildFilteredStateForExport(repositoryState, usage);
    const constructedProjectData = constructProjectData(filteredState);
    const fileEntries = usage.fileIds.map((fileId) => {
      const fileRecord = filteredState.files?.items?.[fileId];
      const normalizedMimeType = normalizeExportFileMimeType({
        mimeType: fileRecord?.mimeType,
        assetType: fileRecord?.type,
      });
      const entry = {
        fileId,
      };

      if (normalizedMimeType) {
        entry.mimeType = normalizedMimeType;
      }

      return entry;
    });
    const transformedData = createBundleInstructions({
      projectData: constructedProjectData,
      bundler: {
        appVersion: appService.getAppVersion(),
      },
      project: {
        namespace: projectInfo.namespace,
      },
    });
    const savedPath = outputPath
      ? await projectService.createDistributionZipStreamedToPath(
          transformedData,
          fileEntries,
          outputPath,
        )
      : await projectService.createDistributionZipStreamed(
          transformedData,
          fileEntries,
          zipName,
        );

    if (!savedPath) {
      appService.closeAll();
      return;
    }

    appService.showAlert({
      message: formatI18nCopy(
        copy.zipExportCompletedMessage ?? "ZIP export completed.\nSaved to: {path}",
        { path: savedPath },
      ),
      title: copy.exportCompletedTitle ?? "Export completed",
    });
  } catch (error) {
    const replay = error?.details?.replay;

    if (replay) {
      console.error("Version export history replay failed", {
        versionId,
        versionName: version?.name,
        versionActionIndex: version?.actionIndex,
        replay,
        error,
      });
    }

    appService.showAlert({
      message: replay
        ? `${formatReplayFailureMessage({ replay, copy })}\n${error.message}`
        : formatI18nCopy(
            copy.failedSaveZipFile ?? "Failed to save ZIP file: {message}",
            { message: error.message },
          ),
      title: copy.errorTitle ?? "Error",
    });
  }
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const detail = payload._event.detail;
  const item = detail.item || detail;
  const versionId = store.selectDropdownMenuTargetVersionId();

  store.closeDropdownMenu();

  if (!versionId) {
    render();
    return;
  }

  if (item.value === "edit") {
    render();
    openEditVersionDialog({ deps, versionId });
    return;
  }

  if (item.value !== "delete") {
    render();
    return;
  }

  try {
    const { p: projectId } = appService.getPayload();
    await projectService.deleteVersionFromProject(projectId, versionId);
    store.deleteVersion({ versionId });
    render();
  } catch {
    render();
    appService.showAlert({
      message: copy.failedDeleteVersion ?? "Failed to delete version.",
      title: copy.errorTitle ?? "Error",
    });
  }
};
