import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { keyValueStore, store, render } = deps;

  // Load projects from key-value store
  const projects = await keyValueStore.get("projects");
  store.setProjects(projects || []);
  render();
};

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
  const { subject } = deps;
  const id = e.currentTarget.id.replace("project-", "");
  subject.dispatch("redirect", {
    path: `/project`,
    payload: {
      p: id,
    },
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

      // TODO: improve initializeProject
      // there should be tempalte management system, where we get the template data from a templateId
      // clean way to copy all files to project
      // clean way to write all repository data for the template
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

  const projects = (await keyValueStore.get("projects")) || [];
  const updatedProjects = projects.filter((p) => p.id !== projectId);
  await keyValueStore.set("projects", updatedProjects);
  store.setProjects(updatedProjects);

  render();
};
