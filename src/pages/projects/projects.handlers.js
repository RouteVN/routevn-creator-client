import {
  clearAuthenticatedSession,
  getAuthenticatedSession,
  getPersistedAuthenticatedUser,
  mapApiUserToAuthUser,
} from "../../deps/services/shared/authSession.js";
import {
  CUSTOM_PROJECT_RESOLUTION_PRESET,
  resolveProjectResolution,
} from "../../internal/projectResolution.js";

const PROJECT_CREATE_DIALOG_COMPONENT = "rvn-project-create-dialog";

const mapCloudProject = (project) => {
  const projectId = project?.id;
  const name = project?.name ?? "Untitled";
  const role = project?.role ?? "member";
  const description = project?.data?.description ?? "";
  const memberCount = Array.isArray(project?.members)
    ? project.members.length
    : 0;
  const updated = Number.isFinite(project?.updated) ? project.updated : 0;
  const created = Number.isFinite(project?.created) ? project.created : 0;

  return {
    id: projectId,
    name,
    role,
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
    ? profileUser.projects.map(mapCloudProject)
    : [];
  store.setCloudProjects({ projects: mappedCloudProjects });
};

export const handleAfterMount = async (deps) => {
  const { appService, apiService, store, render } = deps;
  const platform = appService.getPlatform();
  const showCloudProjects = store.selectShowCloudProjects();
  store.setPlatform({ platform: platform });
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
        }).catch(() => {
          appService.showAlert({
            message: "Failed to load cloud projects. Please try again later.",
          });
        })
      : Promise.resolve();

  const projects = await projectsPromise;
  store.setProjects({ projects: projects });
  await cloudProjectsPromise;
  render();
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

const showCreateProjectDialog = async (appService) => {
  return appService.showComponentDialog({
    component: PROJECT_CREATE_DIALOG_COMPONENT,
    size: "md",
    props: {
      platform: appService.getPlatform(),
    },
    actions: {
      buttons: [
        {
          id: "submit",
          label: "Submit",
          variant: "pr",
          role: "confirm",
          validate: true,
        },
      ],
    },
  });
};

const isIncompatibleProjectVersionError = (error) => {
  return (
    typeof error?.message === "string" &&
    (error.message.includes("incompatible project with version") ||
      error.message.includes("requires reset for schema version"))
  );
};

const getIncompatibleProjectMessage = (error) => {
  const message = error?.message ?? "";
  if (message.includes("requires reset for schema version")) {
    return "Unsupported project version. Make sure the project was created with RouteVN Creator v1 or later. Contact RouteVN for support on migrating the old project.";
  }

  return message;
};

const isMissingProjectResolutionError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("project resolution is required") &&
    message.includes("width") &&
    message.includes("height")
  );
};

const isProjectDatabaseOpenError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("unable to open database file") ||
    message.includes("(code: 14)")
  );
};

const getProjectOpenErrorMessage = (error) => {
  if (isMissingProjectResolutionError(error)) {
    return "Project is missing required resolution settings.";
  }

  if (isProjectDatabaseOpenError(error)) {
    return "Failed to open the project database. Make sure the project folder still exists and RouteVN can access it.";
  }

  const detail = typeof error?.message === "string" ? error.message.trim() : "";
  if (!detail || detail === "Failed to open project.") {
    return "Failed to open project. An unexpected error occurred while preparing the project.";
  }

  if (detail.toLowerCase().startsWith("failed to open project")) {
    return detail;
  }

  return `Failed to open project. ${detail}`;
};

export const handleCreateButtonClick = async (deps) => {
  const { appService, render, store } = deps;
  let dialogResult;

  try {
    dialogResult = await showCreateProjectDialog(appService);
  } catch {
    appService.showAlert({ message: "Failed to open create project dialog." });
    return;
  }

  if (!dialogResult || dialogResult.actionId !== "submit") {
    return;
  }

  const values = dialogResult.values ?? {};
  const platform = appService.getPlatform();

  try {
    const name = values.name ?? "";
    const description = values.description ?? "";
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

    if (!name || (platform !== "web" && !projectPath)) {
      let message = "Please fill in all required fields.";
      if (!name) {
        message = "Project Name is required.";
      } else if (platform !== "web" && !projectPath) {
        message = "Project Location is required.";
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
          appService.showAlert({ message: "Resolution Width is required." });
          return;
        }

        if (!resolutionHeight) {
          appService.showAlert({ message: "Resolution Height is required." });
          return;
        }

        appService.showAlert({
          message: "Resolution Width and Height must be positive integers.",
        });
        return;
      }

      appService.showAlert({ message: "Project Resolution is invalid." });
      return;
    }

    const newProject = await appService.createNewProject({
      name,
      description,
      iconFile,
      projectPath,
      template,
      projectResolution,
    });

    store.addProject({ project: newProject });
    render();
  } catch (error) {
    appService.showAlert({
      message:
        error?.message ||
        "Failed to create project. Please check the selected folder and try again.",
    });
  }
};

