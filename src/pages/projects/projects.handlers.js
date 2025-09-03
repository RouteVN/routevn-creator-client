import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { keyValueStore, store, render } = deps;

  // Load projects from key-value store (async but don't await)
  keyValueStore.get("projects").then((projects) => {
    store.setProjects(projects || []);
    render();
  });
};

// const createSubscriptions = (deps) => {
//   const { subject } = deps;
//   return [
//     windowPop$(window, deps.handleWindowPop),
//     filter$(subject, [Actions.router.redirect, Actions.router.replace], deps._redirect),
//     filter$(subject, Actions.router.back, deps._handleBack),
//     filter$(subject, Actions.notification.notify, deps._toastNotify),
//     windowResize$(window, deps._handleWindowResize),
//   ]
// }

export const handleCreateButtonClick = async (payload, deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

export const handleCloseDialogue = (payload, deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

export const handleProjectsClick = async (e, deps) => {
  const { keyValueStore, subject } = deps;
  const id = e.currentTarget.id.replace("project-", "");

  // Save last opened project
  await keyValueStore.set("lastOpenedProjectId", id);

  // Navigate to project page
  subject.dispatch("redirect", {
    path: `/project`,
  });
};

export const handleBrowseFolder = async (e, deps) => {
  const { store, render } = deps;

  try {
    // Import Tauri dialog API
    const { open } = await import("@tauri-apps/plugin-dialog");

    // Open folder selection dialog
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Project Location",
    });

    if (selected) {
      // Update the form's default value for projectPath
      store.setProjectPath(selected);
      render();
    }
  } catch (error) {
    console.error("Error selecting folder:", error);
  }
};

export const handleFormSubmit = async (e, deps) => {
  const { keyValueStore, store, render } = deps;

  try {
    // Check if it's the submit button
    if (e.detail.actionId !== "submit") {
      return;
    }

    const { name, description, template } = e.detail.formValues;
    // Slot fields need to be retrieved from store using select function
    const projectPath = store.selectProjectPath();

    // Validate input
    if (!name || !description || !projectPath) {
      return;
    }

    // Generate a simple ID
    const projectId = "project_" + nanoid();

    // Create new project
    const newProject = {
      id: projectId,
      name,
      description,
      projectPath,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    // TODO: Create project folder structure
    // - Create project folder at projectPath/projectId
    // - Create project.db in project folder
    // - Create files/ subfolder for assets
    // - Initialize project with template data

    // Get existing projects
    const projects = (await keyValueStore.get("projects")) || [];

    // Add new project
    projects.push(newProject);

    // Save to key-value store
    await keyValueStore.set("projects", projects);

    // Update store and close dialog
    store.setProjects(projects);
    store.toggleDialog();

    render();
  } catch (error) {
    console.error("Error in handleFormSubmit:", error);
  }
};

export const handleDeleteProject = async (projectId, deps) => {
  const { keyValueStore, store, render } = deps;

  // Get existing projects
  const projects = (await keyValueStore.get("projects")) || [];

  // Filter out the deleted project
  const updatedProjects = projects.filter((p) => p.id !== projectId);

  // Save to key-value store
  await keyValueStore.set("projects", updatedProjects);

  // Update store
  store.setProjects(updatedProjects);

  render();
};
