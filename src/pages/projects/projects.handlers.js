import {
  clearAuthenticatedSession,
  getAuthenticatedSession,
  getPersistedAuthenticatedUser,
  mapApiUserToAuthUser,
} from "../../deps/services/shared/authSession.js";
import {
  getIncompatibleProjectOpenMessage,
  getProjectOpenErrorMessage,
  isIncompatibleProjectOpenError,
} from "../../internal/projectOpenErrors.js";
import {
  CUSTOM_PROJECT_RESOLUTION_PRESET,
  resolveProjectResolution,
} from "../../internal/projectResolution.js";
import { resolveUpdatesEnabled } from "../../internal/updates.js";
import {
  formatProjectsPageCopy,
  selectProjectsPageCopy,
} from "./support/projectsPageCopy.js";

const APP_LOCALE_CONFIG_KEY = "app.locale";
const DEFAULT_PROJECTS_LOCALE = "en";

const getAvailableLocales = (localeService) => {
  return localeService?.available?.() ?? ["en", "ja", "zh-hans"];
};

const resolveProjectsLocale = ({ appService, localeService } = {}) => {
  const availableLocales = getAvailableLocales(localeService);
  const storedLocale = appService?.getUserConfig?.(APP_LOCALE_CONFIG_KEY);
  const currentLocale = localeService?.current?.();
  const locale = storedLocale ?? currentLocale ?? DEFAULT_PROJECTS_LOCALE;

  return availableLocales.includes(locale) ? locale : DEFAULT_PROJECTS_LOCALE;
};

const activateProjectsLocale = async ({
  appService,
  localeService,
  store,
  locale,
  persist = true,
} = {}) => {
  const availableLocales = getAvailableLocales(localeService);
  const nextLocale = availableLocales.includes(locale)
    ? locale
    : DEFAULT_PROJECTS_LOCALE;

  await localeService?.set?.(nextLocale);
  const activeLocale = localeService?.current?.() ?? nextLocale;

  store.setCurrentLocale({ locale: activeLocale });
  if (persist) {
    appService?.setUserConfig?.(APP_LOCALE_CONFIG_KEY, activeLocale);
  }

  return activeLocale;
};

const mapCloudProject = (project, copy) => {
  const projectId = project?.id;
  const name = project?.name ?? copy.untitledProject;
  const role = project?.role ?? "member";
  const roleLabel =
    role === "owner"
      ? copy.roleOwner
      : role === "member"
        ? copy.roleMember
        : role;
  const description = project?.data?.description ?? "";
  const memberCount = Array.isArray(project?.members)
    ? project.members.length
    : 0;
  const updated = Number.isFinite(project?.updated) ? project.updated : 0;
  const created = Number.isFinite(project?.created) ? project.created : 0;

  return {
    id: projectId,
    name,
    role: roleLabel,
    description,
    memberCount,
    updated,
    created,
  };
};

const loadCloudProjects = async ({
  appService,
  apiService,
  store,
  authToken,
  copy,
}) => {
  const profile = await apiService.getProfile({ authToken });
  const profileUser = profile?.user;

  if (!profileUser || typeof profileUser !== "object") {
    store.setCloudProjects({ projects: [] });
    return;
  }

  const mappedUser = mapApiUserToAuthUser(profileUser);
  appService.setUserConfig("auth.user", mappedUser);
  store.setAuthUser({ user: mappedUser });

  const mappedCloudProjects = Array.isArray(profileUser.projects)
    ? profileUser.projects.map((project) => mapCloudProject(project, copy))
    : [];
  store.setCloudProjects({ projects: mappedCloudProjects });
};

export const handleAfterMount = async (deps) => {
  const { appService, apiService, store, render, locale } = deps;
  await activateProjectsLocale({
    appService,
    localeService: locale,
    store,
    locale: resolveProjectsLocale({ appService, localeService: locale }),
    persist: false,
  });
  const copy = selectProjectsPageCopy(deps.i18n);
  const platform = appService.getPlatform();
  const showCloudProjects = store.selectShowCloudProjects();
  store.setPlatform({ platform: platform });
  store.setAppVersion({ version: appService.getAppVersion() });
  const authUser = getPersistedAuthenticatedUser(appService);
  const cloudSession = getAuthenticatedSession(appService);
  store.setAuthUser({ user: authUser });
  store.setCloudProjects({ projects: [] });

  const projectsPromise = appService.loadAllProjects();
  const cloudProjectsPromise =
    showCloudProjects && cloudSession
      ? loadCloudProjects({
          appService,
          apiService,
          store,
          authToken: cloudSession.authToken,
          copy,
        }).catch(() => {
          appService.showAlert({
            message: copy.failedLoadCloudProjects,
          });
        })
      : Promise.resolve();

  const projects = await projectsPromise;
  store.setProjects({ projects: projects });
  await cloudProjectsPromise;
  render();
};

