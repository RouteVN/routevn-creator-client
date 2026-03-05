const getSessionAuthToken = (appService) => {
  const authSession = appService.getUserConfig("auth.session");
  const authToken = authSession?.authToken?.trim?.() ?? "";
  return authToken;
};

const mapApiUserToAuthUser = (user) => {
  const id = user?.id;
  const email = user?.email;
  const name = user?.creatorDisplayName;
  const displayColor = user?.creatorDisplayColor ?? "#E2E8F0";
  const avatar = user?.creatorDisplayAvatar;

  return {
    id,
    email,
    name,
    displayColor,
    avatar,
    registered: true,
  };
};

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

const loadCloudProjects = async ({ appService, apiService, store }) => {
  const authToken = getSessionAuthToken(appService);
  if (!authToken) {
    store.setCloudProjects({ projects: [] });
    return;
  }

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
  store.setPlatform({ platform: platform });
  const authUser = appService.getUserConfig("auth.user");
  store.setAuthUser({ user: authUser });

  const authToken = getSessionAuthToken(appService);
  if (authToken) {
    try {
      await loadCloudProjects({ appService, apiService, store });
    } catch (error) {
      console.error("Failed to load cloud profile:", error);
      store.setCloudProjects({ projects: [] });
    }
  } else {
    store.setCloudProjects({ projects: [] });
  }

  const projects = await appService.loadAllProjects();
  store.setProjects({ projects: projects });
  render();
};

const getProjectIdFromEvent = (event) => {
  return event?.currentTarget?.dataset?.projectId ?? "";
};

const buildProjectPageUrl = (projectId) => {
  const query = new URLSearchParams({ p: projectId }).toString();
  return `/project?${query}`;
};

