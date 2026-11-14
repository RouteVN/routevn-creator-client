import { withErrorDetails } from "../../internal/errorDetails.js";
import {
  createAndroidApkFileName,
  createAndroidBundleFileName,
} from "../../internal/androidExport.js";
import {
  createIosIpaFileName,
  IOS_XCODE_DOWNLOAD_URL,
  isValidIosBuildNumber,
  isValidIosTeamId,
  isValidIosVersion,
  pickIosTeamId,
} from "../../internal/iosExport.js";
import { generateId } from "../../internal/id.js";
import { formatElapsedSeconds, formatList } from "../../internal/dates.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { normalizeExportFileMimeType } from "../../internal/bundleRuntimeAssets.js";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
  constructProjectData,
} from "../../internal/project/projection.js";
import { createBundleInstructions } from "../../deps/services/shared/projectExportService.js";
import { selectVersionsPageCopy } from "./support/versionsPageCopy.js";
import {
  formatAndroidApkExportProgress,
  getAndroidApkExportStepForPhase,
  getAndroidApkExportStepLabels,
  getAndroidApkExportSteps,
} from "./support/androidApkExportSteps.js";
import {
  getIosExportErrorMessage,
  getIosExportStepForPhase,
  getIosExportStepLabels,
  getIosExportSteps,
  withIosExportErrorDetails,
} from "./support/iosExportSteps.js";
import { openExportStepsProgress } from "./support/exportStepsProgress.js";
import { sanitizeArtifactFileName } from "../../internal/artifactFileName.js";
import {
  createAndroidNativeVersion,
  isValidAndroidVersionCode,
  createMacosNativeVersion,
  isValidNativeApplicationVersion,
  isValidMacosBuildNumber,
} from "../../internal/nativeApplicationVersion.js";
import { isVisualTestMode } from "../../internal/visualTestMode.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
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
  const { store, render, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { p: projectId } = appService.getPayload();

  try {
    await projectService.ensureRepository();
    const versions = await projectService.loadVersionsFromProject(projectId);

    store.setVersions({ versions });
  } catch {
    store.setVersionsLoading({ loading: false });
    appService.showToast({
      message: copy.failedLoadVersions ?? "Failed to load versions.",
    });
  }
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

const refreshAndroidExportAvailability = async (deps) => {
  const { store, projectService } = deps;
  try {
    store.setAndroidExportAvailability({
      availability: await projectService.getAndroidExportAvailability(),
    });
  } catch {
    store.setAndroidExportAvailability({ availability: { available: false } });
  }
};

const refreshIosExportAvailability = async (deps) => {
  const { store, projectService } = deps;
  try {
    store.setIosExportAvailability({
      availability: await projectService.getIosExportAvailability(),
    });
  } catch {
    store.setIosExportAvailability({ availability: { available: false } });
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

  return sanitizeArtifactFileName(
    `${projectName}_${version?.name ?? "version"}`,
  );
};

const getProjectExportTitle = ({ projectInfo, applicationInfo } = {}) => {
  return (
    applicationInfo?.applicationName?.trim() || projectInfo?.name?.trim?.()
  );
};

const WINDOWS_EXPORT_COMMAND_RESTART_MESSAGE =
  "The running Tauri shell does not include Windows export commands. Restart the Tauri dev process so the native shell rebuilds.";
const MACOS_EXPORT_COMMAND_RESTART_MESSAGE =
  "The running Tauri shell does not include the macOS export command. Restart the Tauri dev process so the native shell rebuilds.";

// The error's own text, or the localized unknown-error text when it has none.
const getErrorMessage = (error, copy) => {
  const fallback = copy.unknownErrorDetails;
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

const getWindowsExportErrorMessage = (error, copy) => {
  const message = getErrorMessage(error, copy);
  if (
    /^Command export_windows_(portable_executable|installer_from_project) not found$/.test(
      message,
    )
  ) {
    return `${message}. ${WINDOWS_EXPORT_COMMAND_RESTART_MESSAGE}`;
  }

  return message;
};

const getMacosExportErrorMessage = (error, copy) => {
  const message = getErrorMessage(error, copy);
  if (
    /^Command (get_macos_export_host_capabilities|export_macos_application) not found$/.test(
      message,
    )
  ) {
    return `${message}. ${MACOS_EXPORT_COMMAND_RESTART_MESSAGE}`;
  }
  return message;
};

const getMacosExportUnavailableMessage = (
  availability = {},
  copy = {},
  dateTime = {},
) => {
  if (!availability.hostSupported) {
    return (
      copy.macosExportHostUnsupported ??
      "macOS application export is supported only on macOS."
    );
  }

  if (availability.capabilityCheckError) {
    return getMacosExportErrorMessage(availability.capabilityCheckError, copy);
  }

  if (availability.templateCheckError) {
    return formatI18nCopy(
      copy.macosTemplateCheckFailed ??
        "Unable to verify the bundled macOS player template: {message}",
      { message: availability.templateCheckError },
    );
  }

  if (!availability.templateAvailable) {
    return (
      copy.macosTemplateMissing ??
      "The macOS player template is not bundled with this Creator build."
    );
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
    return formatI18nCopy(
      copy.macosToolsMissing ??
        "macOS application export requires these system tools: {tools}.",
      { tools: formatList(missingTools, dateTime) },
    );
  }

  return (
    copy.macosExportUnavailable ??
    "macOS application export is not available in this Creator build."
  );
};

const formatWindowsExportErrorCopy = ({ template, error, copy }) =>
  formatI18nCopy(template, {
    message: getWindowsExportErrorMessage(error, copy),
  });

const getPlatformDetailsValidationMessage = (code, copy) => {
  if (code === "application-name-required") {
    return (
      copy.platformDetailsApplicationNameRequired ??
      "Application name is required in Platform Details before export."
    );
  }
  if (code === "windows-icon-required") {
    return (
      copy.platformDetailsWindowsIconRequired ??
      "Add a Windows application icon in Platform Details before exporting."
    );
  }
  if (code === "macos-icon-required") {
    return (
      copy.platformDetailsMacosIconRequired ??
      "Add a macOS application icon in Platform Details before exporting."
    );
  }
  if (code === "web-identifier-required") {
    return (
      copy.platformDetailsWebIdentifierRequired ??
      "Add a Web application identifier before exporting."
    );
  }
  if (code === "web-identifier-invalid") {
    return (
      copy.platformDetailsWebIdentifierInvalid ??
      "The Web application identifier is invalid. Update it before exporting."
    );
  }
  if (code === "windows-identifier-required") {
    return (
      copy.platformDetailsWindowsIdentifierRequired ??
      "Add a Windows application identifier in Platform Details before exporting."
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
  if (code === "android-icon-required")
    return copy.platformDetailsAndroidIconRequired;
  if (code === "android-identifier-required")
    return copy.platformDetailsAndroidIdentifierRequired;
  if (code === "android-identifier-invalid")
    return copy.platformDetailsAndroidIdentifierInvalid;
  if (code === "android-color-invalid")
    return copy.platformDetailsAndroidColorInvalid;
  if (code === "ios-icon-required") return copy.platformDetailsIosIconRequired;
  if (code === "ios-identifier-required")
    return copy.platformDetailsIosIdentifierRequired;
  if (code === "ios-identifier-invalid")
    return copy.platformDetailsIosIdentifierInvalid;
  return copy.platformDetailsLoadFailed ?? "Platform details are invalid.";
};

const requirePlatformDetailsForExport = async ({
  appService,
  copy,
  onMissing,
  platform,
  projectService,
} = {}) => {
  let applicationInfo;
  try {
    applicationInfo = await projectService.getCurrentPlatformDetails(platform);
    if (platform === "web" && applicationInfo) {
      const projectInfo = await projectService.getCurrentProjectInfo();
      // TODO: Restore Web-specific icon overrides if separate Web branding
      // returns. Web currently uses the project-owned icon.
      applicationInfo = {
        ...applicationInfo,
        iconFileId: projectInfo.iconFileId,
      };
    }
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
    await onMissing();
    return undefined;
  }

  let validation;
  try {
    validation = validatePlatformDetails({
      platform,
      applicationInfo,
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
    let icon;
    try {
      icon = await projectService.getFileContent(applicationInfo.iconFileId);
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
    } finally {
      icon?.revoke?.();
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
  copy,
} = {}) => {
  console.error(`Version Windows ${exportType} export failed`, {
    errorMessage: getWindowsExportErrorMessage(error, copy),
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

  const usesProjectIcon = platform === "web";
  const iconFileId = usesProjectIcon
    ? projectInfo.iconFileId
    : (applicationInfo?.iconFileId ?? projectInfo.iconFileId);
  if (iconFileId && !fileEntries.some((entry) => entry.fileId === iconFileId)) {
    fileEntries.push({
      fileId: iconFileId,
      mimeType: "image/png",
    });
  }

  const projectMetadata = {
    namespace:
      platform === "web"
        ? applicationInfo.applicationIdentifier
        : projectInfo.namespace,
    title:
      platform === "web"
        ? applicationInfo.applicationName.trim()
        : getProjectExportTitle({ projectInfo, applicationInfo }),
    iconFileId,
  };
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
  const { appService, projectService, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  store.setPlatform({ platform: appService.getPlatform() });
  store.setVisualTestMode({ enabled: isVisualTestMode() });

  const { p: projectId } = appService.getPayload();
  const cachedVersions = projectService.getCachedVersions(projectId);
  if (cachedVersions !== undefined) {
    store.setVersions({ versions: cachedVersions });
  }
  return mountMobileResourceWindowLayout(deps);
};

export const handleAfterMount = async (deps) => {
  await Promise.all([
    refreshWindowsExportAvailability(deps),
    refreshMacosExportAvailability(deps),
    refreshAndroidExportAvailability(deps),
    refreshIosExportAvailability(deps),
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

const openPlatformDetailsDialog = async (
  deps,
  { exportType, platform, versionId },
) => {
  const { appService, i18n, projectService, render, store } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const confirmed = await appService.showDialog({
    title: copy.platformDetailsSetupTitle,
    message: copy.platformDetailsSetupMessage,
    confirmText: copy.platformDetailsSetupContinue,
    cancelText: copy.cancelButton,
  });
  if (!confirmed) {
    return;
  }

  let applicationInfo;
  try {
    applicationInfo =
      await projectService.getCurrentPlatformDetailsDefaults(platform);
  } catch {
    appService.showAlert({
      message:
        copy.platformDetailsLoadFailed ??
        "Platform details could not be checked. Try again before exporting.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  store.closeDropdownMenu();
  store.openPlatformDetailsDialog({
    exportType,
    platform,
    versionId,
    applicationInfo,
  });
  render();
};

// Opening an export can wait on slow checks, such as Xcode's. Export clicks
// during that wait are ignored, so a late dialog cannot replace a newer one.
const startExportConfirmation = async (deps, request) => {
  const { store } = deps;
  if (store.selectExportConfirmationPending()) return;
  store.setExportConfirmationPending({ pending: true });
  try {
    await checkAndOpenExportConfirmation(deps, request);
  } finally {
    store.setExportConfirmationPending({ pending: false });
  }
};

const checkAndOpenExportConfirmation = async (
  deps,
  { exportType, platform, versionId },
) => {
  const { store, refs, render, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
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
    onMissing: () =>
      openPlatformDetailsDialog(deps, { exportType, platform, versionId }),
    platform,
    projectService,
  });
  if (!applicationInfo) {
    return;
  }
  if (exportType === "android-apk" && !(await loadAndroidSigningStatus(deps))) {
    return;
  }
  if (exportType === "ios-application" && !(await loadIosExportOptions(deps))) {
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
  });
  render();

  if (exportType === "android-apk") {
    const { androidExportForm } = refs;
    androidExportForm.reset();
    androidExportForm.setValues({
      values: {
        version: isValidNativeApplicationVersion(version.name)
          ? version.name
          : "",
        buildNumber: "",
        format: "apk",
        signing: "signed",
      },
    });
  }

  if (exportType === "macos-application") {
    const { macosExportForm } = refs;
    macosExportForm.reset();
    macosExportForm.setValues({
      values: {
        version: isValidNativeApplicationVersion(version?.name)
          ? version.name
          : "",
        buildNumber: "",
      },
    });
  }

  if (exportType === "ios-application") {
    const { iosExportForm } = refs;
    const { teams } = store.selectIosExportOptions();
    // Without teams from Xcode, the creator types the team ID.
    const teamId =
      teams.length > 0
        ? pickIosTeamId(teams, applicationInfo.teamId)
        : (applicationInfo.teamId ?? "");
    // A Personal Team makes development builds only.
    const personalTeam = teams.some((team) => team.id === teamId && team.free);
    iosExportForm.reset();
    iosExportForm.setValues({
      values: {
        version: isValidIosVersion(version.name) ? version.name : "",
        buildNumber: "",
        teamId,
        distribution: personalTeam ? "development" : "appStore",
        upload: false,
      },
    });
  }
};

// Explains what this Mac needs before it can export for iOS.
const showXcodeSetupDialog = async (deps, xcode) => {
  const { appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  if (xcode.status === "notInstalled" || xcode.status === "outdated") {
    const confirmed = await appService.showDialog({
      title: copy.iosXcodeRequiredTitle,
      message: formatI18nCopy(
        xcode.status === "notInstalled"
          ? copy.iosXcodeNotInstalledMessage
          : copy.iosXcodeOutdatedMessage,
        { minimum: xcode.minimumVersion, version: xcode.version },
      ),
      confirmText: copy.iosGetXcodeButton,
      cancelText: copy.cancelButton,
    });
    if (confirmed) {
      await appService.openUrl(IOS_XCODE_DOWNLOAD_URL);
    }
    return;
  }
  appService.showAlert({
    title: copy.iosXcodeRequiredTitle,
    message:
      xcode.status === "iosPlatformMissing"
        ? copy.iosPlatformMissingMessage
        : xcode.status === "needsSetup"
          ? copy.iosXcodeSetupMessage
          : copy.iosXcodeNotReady,
  });
};

// Checks Xcode and reads the Apple teams and connected devices the iOS
// export dialog offers. Both load at once. Devices only feed the optional
// install, so a failed listing offers none instead of stopping the export.
const loadIosExportOptions = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const [requirementsResult, devicesResult] = await Promise.allSettled([
    projectService.getIosExportRequirements(),
    projectService.listIosDevices(),
  ]);
  if (requirementsResult.status === "rejected") {
    appService.showAlert({
      message: withErrorDetails(
        copy.iosRequirementsFailed,
        requirementsResult.reason,
        copy.errorDetailsLabel,
      ),
      title: copy.errorTitle,
    });
    return false;
  }
  const requirements = requirementsResult.value;
  if (requirements.xcode.status !== "ready") {
    await showXcodeSetupDialog(deps, requirements.xcode);
    return false;
  }
  let devices = [];
  if (devicesResult.status === "fulfilled") {
    devices = devicesResult.value.filter((device) => device.available);
  } else {
    appService.showToast({ message: copy.iosDevicesFailed });
  }
  store.setIosExportOptions({ teams: requirements.teams, devices });
  return true;
};

// Whether this host signs and the project's current key, read before the
// Android export dialog renders.
const loadAndroidSigningStatus = async (deps) => {
  const { store, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  if (!projectService.supportsAndroidSigning()) {
    store.setAndroidSigningStatus({ supported: false });
    return true;
  }
  try {
    const { currentKey } = await projectService.getAndroidSigningSummary();
    store.setAndroidSigningStatus({
      supported: true,
      currentKey: currentKey?.certificateSha256,
    });
    return true;
  } catch (error) {
    appService.showAlert({
      message: withErrorDetails(
        copy.androidSigningStatusFailed,
        error,
        copy.errorDetailsLabel,
      ),
      title: copy.errorTitle,
    });
    return false;
  }
};

const prepareExportConfirmation = (deps, payload, { exportType, platform }) => {
  payload._event.stopPropagation();
  return startExportConfirmation(deps, {
    exportType,
    platform,
    versionId: resolveVersionIdFromPayload(payload),
  });
};

export const handlePlatformDetailsDialogClose = (deps) => {
  const { store, render } = deps;
  store.closePlatformDetailsDialog();
  render();
};

export const handlePlatformDetailsCreated = (deps) => {
  const { store, render } = deps;
  const { exportType, platform, versionId } =
    store.selectPlatformDetailsDialog();
  store.closePlatformDetailsDialog();
  render();

  return startExportConfirmation(deps, { exportType, platform, versionId });
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

export const handleDownloadAndroidApkClick = (deps, payload) =>
  prepareExportConfirmation(deps, payload, {
    exportType: "android-apk",
    platform: "android",
  });

export const handleDownloadMacosApplicationClick = (deps, payload) =>
  prepareExportConfirmation(deps, payload, {
    exportType: "macos-application",
    platform: "macos",
  });

export const handleDownloadIosApplicationClick = (deps, payload) =>
  prepareExportConfirmation(deps, payload, {
    exportType: "ios-application",
    platform: "ios",
  });

export const handleExportConfirmationClose = (deps) => {
  const { store, render } = deps;
  store.closeExportConfirmation();
  render();
};

// Whole kilobytes below 1 MB, then megabytes with one decimal, formatted with
// the `dateTime` catalog of the active locale.
// Formats for the numbers a running export step shows.
const createExportProgressFormats = (i18n) => {
  const countFormat = new Intl.NumberFormat(
    i18n.dateTime?.intlLocale ?? "en-US",
  );
  return {
    formatBytes: (value) => formatBundleByteCount(value, i18n.dateTime),
    formatCount: (value) => countFormat.format(value),
  };
};

const formatBundleByteCount = (value, dateTime = {}) => {
  const {
    intlLocale = "en-US",
    fileSizeKilobytes = "{value} KB",
    fileSizeMegabytes = "{value} MB",
  } = dateTime;
  const bytes = Number(value) || 0;
  if (bytes < 1024 * 1024) {
    const kilobytes = new Intl.NumberFormat(intlLocale, {
      maximumFractionDigits: 0,
    }).format(bytes / 1024);
    return fileSizeKilobytes.replaceAll("{value}", () => kilobytes);
  }
  const megabytes = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024));
  return fileSizeMegabytes.replaceAll("{value}", () => megabytes);
};

const formatBundleElapsedTime = (value, dateTime) => {
  const elapsedSeconds = Math.floor((Number(value) || 0) / 1000);
  if (elapsedSeconds < 1) {
    return "";
  }
  return formatElapsedSeconds(elapsedSeconds, dateTime);
};

const createBundleProgressView = ({ copy, dateTime, progress } = {}) => {
  const current = Math.max(0, Number(progress?.current) || 0);
  const total = Math.max(0, Number(progress?.total) || 0);
  const determinateProgress = total > 0 ? { current, total } : {};
  const withElapsedTime = (status) => {
    const elapsed = formatBundleElapsedTime(progress?.elapsedMs, dateTime);
    if (!elapsed) {
      return status;
    }
    return formatI18nCopy(copy.bundleElapsedStatus ?? "{status} · {elapsed}", {
      status,
      elapsed,
    });
  };

  if (progress?.phase === "scanAssets") {
    return {
      status: withElapsedTime(
        formatI18nCopy(
          copy.bundleScanningAssetsStatus ??
            "Scanning assets... {current} / {total}",
          { current, total },
        ),
      ),
      progress: determinateProgress,
    };
  }

  if (progress?.phase === "optimizeImages") {
    return {
      status: withElapsedTime(
        formatI18nCopy(
          copy.bundleOptimizingImagesStatus ??
            "Optimizing images... {current} / {total}",
          { current, total },
        ),
      ),
      progress: determinateProgress,
    };
  }

  if (progress?.phase === "writePackage") {
    return {
      status: withElapsedTime(
        formatI18nCopy(
          copy.bundleWritingPackageStatus ??
            "Writing package... {current} / {total}",
          {
            current: formatBundleByteCount(current, dateTime),
            total: formatBundleByteCount(total, dateTime),
          },
        ),
      ),
      progress: determinateProgress,
    };
  }

  if (progress?.phase === "finalize") {
    return {
      status: withElapsedTime(
        copy.bundleFinalizingStatus ?? "Finalizing ZIP...",
      ),
      progress: {},
    };
  }

  return {
    status: copy.bundlePreparingProjectStatus ?? "Preparing project data...",
    progress: {},
  };
};

const createMacosApplicationProgressView = ({
  copy,
  dateTime,
  progress,
} = {}) => {
  const statusByPhase = {
    prepareApplication:
      copy.macosPreparingApplicationStatus ?? "Preparing application...",
    encryptPayload:
      copy.macosEncryptingPayloadStatus ?? "Encrypting package...",
    signApplication:
      copy.macosSigningApplicationStatus ?? "Signing application...",
    verifyApplication:
      copy.macosVerifyingApplicationStatus ?? "Verifying application...",
    archiveApplication:
      copy.macosArchivingApplicationStatus ?? "Archiving application...",
    verifyArchive:
      copy.macosVerifyingArchiveStatus ?? "Verifying application archive...",
    finalizeApplication:
      copy.macosFinalizingApplicationStatus ?? "Finalizing application...",
  };
  const status = statusByPhase[progress?.phase];
  if (!status) {
    return createBundleProgressView({ copy, dateTime, progress });
  }

  const elapsed = formatBundleElapsedTime(progress?.elapsedMs, dateTime);
  return {
    status: elapsed
      ? formatI18nCopy(copy.bundleElapsedStatus ?? "{status} · {elapsed}", {
          status,
          elapsed,
        })
      : status,
    progress: {},
  };
};

const createWindowsExecutableProgressView = ({
  copy,
  dateTime,
  progress,
} = {}) => {
  const statusByPhase = {
    prepareExecutable:
      copy.windowsPreparingExecutableStatus ?? "Preparing executable...",
    encryptPayload:
      copy.windowsEncryptingPayloadStatus ??
      "Encrypting application payload...",
    finalizeExecutable:
      copy.windowsFinalizingExecutableStatus ?? "Finalizing executable...",
  };
  const status = statusByPhase[progress?.phase];
  if (!status) {
    return createBundleProgressView({ copy, dateTime, progress });
  }

  const elapsed = formatBundleElapsedTime(progress?.elapsedMs, dateTime);
  return {
    status: elapsed
      ? formatI18nCopy(copy.bundleElapsedStatus ?? "{status} · {elapsed}", {
          status,
          elapsed,
        })
      : status,
    progress: {},
  };
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
    outputPath = await projectService.promptDistributionZipPath(zipName, {
      title: copy.saveZipDialogTitle,
      fileTypeName: copy.zipFileTypeName,
    });
  } catch (error) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedOpenSaveDialog ?? "Failed to open save dialog: {message}",
        { message: getErrorMessage(error, copy) },
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
      copy.bundleInProgressMessage ??
      "Please wait while the bundle is being created...",
    title: copy.bundleInProgressTitle ?? "Bundle in progress",
    status: copy.bundlePreparingProjectStatus ?? "Preparing project data...",
    progress: {},
  });
  await progressDialog.waitForPaint();

  let savedPath;
  let exportError;
  try {
    const { transformedData, fileEntries } = await createVersionExportData({
      appService,
      applicationInfo,
      platform: "web",
      projectService,
      version,
    });
    const exportOptions = {
      onProgress: (progress) => {
        progressDialog.update(
          createBundleProgressView({ copy, dateTime: i18n.dateTime, progress }),
        );
      },
      webScreens: {
        loadingBackgroundFileId: applicationInfo.loadingBackgroundFileId,
        startBackgroundFileId: applicationInfo.startBackgroundFileId,
        loadingFadeDuration: applicationInfo.loadingFadeDuration,
        startFadeDuration: applicationInfo.startFadeDuration,
      },
    };
    savedPath = outputPath
      ? await projectService.createDistributionZipStreamedToPath(
          transformedData,
          fileEntries,
          outputPath,
          exportOptions,
        )
      : await projectService.createDistributionZipStreamed(
          transformedData,
          fileEntries,
          zipName,
          exportOptions,
        );
  } catch (error) {
    exportError = error;
  } finally {
    progressDialog.close();
  }

  if (exportError) {
    if (outputPath && appService.getPlatform() === "android") {
      try {
        await appService.discardPendingSaveDocument(outputPath);
      } catch (cleanupError) {
        const combinedError = new Error(
          `${getErrorMessage(exportError, copy)} ${getErrorMessage(cleanupError, copy)}`,
          { cause: exportError },
        );
        combinedError.details = exportError?.details;
        exportError = combinedError;
      }
    }
    const replay = exportError?.details?.replay;
    if (replay) {
      console.error("Version export history replay failed", {
        versionId,
        versionName: version?.name,
        versionActionIndex: version?.actionIndex,
        replay,
        error: exportError,
      });
    }

    appService.showAlert({
      message: replay
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(exportError, copy)}`
        : formatI18nCopy(
            copy.failedSaveZipFile ?? "Failed to save ZIP file: {message}",
            { message: getErrorMessage(exportError, copy) },
          ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  if (!savedPath) {
    appService.closeAll();
    return;
  }

  appService.showAlert({
    message: formatI18nCopy(
      copy.zipExportCompletedMessage ??
        "ZIP export completed.\nSaved to: {path}",
      { path: appService.getFileDisplayPath(savedPath) },
    ),
    title: copy.exportCompletedTitle ?? "Export completed",
  });
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
        copy,
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
    outputPath = await projectService.promptWindowsExecutablePath(exeName, {
      title: copy.saveWindowsExecutableDialogTitle,
      fileTypeName: copy.windowsExecutableFileTypeName,
    });
  } catch (error) {
    logWindowsExportError({
      copy,
      exportType: "executable save dialog",
      error,
      version,
      versionId,
      windowsFileVersion,
    });
    appService.showAlert({
      message: formatWindowsExportErrorCopy({
        copy,
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
    progress: {},
  });
  await progressDialog.waitForPaint();

  try {
    const { projectInfo, transformedData, fileEntries } =
      await createVersionExportData({
        appService,
        applicationInfo,
        projectService,
        version,
      });
    const exportOptions = {
      onProgress: (progress) => {
        progressDialog.update(
          createWindowsExecutableProgressView({
            copy,
            dateTime: i18n.dateTime,
            progress,
          }),
        );
      },
    };
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
      exportOptions,
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
      copy,
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
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(error, copy)}`
        : formatWindowsExportErrorCopy({
            copy,
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
        copy,
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
    outputPath = await projectService.promptWindowsInstallerPath(
      installerName,
      {
        title: copy.saveWindowsInstallerDialogTitle,
        fileTypeName: copy.windowsInstallerFileTypeName,
      },
    );
  } catch (error) {
    logWindowsExportError({
      copy,
      exportType: "installer save dialog",
      error,
      version,
      versionId,
      windowsFileVersion,
    });
    appService.showAlert({
      message: formatWindowsExportErrorCopy({
        copy,
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
      copy,
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
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(error, copy)}`
        : formatWindowsExportErrorCopy({
            copy,
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
  const { versionId, applicationInfo, nativeVersion } = confirmation;
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
        { message: getMacosExportErrorMessage(error, copy) },
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
        {
          message: getMacosExportUnavailableMessage(
            availability,
            copy,
            i18n.dateTime,
          ),
        },
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
    outputPath = await projectService.promptMacosApplicationPath(
      applicationName,
      {
        title: copy.saveMacosApplicationDialogTitle,
        fileTypeName: copy.macosApplicationFileTypeName,
      },
    );
  } catch (error) {
    appService.showAlert({
      message: formatI18nCopy(
        copy.failedOpenSaveDialog ?? "Failed to open save dialog: {message}",
        { message: getMacosExportErrorMessage(error, copy) },
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
    status: copy.bundlePreparingProjectStatus ?? "Preparing project data...",
    progress: {},
  });
  await progressDialog.waitForPaint();

  try {
    const { projectInfo, transformedData, fileEntries } =
      await createVersionExportData({
        appService,
        applicationInfo,
        projectService,
        version,
      });
    const exportOptions = {
      onProgress: (progress) => {
        progressDialog.update(
          createMacosApplicationProgressView({
            copy,
            dateTime: i18n.dateTime,
            progress,
          }),
        );
      },
    };
    const result = await projectService.createMacosApplicationToPath(
      transformedData,
      fileEntries,
      outputPath,
      {
        title: getProjectExportTitle({ projectInfo, applicationInfo }),
        shortVersion: nativeVersion.shortVersion,
        bundleVersion: nativeVersion.bundleVersion,
        applicationIdentifier: applicationInfo.applicationIdentifier,
        iconFileId: applicationInfo.iconFileId,
      },
      exportOptions,
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
      errorMessage: getMacosExportErrorMessage(error, copy),
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
        ? `${formatReplayFailureMessage({ replay, copy })}\n${getErrorMessage(error, copy)}`
        : formatI18nCopy(
            copy.failedSaveMacosApplication ??
              "Failed to save macOS application: {message}",
            { message: getMacosExportErrorMessage(error, copy) },
          ),
      title: copy.errorTitle ?? "Error",
    });
  }
};

// What differs between an APK and an App Bundle export.
const getAndroidExportFormat = (copy, projectService, { format, signed }) =>
  format === "aab"
    ? {
        exportFailed: copy.androidBundleExportFailed,
        completedMessage: copy.androidBundleExportCompletedMessage,
        createFileName: (applicationName, versionName) =>
          createAndroidBundleFileName(applicationName, versionName),
        promptPath: projectService.promptAndroidBundlePath,
        createToPath: projectService.createAndroidBundleToPath,
        saveDialog: {
          title: copy.saveAndroidBundleDialogTitle,
          fileTypeName: copy.androidBundleFileTypeName,
        },
      }
    : {
        exportFailed: copy.androidExportFailed,
        completedMessage: signed
          ? copy.androidSignedApkExportCompletedMessage
          : copy.androidApkExportCompletedMessage,
        createFileName: (applicationName, versionName) =>
          createAndroidApkFileName(applicationName, versionName, signed),
        promptPath: projectService.promptAndroidApkPath,
        createToPath: projectService.createAndroidApkToPath,
        saveDialog: {
          title: copy.saveAndroidApkDialogTitle,
          fileTypeName: copy.androidApkFileTypeName,
        },
      };

// Exports an APK, or, with `format` `aab`, a signed App Bundle.
const runAndroidExport = async (deps, confirmation) => {
  const { store, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { versionId, applicationInfo, nativeVersion, format, signed } =
    confirmation;
  const exportFormat = getAndroidExportFormat(copy, projectService, {
    format,
    signed,
  });
  const version = store.selectVersion(versionId);
  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound,
      title: copy.errorTitle,
    });
    return;
  }

  let outputPath;
  try {
    const availability = await projectService.getAndroidExportAvailability();
    if (
      !availability.available ||
      (format === "aab" && !availability.bundleAvailable)
    ) {
      appService.showAlert({
        message: copy.androidExportUnavailable,
        title: copy.errorTitle,
      });
      return;
    }
    outputPath = await exportFormat.promptPath(
      {
        defaultFileName: exportFormat.createFileName(
          applicationInfo.applicationName,
          nativeVersion.versionName,
        ),
      },
      exportFormat.saveDialog,
    );
  } catch (error) {
    appService.showAlert({
      message: withErrorDetails(
        exportFormat.exportFailed,
        error,
        copy.errorDetailsLabel,
      ),
      title: copy.errorTitle,
    });
    return;
  }
  if (!outputPath) return;

  const steps = getAndroidApkExportSteps({
    signed,
    createsKey: signed && !store.selectAndroidSigningStatus().currentKey,
  });
  const { progressDialog, showStep } = openExportStepsProgress({
    appService,
    message: copy.androidApkInProgressMessage,
    title: copy.androidApkInProgressTitle,
    labels: getAndroidApkExportStepLabels(copy, format),
    steps,
  });
  const progressFormats = createExportProgressFormats(i18n);
  let result;
  let exportError;
  let exportFailedMessage = exportFormat.exportFailed;
  try {
    await progressDialog.waitForPaint();
    let signingCertificateSha256;
    if (signed) {
      exportFailedMessage = copy.androidSigningKeyFailed;
      const signingKey = await projectService.ensureAndroidSigningKey({
        applicationName: applicationInfo.applicationName,
        applicationId: applicationInfo.applicationIdentifier,
      });
      signingCertificateSha256 = signingKey.certificateSha256;
      exportFailedMessage = exportFormat.exportFailed;
    }
    showStep("prepare");
    const { transformedData, fileEntries } = await createVersionExportData({
      appService,
      applicationInfo,
      platform: "android",
      projectService,
      version,
    });
    result = await exportFormat.createToPath(
      transformedData,
      fileEntries,
      outputPath,
      {
        applicationName: applicationInfo.applicationName,
        applicationId: applicationInfo.applicationIdentifier,
        versionName: nativeVersion.versionName,
        versionCode: nativeVersion.versionCode,
        iconFileId: applicationInfo.iconFileId,
        adaptiveIconFileId: applicationInfo.adaptiveIconFileId,
        splashIconFileId: applicationInfo.splashIconFileId,
        iconBackgroundColor: applicationInfo.iconBackgroundColor,
        splashBackgroundColor: applicationInfo.splashBackgroundColor,
        signingCertificateSha256,
      },
      {
        onProgress: (progress) =>
          showStep(
            getAndroidApkExportStepForPhase(progress.phase),
            formatAndroidApkExportProgress(progress, progressFormats),
          ),
      },
    );
  } catch (error) {
    exportError = error;
  } finally {
    progressDialog.close();
  }
  if (exportError !== undefined) {
    if (appService.getPlatform() === "android") {
      try {
        await appService.discardPendingSaveDocument(outputPath);
      } catch (cleanupError) {
        exportError = new Error(
          `${exportError?.message ?? exportError} ${cleanupError?.message ?? cleanupError}`,
          { cause: exportError },
        );
      }
    }
    appService.showAlert({
      message: withErrorDetails(
        exportFailedMessage,
        exportError,
        copy.errorDetailsLabel,
      ),
      title: copy.errorTitle,
    });
    return;
  }
  appService.showAlert({
    message: formatI18nCopy(exportFormat.completedMessage, {
      path: appService.getFileDisplayPath(result?.outputPath ?? outputPath),
    }),
    title: copy.exportCompletedTitle,
  });
};

export const handleAndroidExportFormAction = async (deps, payload) => {
  const { appService, i18n, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") return;
  const copy = selectVersionsPageCopy(i18n);
  const version = values.version.trim();
  const buildNumber = values.buildNumber.trim();
  let message;
  if (!version) message = copy.androidExportVersionRequired;
  else if (!isValidNativeApplicationVersion(version))
    message = copy.androidExportVersionInvalid;
  else if (!buildNumber) message = copy.androidExportBuildNumberRequired;
  else if (!isValidAndroidVersionCode(buildNumber))
    message = copy.androidExportBuildNumberInvalid;
  if (message) {
    appService.showAlert({ message, title: copy.warningTitle });
    return;
  }
  const confirmation = store.selectExportConfirmation();
  if (confirmation.exportType !== "android-apk") return;
  const nativeVersion = createAndroidNativeVersion(version, buildNumber);
  // A bundle is always signed.
  const format =
    store.selectCanExportAndroidBundle() && values.format === "aab"
      ? "aab"
      : "apk";
  const signed =
    format === "aab" ||
    (store.selectAndroidSigningStatus().supported &&
      values.signing === "signed");
  store.closeExportConfirmation();
  render();
  await runAndroidExport(deps, {
    ...confirmation,
    nativeVersion,
    format,
    signed,
  });
};

export const handleExportConfirmationConfirm = async (deps) => {
  const { store, render } = deps;
  const confirmation = store.selectExportConfirmation();
  if (
    confirmation.exportType === "macos-application" ||
    confirmation.exportType === "android-apk" ||
    confirmation.exportType === "ios-application"
  ) {
    return;
  }
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
};

export const handleMacosExportFormAction = async (deps, payload) => {
  const { appService, i18n, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const copy = selectVersionsPageCopy(i18n);
  const version = values.version.trim();
  const buildNumber = values.buildNumber.trim();
  let message;
  if (!version) {
    message =
      copy.macosExportVersionRequired ??
      "Version is required for macOS export.";
  } else if (!isValidNativeApplicationVersion(version)) {
    message =
      copy.macosExportVersionInvalid ??
      "Version must contain three numeric components, for example 1.2.0.";
  } else if (!buildNumber) {
    message =
      copy.macosExportBuildNumberRequired ??
      "Build number is required for macOS export.";
  } else if (!isValidMacosBuildNumber(buildNumber)) {
    message =
      copy.macosExportBuildNumberInvalid ??
      "Build number must be a positive integer.";
  }

  if (message) {
    appService.showAlert({
      message,
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const confirmation = store.selectExportConfirmation();
  const nativeVersion = createMacosNativeVersion(version, buildNumber);
  store.closeExportConfirmation();
  render();
  await runMacosApplicationExport(deps, { ...confirmation, nativeVersion });
};

const runIosApplicationExport = async (deps, confirmation) => {
  const { store, projectService, appService, i18n } = deps;
  const copy = selectVersionsPageCopy(i18n);
  const { versionId, applicationInfo, options } = confirmation;
  const version = store.selectVersion(versionId);
  if (!version) {
    appService.showAlert({
      message: copy.versionNotFound,
      title: copy.errorTitle,
    });
    return;
  }

  // A build installed on a device is not saved, so it needs no location.
  const install = options.device !== undefined;
  let outputPath;
  try {
    const availability = await projectService.getIosExportAvailability();
    if (!availability.available) {
      appService.showAlert({
        message: copy.iosExportUnavailable,
        title: copy.errorTitle,
      });
      return;
    }
    if (!install) {
      outputPath = await projectService.promptIosApplicationPath(
        {
          defaultFileName: createIosIpaFileName(
            applicationInfo.applicationName,
            options.version,
          ),
        },
        {
          title: copy.saveIosApplicationDialogTitle,
          fileTypeName: copy.iosApplicationFileTypeName,
        },
      );
    }
  } catch (error) {
    appService.showAlert({
      message: withErrorDetails(
        copy.iosExportFailed,
        error,
        copy.errorDetailsLabel,
      ),
      title: copy.errorTitle,
    });
    return;
  }
  if (!install && !outputPath) return;

  const steps = getIosExportSteps({ upload: options.upload, install });
  const { progressDialog, showStep } = openExportStepsProgress({
    appService,
    message: copy.iosApplicationInProgressMessage,
    title: copy.iosApplicationInProgressTitle,
    labels: getIosExportStepLabels(copy),
    steps,
  });
  const progressFormats = createExportProgressFormats(i18n);
  let result;
  let exportError;
  try {
    await progressDialog.waitForPaint();
    const { transformedData, fileEntries } = await createVersionExportData({
      appService,
      applicationInfo,
      platform: "ios",
      projectService,
      version,
    });
    result = await projectService.exportIosApplication(
      transformedData,
      fileEntries,
      outputPath,
      {
        installDeviceId: options.device?.id,
        applicationName: applicationInfo.applicationName,
        bundleIdentifier: applicationInfo.applicationIdentifier,
        version: options.version,
        buildNumber: options.buildNumber,
        iconFileId: applicationInfo.iconFileId,
        teamId: options.teamId,
        distribution: options.distribution,
        upload: options.upload,
      },
      {
        onProgress: (progress) =>
          showStep(
            getIosExportStepForPhase(progress.phase),
            formatAndroidApkExportProgress(progress, progressFormats),
          ),
      },
    );
  } catch (error) {
    exportError = error;
  } finally {
    progressDialog.close();
  }
  // The next export selects the team this one signed with. A failed upload
  // was still signed.
  const signed = exportError === undefined || exportError.ipaSaved === true;
  if (signed && options.teamId !== applicationInfo.teamId) {
    try {
      await projectService.updateCurrentPlatformDetails("ios", {
        teamId: options.teamId,
      });
    } catch {
      appService.showToast({ message: copy.iosTeamSaveFailed });
    }
  }
  const path = outputPath && appService.getFileDisplayPath(outputPath);
  if (exportError !== undefined) {
    let message = getIosExportErrorMessage(exportError, copy);
    // A failed upload leaves the saved IPA.
    if (exportError?.ipaSaved) {
      message = `${message}\n${formatI18nCopy(copy.iosIpaSavedNotice, { path })}`;
    }
    appService.showAlert({
      message: withIosExportErrorDetails(
        message,
        exportError,
        copy.errorDetailsLabel,
      ),
      title: copy.errorTitle,
    });
    return;
  }
  let message;
  if (install) {
    message = formatI18nCopy(
      result.launched
        ? copy.iosInstalledMessage
        : copy.iosInstalledNotOpenedMessage,
      { device: options.device.name },
    );
  } else if (result.uploaded) {
    message = formatI18nCopy(copy.iosUploadedMessage, { path });
  } else if (options.distribution === "appStore") {
    message = formatI18nCopy(copy.iosAppStoreExportCompletedMessage, { path });
  } else {
    message = formatI18nCopy(copy.iosDevelopmentExportCompletedMessage, {
      path,
    });
  }
  appService.showAlert({ message, title: copy.exportCompletedTitle });
};

export const handleIosExportFormAction = async (deps, payload) => {
  const { appService, i18n, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") return;
  const copy = selectVersionsPageCopy(i18n);
  const confirmation = store.selectExportConfirmation();
  if (confirmation.exportType !== "ios-application") return;
  const { teams, devices } = store.selectIosExportOptions();
  const version = values.version.trim();
  const buildNumber = values.buildNumber.trim();
  // Without teams from Xcode, the creator typed the team ID.
  const typedTeam = teams.length === 0;
  const teamId = typedTeam
    ? (values.teamId ?? "").trim().toUpperCase()
    : values.teamId;
  const team = teams.find(({ id }) => id === teamId);
  const distribution =
    values.distribution === "development" ? "development" : "appStore";
  let message;
  if (!version) message = copy.iosExportVersionRequired;
  else if (!isValidIosVersion(version)) message = copy.iosExportVersionInvalid;
  else if (!buildNumber) message = copy.iosExportBuildNumberRequired;
  else if (!isValidIosBuildNumber(buildNumber))
    message = copy.iosExportBuildNumberInvalid;
  else if (!teamId || (!typedTeam && !team)) message = copy.iosTeamRequired;
  else if (typedTeam && !isValidIosTeamId(teamId))
    message = copy.iosTeamIdInvalid;
  else if (team?.free && distribution === "appStore")
    message = copy.iosPersonalTeamAppStore;
  if (message) {
    appService.showAlert({ message, title: copy.warningTitle });
    return;
  }
  const options = {
    version,
    buildNumber,
    teamId,
    distribution,
    upload: distribution === "appStore" && values.upload === true,
  };
  if (distribution === "development") {
    options.device = devices.find(({ id }) => id === values.deviceId);
  }
  store.closeExportConfirmation();
  render();
  await runIosApplicationExport(deps, { ...confirmation, options });
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
