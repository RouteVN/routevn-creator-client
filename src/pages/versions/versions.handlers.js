import { generateId } from "../../internal/id.js";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
  constructProjectData,
} from "../../internal/project/projection.js";
import { createBundleInstructions } from "../../deps/services/shared/projectExportService.js";

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
  const currentProjectEntry =
    typeof appService?.getCurrentProjectEntry === "function"
      ? appService.getCurrentProjectEntry()
      : undefined;
  const entryName =
    currentProjectEntry?.id === projectId
      ? currentProjectEntry?.name?.trim?.()
      : "";
  const projectName = entryName || "project";

  return `${projectName}_${version?.name ?? "version"}`;
};

const formatReplayFailureMessage = ({ replay } = {}) => {
  const failedEventOffset = replay?.failedEventOffset;
  const targetEventCount = replay?.targetEventCount;
  const failedType = replay?.failedEvent?.type || "unknown";

  if (!Number.isFinite(Number(failedEventOffset))) {
    return "History replay failed. Check the app console for details.";
  }

  return `History replay failed at event ${failedEventOffset}/${targetEventCount || "?"} (${failedType}). Check the app console for details.`;
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
  const { store, render, projectService, appService } = deps;
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
      message: "Version name is required.",
      title: "Warning",
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

    const repository = await projectService.getRepository();
    const allEvents =
      typeof repository.loadEvents === "function"
        ? await repository.loadEvents()
        : repository.getEvents();
    const currentActionIndex = allEvents.length;

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
        ? "Failed to update version."
        : "Failed to create version.",
      title: "Error",
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
  const { store, render, projectService, appService } = deps;
  payload._event.stopPropagation();

  const currentPayload = appService.getPayload();
  const projectId = currentPayload.p ?? "";

  const versionId = resolveVersionIdFromPayload(payload);
  const version = store.selectVersion(versionId);

  if (!version) {
    appService.showAlert({ message: "Version not found.", title: "Error" });
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

  if (typeof projectService.promptDistributionZipPath === "function") {
    try {
      outputPath = await projectService.promptDistributionZipPath(zipName);
    } catch (error) {
      appService.showAlert({
        message: `Failed to open save dialog: ${error.message}`,
        title: "Error",
      });
      return;
    }

    if (!outputPath) {
      appService.closeAll();
      return;
    }
  }

  appService.showAlert({
    message: "Please wait while the bundle is being created...",
    title: "Bundle in progress",
  });

  try {
    const repository = await projectService.getRepository();
    const projectInfo = await projectService.getCurrentProjectInfo();
    if (typeof repository.loadEvents === "function") {
      await repository.loadEvents();
    }
    const repositoryState = repository.getState(version?.actionIndex);
    const usage = collectUsedResourcesForExport(repositoryState);
    const filteredState = buildFilteredStateForExport(repositoryState, usage);
    const constructedProjectData = constructProjectData(filteredState);
    const transformedData = createBundleInstructions({
      projectData: constructedProjectData,
      bundler: {
        appVersion: appService.getAppVersion(),
      },
      project: {
        namespace: projectInfo.namespace,
      },
    });
    const savedPath =
      outputPath &&
      typeof projectService.createDistributionZipStreamedToPath === "function"
        ? await projectService.createDistributionZipStreamedToPath(
            transformedData,
            usage.fileIds,
            outputPath,
          )
        : await projectService.createDistributionZipStreamed(
            transformedData,
            usage.fileIds,
            zipName,
          );

    if (!savedPath) {
      appService.closeAll();
      return;
    }

    appService.showAlert({
      message: `ZIP export completed.\nSaved to: ${savedPath}`,
      title: "Export completed",
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
        ? `${formatReplayFailureMessage({ replay })}\n${error.message}`
        : `Failed to save ZIP file: ${error.message}`,
      title: "Error",
    });
  }
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
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
      message: "Failed to delete version.",
      title: "Error",
    });
  }
};