export const handleBeforeMount = (deps) => {
  const { appService, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  store.setCurrentTheme({
    theme: appService.getTheme(),
  });

  const cachedProjects = appService.getCachedProjects();
  if (cachedProjects !== undefined) {
    store.setProjects({ projects: cachedProjects });
  }
};

const getProjectIdFromEvent = (event) => {
  return event?.currentTarget?.dataset?.projectId ?? "";
};

const getProjectPathFromEvent = (event) => {
  return event?.currentTarget?.dataset?.projectPath ?? "";
};

const getProjectIndexFromEvent = (event) => {
  const value = event?.currentTarget?.dataset?.projectIndex;
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) {
    return undefined;
  }
  return index;
};

const navigateToProjectRoute = async (
  { appService, projectService, store, i18n },
  { projectId, path } = {},
) => {
  const copy = selectProjectsPageCopy(i18n);
  if (!projectId) {
    appService.showAlert({
      message: copy.invalidProjectEntryImportAgain,
    });
    return;
  }

  const project = store
    .selectProjects()
    .find((entry) => entry?.id === projectId);

  try {
    await projectService.ensureProjectCompatibleById(projectId);
  } catch (error) {
    if (isIncompatibleProjectOpenError(error)) {
      await appService.showAlert({
        title: copy.incompatibleProjectTitle,
        message: getIncompatibleProjectOpenMessage(error),
        status: "error",
      });
      return;
    }

    appService.showAlert({
      message: getProjectOpenErrorMessage(error),
    });
    return;
  }

  if (project) {
    appService.setCurrentProjectEntry(project);
  }

  const currentHistoryState = appService.getHistoryState?.() ?? {};
  const historyMode = currentHistoryState.preserveProjectsEntryOnProjectOpen
    ? "push"
    : "replace";
  appService.navigate(path, { p: projectId }, { historyMode });
};

const createProjectFromValues = async (deps, values = {}) => {
  const { appService, render, store, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const platform = appService.getPlatform();

  try {
    const name = values.name ?? "";
    const description = values.description ?? "";
    const language = values.language;
    const iconFile = values.iconFile;
    const template = values.template ?? "default";
    const resolution = values.resolution;
    const resolutionWidth = values.resolutionWidth;
    const resolutionHeight = values.resolutionHeight;
    const projectPath = values.projectPath ?? "";

    if (name === "_TEST_FILE_PERMISSIONS_") {
      window.location.href = "/test-permissions.html";
      return;
    }

    if (!name || (platform === "tauri" && !projectPath)) {
      let message = copy.fillRequiredFields;
      if (!name) {
        message = copy.projectNameRequiredAlert;
      } else if (platform === "tauri" && !projectPath) {
        message = copy.projectLocationRequiredAlert;
      }

      appService.showAlert({ message: message });
      return;
    }

    const projectResolution = resolveProjectResolution({
      preset: resolution,
      width: resolutionWidth,
      height: resolutionHeight,
    });

    if (!projectResolution) {
      if (resolution === CUSTOM_PROJECT_RESOLUTION_PRESET) {
        if (!resolutionWidth) {
          appService.showAlert({ message: copy.resolutionWidthRequired });
          return;
        }

        if (!resolutionHeight) {
          appService.showAlert({ message: copy.resolutionHeightRequired });
          return;
        }

        appService.showAlert({
          message: copy.resolutionInvalidDimensions,
        });
        return;
      }

      appService.showAlert({ message: copy.projectResolutionInvalid });
      return;
    }

    const newProject = await appService.createNewProject({
      name,
      description,
      language,
      iconFile,
      projectPath,
      template,
      projectResolution,
    });

    store.addProject({ project: newProject });
    store.closeCreateDialog();
    render();
  } catch (error) {
    appService.showAlert({
      message: error?.message || copy.failedCreateProject,
    });
  }
};

export const handleCreateButtonClick = (deps) => {
  const { store, render } = deps;
  store.openCreateDialog();
  render();
};

export const handleCreateDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsCreateDialogOpen()) {
    return;
  }
  store.closeCreateDialog();
  render();
};

