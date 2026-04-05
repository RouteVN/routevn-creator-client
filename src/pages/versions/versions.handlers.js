import { nanoid } from "nanoid";
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
    appService.showToast("Version name is required.", {
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
    const allEvents = repository.getEvents();
    const currentActionIndex = allEvents.length;

    const newVersion = {
      id: nanoid(),
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
    appService.showToast(
      editingVersionId
        ? "Failed to update version."
        : "Failed to create version.",
      {
        title: "Error",
      },
    );
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

  appService.showToast("Please wait while the bundle is being created...", {
    title: "Bundle in progress",
  });

  const versionId = resolveVersionIdFromPayload(payload);
  const version = store.selectVersion(versionId);

  if (!version) {
    appService.showToast("Version not found.", {
      title: "Error",
    });
    return;
  }

  store.closeDropdownMenu();
  store.setSelectedItemId({ itemId: versionId });
  render();

  const repository = await projectService.getRepository();
  const repositoryState = repository.getState(version.actionIndex);
  const usage = collectUsedResourcesForExport(repositoryState);
  const filteredState = buildFilteredStateForExport(repositoryState, usage);
  const constructedProjectData = constructProjectData(filteredState);
  const transformedData = createBundleInstructions({
    projectData: constructedProjectData,
    bundler: {
      appVersion: appService.getAppVersion(),
    },
  });
  const fileIds = usage.fileIds;
  let projectName = "project";

  if (projectId && typeof appService.getProjectEntries === "function") {
    const entries = await appService.getProjectEntries();
    const projectEntry = Array.isArray(entries)
      ? entries.find((entry) => entry?.id === projectId)
      : undefined;
    const entryName = projectEntry?.name?.trim?.();
    if (entryName) {
      projectName = entryName;
    }
  }

  const zipName = `${projectName}_${version.name}`;

  try {
    const outputPath = await projectService.createDistributionZipStreamed(
      transformedData,
      fileIds,
      zipName,
    );

    if (!outputPath) {
      appService.closeAll();
      return;
    }

    appService.showToast(`ZIP export completed.\nSaved to: ${outputPath}`, {
      title: "Export completed",
    });
  } catch (error) {
    appService.showToast(`Failed to save ZIP file: ${error.message}`, {
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
    appService.showToast("Failed to delete version.", {
      title: "Error",
    });
  }
};