export const handleCloudCreateButtonClick = (deps) => {
  const { appService, store, render } = deps;
  const cloudSession = getAuthenticatedSession(appService);
  if (!cloudSession) {
    appService.showAlert({
      message: "Please login to create a cloud project.",
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
  const { appService, apiService, store, render } = deps;
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
      message: "Please login to create a cloud project.",
    });
    return;
  }

  const name = detail?.values?.name?.trim?.() || "";
  const description = detail?.values?.description?.trim?.() || "";
  if (!name) {
    appService.showAlert({ message: "Project Name is required." });
    return;
  }

  try {
    const result = await apiService.createProject({
      authToken: cloudSession.authToken,
      name,
      description,
    });
    const project = mapCloudProject(result?.project);
    if (!project.id) {
      throw new Error("Project was created but response is invalid.");
    }

    store.addCloudProject({ project });
    store.closeCloudCreateDialog();
    render();
  } catch {
    appService.showAlert({
      message: "Failed to create cloud project. Please try again.",
    });
  }
};

export const handleOpenButtonClick = async (deps) => {
  const { appService, store, render } = deps;
  if (appService.getPlatform() === "web") {
    return;
  }

  try {
    const selectedPath = await appService.openFolderPicker({
      title: "Select Existing Project Folder",
    });

    if (!selectedPath) {
      return;
    }

    const importedProject = await appService.openExistingProject(selectedPath);
    const projects = await appService.loadAllProjects();
    store.setProjects({ projects });
    render();

    appService.showToast({
      message: `Project "${importedProject.name}" imported.`,
    });
  } catch (error) {
    appService.showAlert({
      message:
        error?.message ||
        "Failed to import project. Please select a valid project folder.",
    });
  }
};

export const handleLoginButtonClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/authenticate");
};

export const handleAvatarButtonClick = (deps, payload) => {
  const { store, render } = deps;
  store.openProfileMenu({
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
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
  const { store, render, appService } = deps;
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
    appService.showAlert({ message: "You are not logged in." });
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
  const { store, render, appService } = deps;
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
    appService.showAlert({ message: "Email is required." });
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
  const { store, render, appService } = deps;
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
      title: "Logout",
      message: "Are you sure you want to logout?",
      confirmText: "Logout",
      cancelText: "Cancel",
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
  const { appService, projectService, store } = deps;
  const id = getProjectIdFromEvent(payload._event);
  if (!id) {
    appService.showAlert({
      message:
        "This project entry is invalid. Remove it from the list and import the project again.",
    });
    return;
  }

  const project = store.getState().projects.find((entry) => entry?.id === id);

  try {
    await projectService.ensureProjectCompatibleById(id);
  } catch (error) {
    if (isIncompatibleProjectVersionError(error)) {
      await appService.showAlert({
        title: "Incompatible Project",
        message: getIncompatibleProjectMessage(error),
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

  appService.navigate("/project", { p: id });
};

export const handleProjectContextMenu = (deps, payload) => {
  const { appService, store, render } = deps;
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
        message:
          "This project entry is invalid. Refresh the projects page and try again.",
      });
      return;
    }

    store.openDropdownMenu({
      x: payload._event.clientX,
      y: payload._event.clientY,
      scope: "local",
      projectPath,
    });
    render();
    return;
  }

  store.openDropdownMenu({
    x: payload._event.clientX,
    y: payload._event.clientY,
    scope: "local",
    projectId: projectId,
    projectPath,
  });
  render();
};

export const handleCloudProjectContextMenu = (deps, payload) => {
  const { appService, store, render } = deps;
  payload._event.preventDefault();

  const projectId = getProjectIdFromEvent(payload._event);
  if (!projectId) {
    appService.showAlert({
      message:
        "This project entry is invalid. Refresh the projects page and try again.",
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
    items: [{ label: "Add Member", type: "item", value: "add-member" }],
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

export const handleDeleteDialogCancel = (deps) => {
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
  const { appService, apiService, store, render } = deps;
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
    appService.showAlert({ message: "Please login to add a member." });
    return;
  }

  const projectId = store.selectAddMemberDialogProjectId();
  if (!projectId) {
    appService.showAlert({ message: "Cloud project is missing." });
    return;
  }

  const email = detail?.values?.email?.trim?.() || "";
  if (!email) {
    appService.showAlert({ message: "Email is required." });
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
      appService.showAlert({ message: "Member added." });
    } else if (alreadyMember > 0) {
      appService.showAlert({ message: "User is already a member." });
    } else if (userNotFound > 0) {
      appService.showAlert({ message: "User not found." });
    } else if (cannotAddOwner > 0) {
      appService.showAlert({
        message: "Project owner cannot be added as a member.",
      });
    } else {
      appService.showAlert({ message: "No member was added." });
    }

    await loadCloudProjects({
      appService,
      apiService,
      store,
      authToken: cloudSession.authToken,
    });
    store.closeAddMemberDialog();
    render();
  } catch {
    appService.showAlert({
      message: "Failed to add member. Please try again.",
    });
  }
};

export const handleDeleteDialogConfirm = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const projectId = store.selectDeleteDialogProjectId();
  const projectPath = store.selectDeleteDialogProjectPath();
  if (!projectId && !projectPath) {
    store.closeDeleteDialog();
    render();
    return;
  }

  let failedStage = "unknown";

  try {
    if (
      projectId &&
      typeof projectService?.releaseProjectRuntime === "function"
    ) {
      failedStage = "release_project_runtime";
      await projectService.releaseProjectRuntime(projectId);
    }

    if (projectId) {
      failedStage = "remove_project_entry";
      await appService.removeProjectEntry(projectId);
      store.removeProject({ projectId });
    } else {
      failedStage = "remove_project_entry_by_path";
      await appService.removeProjectEntryByPath(projectPath);
      store.removeProject({ projectPath });
    }
  } catch {
    appService.showAlert({
      message: "Failed to remove project. Please try again.",
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
