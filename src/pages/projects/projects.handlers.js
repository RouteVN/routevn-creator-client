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

export const handleFormSubmit = async (e, deps) => {
  const { keyValueStore, store, render } = deps;

  try {
    // Check if it's the submit button
    if (e.detail.actionId !== "submit") {
      return;
    }

    const { name, description } = e.detail.formValues;

    // Validate input
    if (!name || !description) {
      return;
    }

    // Generate a simple ID
    const projectId = "project_" + Date.now();

    // Create new project
    const newProject = {
      id: projectId,
      name,
      description,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

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
