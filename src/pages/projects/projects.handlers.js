import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { keyValueStore, store, render } = deps;

  // Load projects from key-value store
  const projects = await keyValueStore.get("projects");
  store.setProjects(projects || []);
  render();
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
  const { keyValueStore, subject, store, registerProject } = deps;
  const id = e.currentTarget.id.replace("project-", "");

  // Get project info
  const projects = store.selectProjects();
  const project = projects.find((p) => p.id === id);

  if (project && project.projectPath) {
    // Register project path for repository
    registerProject(id, project.projectPath);
  }

  // Save last opened project
  await keyValueStore.set("lastOpenedProjectId", id);

  // Navigate to project page
  subject.dispatch("redirect", {
    path: `/project`,
  });
};

export const handleBrowseFolder = async (e, deps) => {
  const { store, render, tauriDialog } = deps;

  try {
    // Open folder selection dialog using tauriDialog from deps
    const selected = await tauriDialog.openFolderDialog({
      title: "Select Project Location",
    });

    if (selected) {
      // Update the form's default value for projectPath
      store.setProjectPath(selected);
      render();
    }
  } catch (error) {
    console.error("Error selecting folder:", error);
    alert(`Error selecting folder: ${error.message || error}`);
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

    // Generate a unique device-local project ID
    // This is only for local app storage, not for backend
    const deviceProjectId = nanoid();

    // Create new project
    const newProject = {
      id: deviceProjectId,
      name,
      description,
      projectPath,
      template,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    // Initialize project using the service from deps
    try {
      const { initializeProject, uploadImageFiles, uploadFontFiles } = deps;

      await initializeProject({
        name,
        description,
        projectPath,
        template,
        uploadImageFiles,
        uploadFontFiles,
      });

      console.log(`Project created at: ${projectPath}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      alert(`Failed to create project: ${error.message}`);
      return;
    }

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