export const handleCreateButtonClick = async (deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

export const handleCloudCreateButtonClick = (deps) => {
  const { appService, store, render } = deps;
  const authToken = getSessionAuthToken(appService);
  if (!authToken) {
    appService.showToast("Please login to create a cloud project.");
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

  const authToken = getSessionAuthToken(appService);
  if (!authToken) {
    appService.showToast("Please login to create a cloud project.");
    return;
  }

  const name = detail?.values?.name?.trim?.() || "";
  const description = detail?.values?.description?.trim?.() || "";
  if (!name) {
    appService.showToast("Project Name is required.");
    return;
  }

  try {
    const result = await apiService.createProject({
      authToken,
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
  } catch (error) {
    console.error("Failed to create cloud project:", error);
    appService.showToast(
      error?.message || "Failed to create cloud project. Please try again.",
    );
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

    store.addProject({ project: importedProject });
    render();

    appService.showToast(
      `Project "${importedProject.name}" has been successfully imported.`,
    );
  } catch (error) {
    console.error("Error importing project:", error);
    appService.showToast(`Failed to import project: ${error.message || error}`);
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
    appService.showToast("You are not logged in.");
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
    appService.showToast("Email is required.");
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

    appService.setUserConfig("auth.session", null);
    appService.setUserConfig("auth.user", null);
    store.setAuthUser({ user: null });
    store.setCloudProjects({ projects: [] });
    render();
  }
};

export const handleCloseDialogue = (deps) => {
  const { render, store } = deps;
  if (!store.selectIsCreateDialogOpen()) {
    return;
  }
  store.closeDialog();
  render();
};

export const handleProjectsClick = async (deps, payload) => {
  const id = getProjectIdFromEvent(payload._event);
  if (!id) {
    return;
  }
  window.location.assign(buildProjectPageUrl(id));
};

export const handleBrowseFolder = async (deps) => {
  const { appService, store, render } = deps;
  if (appService.getPlatform() === "web") {
    return;
  }

  try {
    const selected = await appService.openFolderPicker({
      title: "Select Project Location",
    });

    if (selected) {
      store.setProjectPath({ path: selected });
      render();
    }
  } catch (error) {
    console.error("Error selecting folder:", error);
    appService.showToast(`Error selecting folder: ${error.message || error}`);
  }
};

export const handleFormSubmit = async (deps, payload) => {
  const { appService, store, render } = deps;
  const platform = appService.getPlatform();

  try {
    if (payload._event.detail.actionId !== "submit") {
      return;
    }

    const {
      name,
      description,
      template = "default",
    } = payload._event.detail.values;

    if (name === "_TEST_FILE_PERMISSIONS_") {
      window.location.href = "/test-permissions.html";
      return;
    }

    const projectPath = store.selectProjectPath();

    if (!name || !description || (platform !== "web" && !projectPath)) {
      let message = "Please fill in all required fields.";
      if (!name) {
        message = "Project Name is required.";
      } else if (!description) {
        message = "Project Description is required.";
      } else if (platform !== "web" && !projectPath) {
        message = "Project Location is required.";
      }

      appService.showToast(message);
      return;
    }

    const newProject = await appService.createNewProject({
      name,
      description,
      projectPath,
      template,
    });

    store.addProject({ project: newProject });
    store.closeDialog();
    render();
  } catch (error) {
    console.error("Error creating project:", error);
    appService.showToast(`Failed to create project: ${error.message}`);
  }
};

export const handleProjectContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const projectId = getProjectIdFromEvent(payload._event);
  if (!projectId) {
    return;
  }
  const projects = store.selectProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return;
  }

  store.openDropdownMenu({
    x: payload._event.clientX,
    y: payload._event.clientY,
    scope: "local",
    projectId: projectId,
  });
  render();
};

export const handleCloudProjectContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const projectId = getProjectIdFromEvent(payload._event);
  if (!projectId) {
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

  const authToken = getSessionAuthToken(appService);
  if (!authToken) {
    appService.showToast("Please login to add a member.");
    return;
  }

  const projectId = store.selectAddMemberDialogProjectId();
  if (!projectId) {
    appService.showToast("Cloud project is missing.");
    return;
  }

  const email = detail?.values?.email?.trim?.() || "";
  if (!email) {
    appService.showToast("Email is required.");
    return;
  }

  try {
    const result = await apiService.addMembers({
      authToken,
      projectId,
      memberEmails: [email],
    });

    const added = Number(result?.summary?.added || 0);
    const alreadyMember = Number(result?.summary?.alreadyMember || 0);
    const userNotFound = Number(result?.summary?.userNotFound || 0);
    const cannotAddOwner = Number(result?.summary?.cannotAddOwner || 0);

    if (added > 0) {
      appService.showToast("Member added.");
    } else if (alreadyMember > 0) {
      appService.showToast("User is already a member.");
    } else if (userNotFound > 0) {
      appService.showToast("User not found.");
    } else if (cannotAddOwner > 0) {
      appService.showToast("Project owner cannot be added as a member.");
    } else {
      appService.showToast("No member was added.");
    }

    await loadCloudProjects({ appService, apiService, store });
    store.closeAddMemberDialog();
    render();
  } catch (error) {
    console.error("Failed to add member:", error);
    appService.showToast(error?.message || "Failed to add member.");
  }
};

export const handleDeleteDialogConfirm = async (deps) => {
  const { appService, store, render } = deps;
  const projectId = store.selectDeleteDialogProjectId();
  if (!projectId) {
    store.closeDeleteDialog();
    render();
    return;
  }

  try {
    await appService.removeProjectEntry(projectId);
    store.removeProject({ projectId });
  } catch (error) {
    console.error("Error deleting project:", error);
    appService.showToast(`Failed to delete project: ${error.message || error}`);
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

  if (!projectId) {
    console.warn("No projectId found for deletion");
    store.closeDropdownMenu();
    render();
    return;
  }

  const projects = store.selectProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    console.warn("Project not found for deletion:", projectId);
    store.closeDropdownMenu();
    render();
    return;
  }

  store.closeDropdownMenu();
  store.openDeleteDialog({
    projectId: projectId,
    projectName: project.name || "",
  });
  render();
};
