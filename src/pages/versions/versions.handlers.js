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
import { createMacosNativeVersion } from "../../internal/nativeApplicationVersion.js";
import { isVisualTestMode } from "../../internal/visualTestMode.js";
import { validatePlatformDetails } from "../../internal/platformDetailsValidation.js";

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

const refreshWindowsExportAvailability = async (deps) => {
  const { store, projectService, appService } = deps;

  if (appService.getPlatform() !== "tauri") {
    store.setWindowsExportAvailability({
      availability: {
        portableExecutable: false,
        installer: false,
        templateAvailable: false,
        installerHostSupported: false,
        installerToolAvailable: false,
      },
    });
    return;
  }

  try {
    store.setWindowsExportAvailability({
      availability: await projectService.getWindowsExportAvailability(),
    });
  } catch {
    store.setWindowsExportAvailability({
      availability: {
        portableExecutable: false,
        installer: false,
        templateAvailable: false,
        installerHostSupported: false,
        installerToolAvailable: false,
      },
    });
  }
};

const refreshMacosExportAvailability = async (deps) => {
  const { store, projectService, appService } = deps;

  if (appService.getPlatform() !== "tauri") {
    store.setMacosExportAvailability({
      availability: {
        application: false,
        templateAvailable: false,
        hostSupported: false,
      },
    });
    return;
  }

  try {
    store.setMacosExportAvailability({
      availability: await projectService.getMacosExportAvailability(),
    });
  } catch {
    store.setMacosExportAvailability({
      availability: {
        application: false,
        templateAvailable: false,
        hostSupported: false,
      },
    });
  }
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

const getVersionZipName = ({
  appService,
  projectId,
  version,
  applicationName,
} = {}) => {
  const currentProjectEntry = appService.getCurrentProjectEntry();
  const entryName =
    currentProjectEntry?.id === projectId
      ? currentProjectEntry?.name?.trim?.()
      : "";
  const projectName = applicationName?.trim() || entryName || "project";

  return `${projectName}_${version?.name ?? "version"}`;
};

const getProjectExportTitle = ({ projectInfo, applicationInfo } = {}) => {
  return (
    applicationInfo?.applicationName?.trim() || projectInfo?.name?.trim?.()
  );
};

const UNKNOWN_ERROR_MESSAGE =
  "Unknown error. Check the developer console for details.";
const WINDOWS_EXPORT_COMMAND_RESTART_MESSAGE =
  "The running Tauri shell does not include Windows export commands. Restart the Tauri dev process so the native shell rebuilds.";
const MACOS_EXPORT_COMMAND_RESTART_MESSAGE =
  "The running Tauri shell does not include the macOS export command. Restart the Tauri dev process so the native shell rebuilds.";

const getErrorMessage = (error, fallback = UNKNOWN_ERROR_MESSAGE) => {
  if (typeof error === "string") {
    return error.trim() || fallback;
  }

  const message = error?.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {}

  return fallback;
};

const getWindowsExportErrorMessage = (error) => {
  const message = getErrorMessage(error);
  if (
    /^Command export_windows_(portable_executable|installer_from_project) not found$/.test(
      message,
    )
  ) {
    return `${message}. ${WINDOWS_EXPORT_COMMAND_RESTART_MESSAGE}`;
  }

  return message;
};

const getMacosExportErrorMessage = (error) => {
  const message = getErrorMessage(error);
  if (
    /^Command (get_macos_export_host_capabilities|export_macos_application) not found$/.test(
      message,
    )
  ) {
    return `${message}. ${MACOS_EXPORT_COMMAND_RESTART_MESSAGE}`;
  }
  return message;
};

const getMacosExportUnavailableMessage = (availability = {}) => {
  if (!availability.hostSupported) {
    return "macOS application export is supported only on macOS.";
  }

  if (availability.capabilityCheckError) {
    return getMacosExportErrorMessage(availability.capabilityCheckError);
  }

  if (availability.templateCheckError) {
    return `Unable to verify the bundled macOS player template: ${availability.templateCheckError}`;
  }

  if (!availability.templateAvailable) {
    return "The macOS player template is not bundled with this Creator build.";
  }

  const missingTools = [
    ["ditto", availability.dittoAvailable],
    ["codesign", availability.codesignAvailable],
    ["sips", availability.sipsAvailable],
    ["iconutil", availability.iconutilAvailable],
    ["lipo", availability.lipoAvailable],
  ]
    .filter(([, available]) => !available)
    .map(([name]) => name);

  if (missingTools.length > 0) {
    return `macOS application export requires these system tools: ${missingTools.join(", ")}.`;
  }

  return "macOS application export is not available in this Creator build.";
};

const formatWindowsExportErrorCopy = ({ template, error }) =>
  formatI18nCopy(template, {
    message: getWindowsExportErrorMessage(error),
  });

const getMissingPlatformDetailsMessage = (platform, copy) => {
  if (platform === "windows") {
    return (
      copy.windowsPlatformDetailsRequired ??
      "Add Windows platform details before exporting. Open Platform Details, click +, and add Windows."
    );
  }
  if (platform === "macos") {
    return (
      copy.macosPlatformDetailsRequired ??
      "Add macOS platform details before exporting. Open Platform Details, click +, and add macOS."
    );
  }
  return (
    copy.webPlatformDetailsRequired ??
    "Add Web platform details before exporting. Open Platform Details, click +, and add Web."
  );
};

const getPlatformDetailsValidationMessage = (code, copy) => {
  if (code === "application-name-required") {
    return (
      copy.platformDetailsApplicationNameRequired ??
      "Application name is required in Platform Details before export."
    );
  }
  if (code === "theme-color-not-found") {
    return (
      copy.platformDetailsThemeColorNotFound ??
      "The theme color selected in Web Platform Details no longer exists. Update it before exporting."
    );
  }
  if (code === "background-color-not-found") {
    return (
      copy.platformDetailsBackgroundColorNotFound ??
      "The background color selected in Web Platform Details no longer exists. Update it before exporting."
    );
  }
  if (code === "windows-identifier-invalid") {
    return (
      copy.platformDetailsWindowsIdentifierInvalid ??
      "The Windows application identifier is invalid. Update it in Platform Details before exporting."
    );
  }
  if (code === "macos-identifier-required") {
    return (
      copy.platformDetailsMacosIdentifierRequired ??
      "Add a macOS bundle identifier in Platform Details before exporting."
    );
  }
  if (code === "macos-identifier-invalid") {
    return (
      copy.platformDetailsMacosIdentifierInvalid ??
      "The macOS bundle identifier is invalid. Update it in Platform Details before exporting."
    );
  }
  return (
    copy.platformDetailsMacosCategoryInvalid ??
    "The macOS application category is invalid. Update it in Platform Details before exporting."
  );
};

const getCurrentColorIds = (projectService) => {
  const colors = projectService.getRepositoryState()?.colors?.items ?? {};
  return new Set(
    Object.values(colors)
      .filter((color) => color?.type === "color")
      .map((color) => color.id),
  );
};

const getPlatformDetailsColor = (projectService, colorId) => {
  if (!colorId) {
    return undefined;
  }

  const color = projectService.getRepositoryState()?.colors?.items?.[colorId];
  return color?.type === "color" ? color : undefined;
};

const getPlatformDetailsColorLabel = (projectService, colorId) => {
  const color = getPlatformDetailsColor(projectService, colorId);
  if (!color) {
    return "";
  }

  const name = color.name?.trim();
  const hex = color.hex?.trim();
  if (name && hex) {
    return `${name} (${hex})`;
  }
  return name || hex || "";
};

const requirePlatformDetailsForExport = async ({
  appService,
  copy,
  platform,
  projectService,
} = {}) => {
  let applicationInfo;
  try {
    applicationInfo = await projectService.getCurrentPlatformDetails(platform);
  } catch {
    appService.showAlert({
      message:
        copy.platformDetailsLoadFailed ??
        "Platform details could not be checked. Try again before exporting.",
      title: copy.errorTitle ?? "Error",
    });
    return undefined;
  }

  if (!applicationInfo) {
    appService.showAlert({
      message: getMissingPlatformDetailsMessage(platform, copy),
      title: copy.warningTitle ?? "Warning",
    });
    return undefined;
  }

  let validation;
  try {
    validation = validatePlatformDetails({
      platform,
      applicationInfo,
      availableColorIds:
        platform === "web" ? getCurrentColorIds(projectService) : undefined,
    });
  } catch {
    appService.showAlert({
      message:
        copy.platformDetailsLoadFailed ??
        "Platform details could not be checked. Try again before exporting.",
      title: copy.errorTitle ?? "Error",
    });
    return undefined;
  }
  if (!validation.valid) {
    appService.showAlert({
      message: getPlatformDetailsValidationMessage(validation.code, copy),
      title: copy.warningTitle ?? "Warning",
    });
    return undefined;
  }

  if (applicationInfo.iconFileId) {
    try {
      const icon = await projectService.getFileContent(
        applicationInfo.iconFileId,
      );
      if (!icon) {
        throw new Error("Release icon not found");
      }
    } catch {
      appService.showAlert({
        message:
          copy.platformDetailsIconNotFound ??
          "The icon selected in Platform Details is no longer available. Update it before exporting.",
        title: copy.warningTitle ?? "Warning",
      });
      return undefined;
    }
  }

  return applicationInfo;
};

const logWindowsExportError = ({
  exportType,
  error,
  version,
  versionId,
  outputPath,
  windowsFileVersion,
  replay,
} = {}) => {
  console.error(`Version Windows ${exportType} export failed`, {
    errorMessage: getWindowsExportErrorMessage(error),
    versionId,
    versionName: version?.name,
    versionActionIndex: version?.actionIndex,
    outputPath,
    windowsFileVersion,
    replay,
    error,
  });
};

const WINDOWS_VERSION_PART_BASE = 65536;
const WINDOWS_VERSION_PART_MAX = 65535;
const WINDOWS_VERSION_ACTION_INDEX_MAX =
  WINDOWS_VERSION_PART_MAX * WINDOWS_VERSION_PART_BASE +
  WINDOWS_VERSION_PART_MAX;

const getWindowsFileVersion = ({ version } = {}) => {
  const actionIndex = Number(version?.actionIndex);
  if (
    !Number.isSafeInteger(actionIndex) ||
    actionIndex < 0 ||
    actionIndex > WINDOWS_VERSION_ACTION_INDEX_MAX
  ) {
    throw new Error(
      "Windows export requires a valid non-negative release action index.",
    );
  }

  return `1.0.${Math.floor(actionIndex / WINDOWS_VERSION_PART_BASE)}.${
    actionIndex % WINDOWS_VERSION_PART_BASE
  }`;
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

const createVersionExportData = async ({
  appService,
  applicationInfo,
  platform,
  projectService,
  version,
} = {}) => {
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

  const iconFileId = applicationInfo
    ? applicationInfo.iconFileId
    : projectInfo.iconFileId;
  if (iconFileId && !fileEntries.some((entry) => entry.fileId === iconFileId)) {
    fileEntries.push({
      fileId: iconFileId,
      mimeType: "image/png",
    });
  }

  const projectMetadata = {
    namespace: projectInfo.namespace,
    title: getProjectExportTitle({ projectInfo, applicationInfo }),
    iconFileId,
  };
  if (platform === "web") {
    projectMetadata.web = {
      shortName: applicationInfo.shortName,
      description: applicationInfo.description,
      themeColor:
        getPlatformDetailsColor(projectService, applicationInfo.themeColorId)
          ?.hex ?? "",
      backgroundColor:
        getPlatformDetailsColor(
          projectService,
          applicationInfo.backgroundColorId,
        )?.hex ?? "",
    };
  }

  const transformedData = createBundleInstructions({
    projectData: constructedProjectData,
    bundler: {
      appVersion: appService.getAppVersion(),
    },
    project: projectMetadata,
  });

  return {
    projectInfo,
    transformedData,
    fileEntries,
  };
};

export const handleBeforeMount = (deps) => {
  const { appService, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  store.setPlatform({ platform: appService.getPlatform() });
  store.setVisualTestMode({ enabled: isVisualTestMode() });
};

export const handleAfterMount = async (deps) => {
  await Promise.all([
    refreshWindowsExportAvailability(deps),
    refreshMacosExportAvailability(deps),
  ]);
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

const prepareExportConfirmation = async (
  deps,
  payload,
  { exportType, platform },
) => {
  const { store, render, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  payload._event.stopPropagation();
  const versionId = resolveVersionIdFromPayload(payload);
  const version = store.selectVersion(versionId);
  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound ?? "Version not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const applicationInfo = await requirePlatformDetailsForExport({
    appService,
    copy,
    platform,
    projectService,
  });
  if (!applicationInfo) {
    return;
  }

  store.closeDropdownMenu();
  store.setSelectedItemId({ itemId: versionId });
  store.openExportConfirmation({
    exportType,
    platform,
    versionId,
    versionName: version.name ?? "",
    applicationInfo,
    themeColor:
      platform === "web"
        ? getPlatformDetailsColorLabel(
            projectService,
            applicationInfo.themeColorId,
          )
        : "",
    backgroundColor:
      platform === "web"
        ? getPlatformDetailsColorLabel(
            projectService,
            applicationInfo.backgroundColorId,
          )
        : "",
  });
  render();
};

export const handleDownloadZipClick = (deps, payload) =>
  prepareExportConfirmation(deps, payload, {
    exportType: "web",
    platform: "web",
  });

export const handleDownloadWindowsExecutableClick = (deps, payload) =>
  prepareExportConfirmation(deps, payload, {
    exportType: "windows-executable",
    platform: "windows",
  });

export const handleDownloadWindowsInstallerClick = (deps, payload) =>
  prepareExportConfirmation(deps, payload, {
    exportType: "windows-installer",
    platform: "windows",
  });

export const handleDownloadMacosApplicationClick = (deps, payload) =>
  prepareExportConfirmation(deps, payload, {
    exportType: "macos-application",
    platform: "macos",
  });

export const handleExportConfirmationClose = (deps) => {
  const { store, render } = deps;
  store.closeExportConfirmation();
  render();
};

const runWebExport = async (deps, confirmation) => {
  const { store, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { versionId, applicationInfo } = confirmation;
  const projectId = appService.getPayload().p ?? "";
  const version = store.selectVersion(versionId);
  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound ?? "Version not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const zipName = getVersionZipName({
    appService,
    projectId,
    version,
    applicationName: applicationInfo.applicationName,
  });
  let outputPath;

  try {
    outputPath = await projectService.promptDistributionZipPath(zipName);
  } catch (error) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedOpenSaveDialog ?? "Failed to open save dialog: {message}",
        { message: getErrorMessage(error) },
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
    const { transformedData, fileEntries } = await createVersionExportData({
      appService,
      applicationInfo,
      platform: "web",
      projectService,
      version,
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
        copy.zipExportCompletedMessage ??
          "ZIP export completed.\nSaved to: {path}",
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
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(error)}`
        : formatI18nCopy(
            copy.failedSaveZipFile ?? "Failed to save ZIP file: {message}",
            { message: getErrorMessage(error) },
          ),
      title: copy.errorTitle ?? "Error",
    });
  }
};

const runWindowsExecutableExport = async (deps, confirmation) => {
  const { store, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { versionId, applicationInfo } = confirmation;
  const projectId = appService.getPayload().p ?? "";
  const version = store.selectVersion(versionId);
  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound ?? "Version not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  let windowsFileVersion;
  try {
    windowsFileVersion = getWindowsFileVersion({ version });
  } catch (error) {
    appService.showAlert({
      message: formatWindowsExportErrorCopy({
        template:
          copy.failedSaveWindowsExecutable ??
          "Failed to save Windows executable: {message}",
        error,
      }),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const exeName = getVersionZipName({
    appService,
    projectId,
    version,
    applicationName: applicationInfo.applicationName,
  });
  let outputPath;

  try {
    outputPath = await projectService.promptWindowsExecutablePath(exeName);
  } catch (error) {
    logWindowsExportError({
      exportType: "executable save dialog",
      error,
      version,
      versionId,
      windowsFileVersion,
    });
    appService.showAlert({
      message: formatWindowsExportErrorCopy({
        template:
          copy.failedOpenSaveDialog ?? "Failed to open save dialog: {message}",
        error,
      }),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  if (outputPath === null) {
    appService.closeAll();
    return;
  }

  const progressDialog = appService.showProgressDialog({
    message:
      copy.windowsExecutableInProgressMessage ??
      "Please wait while the Windows executable is being created...",
    status: copy.windowsExecutableProgressStatus ?? "Creating executable...",
    title:
      copy.windowsExecutableInProgressTitle ?? "Windows export in progress",
  });

  try {
    const { projectInfo, transformedData, fileEntries } =
      await createVersionExportData({
        appService,
        applicationInfo,
        projectService,
        version,
      });
    const result = await projectService.createWindowsPortableExecutableToPath(
      transformedData,
      fileEntries,
      outputPath,
      {
        title: getProjectExportTitle({ projectInfo, applicationInfo }),
        version: windowsFileVersion,
        applicationIdentifier: applicationInfo.applicationIdentifier,
        publisher: applicationInfo.publisher,
        description: applicationInfo.description,
        copyright: applicationInfo.copyright,
        iconFileId: applicationInfo.iconFileId,
      },
    );
    const savedPath = result?.outputPath ?? outputPath;

    progressDialog.close();
    appService.showAlert({
      message: formatI18nCopy(
        copy.windowsExecutableExportCompletedMessage ??
          "Windows executable export completed.\nSaved to: {path}",
        { path: savedPath },
      ),
      title: copy.exportCompletedTitle ?? "Export completed",
    });
  } catch (error) {
    progressDialog.close();
    const replay = error?.details?.replay;

    logWindowsExportError({
      exportType: "executable",
      error,
      version,
      versionId,
      outputPath,
      windowsFileVersion,
      replay,
    });

    appService.showAlert({
      message: replay
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(error)}`
        : formatWindowsExportErrorCopy({
            template:
              copy.failedSaveWindowsExecutable ??
              "Failed to save Windows executable: {message}",
            error,
          }),
      title: copy.errorTitle ?? "Error",
    });
  }
};

