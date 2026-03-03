export const handleAfterMount = async (deps) => {
  const { appService, store, render } = deps;
  const platform = appService.getPlatform();
  store.setPlatform({ platform: platform });
  const authUser = appService.getUserConfig("auth.user");
  store.setAuthUser({ user: authUser });
  const projects = await appService.loadAllProjects();
  store.setProjects({ projects: projects });
  render();
};

const getProjectIdFromEvent = (event) => {
  return (
    event?.currentTarget?.getAttribute?.("data-project-id") ||
    event?.currentTarget?.id?.replace("project", "") ||
    ""
  );
};

export const handleCreateButtonClick = async (deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
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

    appService.setUserConfig("auth.user", null);
    store.setAuthUser({ user: null });
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
  const { appService } = deps;
  const id = getProjectIdFromEvent(payload._event);
  if (!id) {
    return;
  }
  appService.navigate("/project", { p: id });
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
    projectId: projectId,
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

  if (item.value !== "delete") {
    store.closeDropdownMenu();
    render();
    return;
  }

  const projectId = store.selectDropdownMenuTargetProjectId();

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