export const handleCreateDialogCancel = (deps) => {
  const { store, render } = deps;
  store.closeCreateDialog();
  render();
};

export const handleCreateDialogSubmit = async (deps) => {
  const { appService, refs, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const dialogBody = refs.projectCreateDialogBody;

  if (
    !dialogBody ||
    typeof dialogBody.validate !== "function" ||
    typeof dialogBody.getValues !== "function"
  ) {
    appService.showAlert({ message: copy.createProjectDialogNotReady });
    return;
  }

  const validation = await dialogBody.validate();
  if (validation?.valid === false) {
    return;
  }

  const values = await dialogBody.getValues();
  await createProjectFromValues(deps, values);
};

export const handleCloudCreateButtonClick = (deps) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const cloudSession = getAuthenticatedSession(appService);
  if (!cloudSession) {
    appService.showAlert({
      message: copy.loginToCreateCloudProject,
    });
    return;
  }

  store.openCloudCreateDialog();
  render();
};

export const handleCloudCreateDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsCloudCreateDialogOpen()) {
    return;
  }
  store.closeCloudCreateDialog();
  render();
};

export const handleCloudCreateFormAction = async (deps, payload) => {
  const { appService, apiService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const detail = payload?._event?.detail || {};
  const actionId = detail.actionId;

  if (actionId === "cancel") {
    store.closeCloudCreateDialog();
    render();
    return;
  }

  if (actionId !== "create-cloud") {
    return;
  }

  const cloudSession = getAuthenticatedSession(appService);
  if (!cloudSession) {
    appService.showAlert({
      message: copy.loginToCreateCloudProject,
    });
    return;
  }

  const name = detail?.values?.name?.trim?.() || "";
  const description = detail?.values?.description?.trim?.() || "";
  if (!name) {
    appService.showAlert({ message: copy.projectNameRequiredAlert });
    return;
  }

  try {
    const result = await apiService.createProject({
      authToken: cloudSession.authToken,
      name,
      description,
    });
    const project = mapCloudProject(result?.project, copy);
    if (!project.id) {
      throw new Error("Project was created but response is invalid.");
    }

    store.addCloudProject({ project });
    store.closeCloudCreateDialog();
    render();
  } catch {
    appService.showAlert({
      message: copy.failedCreateCloudProject,
    });
  }
};

export const handleOpenButtonClick = async (deps) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const platform = appService.getPlatform();
  if (platform !== "tauri" && platform !== "android" && platform !== "ios") {
    return;
  }

  try {
    const selectedPath = await appService.openFolderPicker({
      title: copy.selectExistingProjectFolderTitle,
    });

    if (!selectedPath) {
      return;
    }

    const importedProject = await appService.openExistingProject(selectedPath);
    const projects = await appService.loadAllProjects();
    store.setProjects({ projects });
    render();

    appService.showToast({
      message: formatProjectsPageCopy(copy.importedProjectMessage, {
        projectName: importedProject.name,
      }),
    });
  } catch (error) {
    appService.showAlert({
      message: error?.message || copy.failedImportProject,
    });
  }
};

export const handleMobileCreateMenuButtonClick = (deps, payload) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const rect = payload._event.currentTarget.getBoundingClientRect();
  const platform = appService.getPlatform();
  const canImportProjects =
    platform === "tauri" || platform === "android" || platform === "ios";
  const menuPayload = {
    x: rect.right,
    y: rect.bottom,
    items: [
      {
        label: copy.createProjectMenuItem,
        type: "item",
        value: "create-project",
      },
      {
        label: copy.importProjectMenuItem,
        type: "item",
        value: "import-project",
        disabled: !canImportProjects,
      },
    ],
  };

  store.openMobileActionMenu(menuPayload);
  render();
};

export const handleMobileActionMenuClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsMobileActionMenuOpen()) {
    return;
  }
  store.closeMobileActionMenu();
  render();
};

export const handleMobileActionMenuClickItem = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail;
  const item = detail.item || detail;

  store.closeMobileActionMenu();

  if (item.value === "create-project") {
    store.openCreateDialog();
  }

  if (item.value === "import-project") {
    render();
    await handleOpenButtonClick(deps);
    return;
  }

  render();
};