const runWindowsInstallerExport = async (deps, confirmation) => {
  const { store, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { versionId, applicationInfo } = confirmation;
  const projectId = appService.getPayload().p ?? "";
  const version = store.selectVersion(versionId);
  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound ?? "Version not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  let windowsFileVersion;
  try {
    windowsFileVersion = getWindowsFileVersion({ version });
  } catch (error) {
    appService.showAlert({
      message: formatWindowsExportErrorCopy({
        template:
          copy.failedSaveWindowsInstaller ??
          "Failed to save Windows installer: {message}",
        error,
      }),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const installerName = getVersionZipName({
    appService,
    projectId,
    version,
    applicationName: applicationInfo.applicationName,
  });
  let outputPath;

  try {
    outputPath = await projectService.promptWindowsInstallerPath(installerName);
  } catch (error) {
    logWindowsExportError({
      exportType: "installer save dialog",
      error,
      version,
      versionId,
      windowsFileVersion,
    });
    appService.showAlert({
      message: formatWindowsExportErrorCopy({
        template:
          copy.failedOpenSaveDialog ?? "Failed to open save dialog: {message}",
        error,
      }),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  if (outputPath === null) {
    appService.closeAll();
    return;
  }

  const progressDialog = appService.showProgressDialog({
    message:
      copy.windowsInstallerInProgressMessage ??
      "Please wait while the Windows installer is being created...",
    status: copy.windowsInstallerProgressStatus ?? "Creating installer...",
    title: copy.windowsInstallerInProgressTitle ?? "Windows installer export",
  });

  try {
    const { projectInfo, transformedData, fileEntries } =
      await createVersionExportData({
        appService,
        applicationInfo,
        projectService,
        version,
      });
    const result = await projectService.createWindowsInstallerToPath(
      transformedData,
      fileEntries,
      outputPath,
      {
        title: getProjectExportTitle({ projectInfo, applicationInfo }),
        version: windowsFileVersion,
        applicationIdentifier: applicationInfo.applicationIdentifier,
        publisher: applicationInfo.publisher,
        description: applicationInfo.description,
        copyright: applicationInfo.copyright,
        iconFileId: applicationInfo.iconFileId,
      },
    );
    const savedPath = result?.outputPath ?? outputPath;

    progressDialog.close();
    appService.showAlert({
      message: formatI18nCopy(
        copy.windowsInstallerExportCompletedMessage ??
          "Windows installer export completed.\nSaved to: {path}",
        { path: savedPath },
      ),
      title: copy.exportCompletedTitle ?? "Export completed",
    });
  } catch (error) {
    progressDialog.close();
    const replay = error?.details?.replay;

    logWindowsExportError({
      exportType: "installer",
      error,
      version,
      versionId,
      outputPath,
      windowsFileVersion,
      replay,
    });

    appService.showAlert({
      message: replay
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(error)}`
        : formatWindowsExportErrorCopy({
            template:
              copy.failedSaveWindowsInstaller ??
              "Failed to save Windows installer: {message}",
            error,
          }),
      title: copy.errorTitle ?? "Error",
    });
  }
};

const runMacosApplicationExport = async (deps, confirmation) => {
  const { store, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { versionId, applicationInfo } = confirmation;
  const projectId = appService.getPayload().p ?? "";
  const version = store.selectVersion(versionId);
  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound ?? "Version not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  let availability;
  try {
    availability = await projectService.getMacosExportAvailability();
  } catch (error) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedSaveMacosApplication ??
          "Failed to save macOS application: {message}",
        { message: getMacosExportErrorMessage(error) },
      ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  if (!availability.application) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedSaveMacosApplication ??
          "Failed to save macOS application: {message}",
        { message: getMacosExportUnavailableMessage(availability) },
      ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  let nativeVersion;
  try {
    nativeVersion = createMacosNativeVersion(version.actionIndex);
  } catch (error) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedSaveMacosApplication ??
          "Failed to save macOS application: {message}",
        { message: getMacosExportErrorMessage(error) },
      ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const applicationName = getVersionZipName({
    appService,
    projectId,
    version,
    applicationName: applicationInfo.applicationName,
  });
  let outputPath;
  try {
    outputPath =
      await projectService.promptMacosApplicationPath(applicationName);
  } catch (error) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedOpenSaveDialog ?? "Failed to open save dialog: {message}",
        { message: getMacosExportErrorMessage(error) },
      ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  if (outputPath === null) {
    appService.closeAll();
    return;
  }

  const progressDialog = appService.showProgressDialog({
    message:
      copy.macosApplicationInProgressMessage ??
      "Please wait while the macOS application is being created...",
    title: copy.macosApplicationInProgressTitle ?? "macOS export in progress",
  });

  try {
    const { projectInfo, transformedData, fileEntries } =
      await createVersionExportData({
        appService,
        applicationInfo,
        projectService,
        version,
      });
    const result = await projectService.createMacosApplicationToPath(
      transformedData,
      fileEntries,
      outputPath,
      {
        title: getProjectExportTitle({ projectInfo, applicationInfo }),
        shortVersion: nativeVersion.shortVersion,
        bundleVersion: nativeVersion.bundleVersion,
        applicationIdentifier: projectInfo.nativeApplicationIdentifier,
        publisher: applicationInfo.publisher,
        description: applicationInfo.description,
        copyright: applicationInfo.copyright,
        category: applicationInfo.category,
        iconFileId: applicationInfo.iconFileId,
      },
    );
    const savedPath = result?.outputPath ?? outputPath;
    progressDialog.close();
    appService.showAlert({
      message: formatI18nCopy(
        copy.macosApplicationExportCompletedMessage ??
          "macOS application export completed.\nSaved to: {path}",
        { path: savedPath },
      ),
      title: copy.exportCompletedTitle ?? "Export completed",
    });
  } catch (error) {
    progressDialog.close();
    const replay = error?.details?.replay;
    console.error("Version macOS application export failed", {
      errorMessage: getMacosExportErrorMessage(error),
      versionId,
      versionName: version.name,
      versionActionIndex: version.actionIndex,
      outputPath,
      shortVersion: nativeVersion.shortVersion,
      bundleVersion: nativeVersion.bundleVersion,
      replay,
      error,
    });
    appService.showAlert({
      message: replay
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(error)}`
        : formatI18nCopy(
            copy.failedSaveMacosApplication ??
              "Failed to save macOS application: {message}",
            { message: getMacosExportErrorMessage(error) },
          ),
      title: copy.errorTitle ?? "Error",
    });
  }
};

export const handleExportConfirmationConfirm = async (deps) => {
  const { store, render } = deps;
  const confirmation = store.selectExportConfirmation();
  store.closeExportConfirmation();
  render();

  if (confirmation.exportType === "web") {
    await runWebExport(deps, confirmation);
    return;
  }
  if (confirmation.exportType === "windows-executable") {
    await runWindowsExecutableExport(deps, confirmation);
    return;
  }
  if (confirmation.exportType === "windows-installer") {
    await runWindowsInstallerExport(deps, confirmation);
    return;
  }
  if (confirmation.exportType === "macos-application") {
    await runMacosApplicationExport(deps, confirmation);
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