export const handleAppVersionClick = (deps, payload) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const rect = payload._event.currentTarget.getBoundingClientRect();
  const items = [];

  if (appService.getPlatform() !== "web" && resolveUpdatesEnabled(deps)) {
    items.push({
      label: copy.checkUpdateMenuItem,
      type: "item",
      value: "check-update",
    });
  }

  items.push({
    label: copy.languageMenuItem,
    type: "item",
    value: "language",
  });
  items.push({
    label: copy.appearanceMenuItem,
    type: "item",
    value: "appearance",
  });

  const menuPayload = {
    x: rect.left + rect.width / 2,
    y: rect.top,
    items,
  };

  store.openAppVersionMenu(menuPayload);
  render();
};

export const handleAppVersionMenuClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsAppVersionMenuOpen()) {
    return;
  }
  store.closeAppVersionMenu();
  render();
};

export const handleAppVersionMenuClickItem = async (deps, payload) => {
  const { appService, store, render, updaterService, locale, i18n } = deps;
  const detail = payload._event.detail;
  const item = detail.item || detail;

  store.closeAppVersionMenu();

  if (item.value === "language") {
    store.openLanguageDialog({
      locale: resolveProjectsLocale({ appService, localeService: locale }),
    });
    render();
    return;
  }

  if (item.value === "appearance") {
    store.openAppearanceDialog({
      theme: appService.getTheme(),
    });
    render();
    return;
  }

  render();

  if (
    item.value === "check-update" &&
    appService.getPlatform() !== "web" &&
    resolveUpdatesEnabled(deps) &&
    updaterService
  ) {
    await updaterService.checkForUpdates(false, { copy: i18n?.appPage ?? {} });
  }
};

export const handleLanguageDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsLanguageDialogOpen()) {
    return;
  }
  store.closeLanguageDialog();
  render();
};

export const handleLanguageFormAction = async (deps, payload) => {
  const { appService, store, render, i18n, locale } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const detail = payload?._event?.detail || {};
  const actionId = detail.actionId;

  if (actionId === "cancel") {
    store.closeLanguageDialog();
    render();
    return;
  }

  if (actionId !== "save-language") {
    return;
  }

  const selectedLocale = detail?.values?.locale ?? DEFAULT_PROJECTS_LOCALE;

  try {
    await activateProjectsLocale({
      appService,
      localeService: locale,
      store,
      locale: selectedLocale,
    });
    store.closeLanguageDialog();
    render();
  } catch {
    appService.showAlert({ message: copy.failedChangeLanguage });
  }
};

export const handleAppearanceDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsAppearanceDialogOpen()) {
    return;
  }
  store.closeAppearanceDialog();
  render();
};

export const handleAppearanceFormAction = (deps, payload) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const detail = payload?._event?.detail || {};
  const actionId = detail.actionId;

  if (actionId === "cancel") {
    store.closeAppearanceDialog();
    render();
    return;
  }

  if (actionId !== "save-appearance") {
    return;
  }

  try {
    const nextTheme = appService.setTheme(detail?.values?.theme);
    store.setCurrentTheme({ theme: nextTheme });
    store.closeAppearanceDialog();
    render();
  } catch {
    appService.showAlert({ message: copy.failedChangeAppearance });
  }
};

export const handleLoginButtonClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/authenticate");
};

export const handleAvatarButtonClick = (deps, payload) => {
  const { store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const menuPayload = {
    x: payload._event.clientX,
    y: payload._event.clientY,
    items: [
      {
        label: copy.editProfileMenuItem,
        type: "item",
        value: "edit-profile",
      },
      { label: copy.settingsMenuItem, type: "item", value: "settings" },
      { label: copy.logoutMenuItem, type: "item", value: "logout" },
    ],
  };

  store.openProfileMenu(menuPayload);
  render();
};

export const handleProfileDropdownClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsProfileMenuOpen()) {
    return;
  }
  store.closeProfileMenu();
  render();
};

export const handleEditProfileDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsProfileDialogOpen()) {
    return;
  }
  store.closeProfileDialog();
  render();
};

export const handleSettingsDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsSettingsDialogOpen()) {
    return;
  }
  store.closeSettingsDialog();
  render();
};

export const handleProfileFormAction = (deps, payload) => {
  const { store, render, appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const detail = payload?._event?.detail || {};
  const actionId = detail.actionId;

  if (actionId === "cancel") {
    store.closeProfileDialog();
    render();
    return;
  }

  if (actionId !== "save") {
    return;
  }

  const existingUser = appService.getUserConfig("auth.user") || {};
  const email = existingUser?.email?.trim?.() || "";
  if (!email) {
    appService.showAlert({ message: copy.notLoggedIn });
    return;
  }

  const user = {
    email,
    name: detail?.values?.displayName?.trim?.() || "",
    displayColor: detail?.values?.displayColor || "#E2E8F0",
    avatar: detail?.values?.avatar?.trim?.() || "",
  };

  appService.setUserConfig("auth.user", user);
  store.setAuthUser({ user });
  store.closeProfileDialog();
  render();
};

export const handleSettingsFormAction = (deps, payload) => {
  const { store, render, appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const detail = payload?._event?.detail || {};
  const actionId = detail.actionId;

  if (actionId === "cancel") {
    store.closeSettingsDialog();
    render();
    return;
  }

  if (actionId !== "save") {
    return;
  }

  const email = detail?.values?.email?.trim?.() || "";
  if (!email) {
    appService.showAlert({ message: copy.emailRequiredAlert });
    return;
  }

  const existingUser = appService.getUserConfig("auth.user") || {};
  const user = {
    ...existingUser,
    email,
  };

  appService.setUserConfig("auth.user", user);
  store.setAuthUser({ user });
  store.closeSettingsDialog();
  render();
};

export const handleProfileDropdownClickItem = async (deps, payload) => {
  const { store, render, appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const detail = payload._event.detail;
  const item = detail.item || detail;

  store.closeProfileMenu();
  render();

  if (item.value === "edit-profile") {
    store.openProfileDialog();
    render();
    return;
  }

  if (item.value === "settings") {
    store.openSettingsDialog();
    render();
    return;
  }

  if (item.value === "logout") {
    const confirmed = await appService.showDialog({
      title: copy.logoutTitle,
      message: copy.logoutMessage,
      confirmText: copy.logoutConfirm,
      cancelText: copy.cancelButton,
    });

    if (!confirmed) {
      return;
    }

    clearAuthenticatedSession(appService);
    store.setAuthUser({ user: null });
    store.setCloudProjects({ projects: [] });
    render();
  }
};

export const handleProjectsClick = async (deps, payload) => {
  const id = getProjectIdFromEvent(payload._event);
  return navigateToProjectRoute(deps, {
    projectId: id,
    path: "/project",
  });
};

export const handleProjectContextMenu = (deps, payload) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  payload._event.preventDefault();

  const projectId = getProjectIdFromEvent(payload._event);
  const projects = store.selectProjects();
  const projectIndex = getProjectIndexFromEvent(payload._event);
  const project =
    projects.find((entry) => entry?.id === projectId) ??
    (projectIndex === undefined ? undefined : projects[projectIndex]);
  const projectPath =
    project?.projectPath || getProjectPathFromEvent(payload._event);
  if (!projectId) {
    if (!projectPath) {
      appService.showAlert({
        message: copy.invalidProjectEntryRefresh,
      });
      return;
    }

    const menuPayload = {
      x: payload._event.clientX,
      y: payload._event.clientY,
      scope: "local",
      projectPath,
      items: [{ label: copy.removeButton, type: "item", value: "delete" }],
    };

    store.openDropdownMenu(menuPayload);
    render();
    return;
  }

  const menuPayload = {
    x: payload._event.clientX,
    y: payload._event.clientY,
    scope: "local",
    projectId: projectId,
    projectPath,
    items: [{ label: copy.removeButton, type: "item", value: "delete" }],
  };

  store.openDropdownMenu(menuPayload);
  render();
};

export const handleCloudProjectContextMenu = (deps, payload) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  payload._event.preventDefault();

  const projectId = getProjectIdFromEvent(payload._event);
  if (!projectId) {
    appService.showAlert({
      message: copy.invalidProjectEntryRefresh,
    });
    return;
  }

  const projects = store.selectCloudProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return;
  }

  store.openDropdownMenu({
    x: payload._event.clientX,
    y: payload._event.clientY,
    scope: "cloud",
    projectId,
    items: [
      { label: copy.addMemberMenuItem, type: "item", value: "add-member" },
    ],
  });
  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsProjectDropdownMenuOpen()) {
    return;
  }
  store.closeDropdownMenu();
  render();
};

export const handleDeleteDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsDeleteDialogOpen()) {
    return;
  }
  store.closeDeleteDialog();
  render();
};

export const handleAddMemberDialogClose = (deps) => {
  const { store, render } = deps;
  if (!store.selectIsAddMemberDialogOpen()) {
    return;
  }
  store.closeAddMemberDialog();
  render();
};

export const handleAddMemberFormAction = async (deps, payload) => {
  const { appService, apiService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const detail = payload?._event?.detail || {};
  const actionId = detail.actionId;

  if (actionId === "cancel") {
    store.closeAddMemberDialog();
    render();
    return;
  }

  if (actionId !== "submit-add-member") {
    return;
  }

  const cloudSession = getAuthenticatedSession(appService);
  if (!cloudSession) {
    appService.showAlert({ message: copy.loginToAddMember });
    return;
  }

  const projectId = store.selectAddMemberDialogProjectId();
  if (!projectId) {
    appService.showAlert({ message: copy.cloudProjectMissing });
    return;
  }

  const email = detail?.values?.email?.trim?.() || "";
  if (!email) {
    appService.showAlert({ message: copy.emailRequiredAlert });
    return;
  }

  try {
    const result = await apiService.addMembers({
      authToken: cloudSession.authToken,
      projectId,
      memberEmails: [email],
    });

    const added = Number(result?.summary?.added || 0);
    const alreadyMember = Number(result?.summary?.alreadyMember || 0);
    const userNotFound = Number(result?.summary?.userNotFound || 0);
    const cannotAddOwner = Number(result?.summary?.cannotAddOwner || 0);

    if (added > 0) {
      appService.showAlert({ message: copy.memberAdded });
    } else if (alreadyMember > 0) {
      appService.showAlert({ message: copy.alreadyMember });
    } else if (userNotFound > 0) {
      appService.showAlert({ message: copy.userNotFound });
    } else if (cannotAddOwner > 0) {
      appService.showAlert({
        message: copy.cannotAddOwner,
      });
    } else {
      appService.showAlert({ message: copy.noMemberAdded });
    }

    await loadCloudProjects({
      appService,
      apiService,
      store,
      authToken: cloudSession.authToken,
      copy,
    });
    store.closeAddMemberDialog();
    render();
  } catch {
    appService.showAlert({
      message: copy.failedAddMember,
    });
  }
};

export const handleDeleteDialogConfirm = async (deps) => {
  const { appService, projectService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const projectId = store.selectDeleteDialogProjectId();
  const projectPath = store.selectDeleteDialogProjectPath();
  if (!projectId && !projectPath) {
    store.closeDeleteDialog();
    render();
    return;
  }

  try {
    if (projectId) {
      await projectService.releaseProjectRuntime(projectId);
    }

    if (projectId) {
      await appService.removeProjectEntry(projectId);
      store.removeProject({ projectId });
    } else {
      await appService.removeProjectEntryByPath(projectPath);
      store.removeProject({ projectPath });
    }
  } catch {
    appService.showAlert({
      message: copy.failedRemoveProject,
    });
  } finally {
    store.closeDeleteDialog();
    render();
  }
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail;

  const item = detail.item || detail;
  const targetScope = store.selectDropdownMenuTargetScope();
  const projectId = store.selectDropdownMenuTargetProjectId();
  const projectPath = store.selectDropdownMenuTargetProjectPath();

  if (item.value === "add-member" && targetScope === "cloud") {
    if (!projectId) {
      store.closeDropdownMenu();
      render();
      return;
    }

    const projects = store.selectCloudProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      store.closeDropdownMenu();
      render();
      return;
    }

    store.closeDropdownMenu();
    store.openAddMemberDialog({
      projectId,
      projectName: project.name || "",
    });
    render();
    return;
  }

  if (item.value !== "delete") {
    store.closeDropdownMenu();
    render();
    return;
  }

  if (!projectId && !projectPath) {
    store.closeDropdownMenu();
    render();
    return;
  }

  const projects = store.selectProjects();
  const project = projects.find((projectItem) => {
    if (projectId && projectItem?.id === projectId) {
      return true;
    }

    return projectPath && projectItem?.projectPath === projectPath;
  });

  store.closeDropdownMenu();
  store.openDeleteDialog({
    projectId: projectId,
    projectPath,
    projectName: project?.name || "",
  });
  render();
};
