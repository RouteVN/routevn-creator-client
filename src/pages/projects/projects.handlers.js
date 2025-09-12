import { nanoid } from "nanoid";
import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";

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

export const handleOpenButtonClick = async (payload, deps) => {
  const { keyValueStore, store, render, tauriDialog } = deps;

  try {
    // Open folder selection dialog
    const selected = await tauriDialog.openFolderDialog({
      title: "Select Existing Project Folder",
    });

    if (!selected) {
      return; // User cancelled
    }

    // Default to blocking
    let canProceed = false;

    try {
      // Check for repository.db
      const dbPath = await join(selected, "repository.db");
      const dbExists = await exists(dbPath);

      // Check for files folder
      const filesPath = await join(selected, "files");
      const filesExists = await exists(filesPath);

      if (dbExists && filesExists) {
        canProceed = true;
      } else {
        const missing = [];
        if (!dbExists) missing.push("repository.db");
        if (!filesExists) missing.push("files folder");

        alert(
          `Cannot open project: Missing ${missing.join(" and ")}. Please select a valid project folder.`,
        );
        return;
      }
    } catch (error) {
      console.error("Error validating project folder:", error);
      alert(
        `Cannot validate project folder: ${error.message || error}. Please choose a different folder.`,
      );
      return;
    }

    // Only proceed if explicitly confirmed the project is valid
    if (!canProceed) {
      alert("Cannot verify project folder. Please choose a different folder.");
      return;
    }

    // Read project name and description from the database
    let projectName;
    let projectDescription;

    try {
      const dbPath = await join(selected, "repository.db");
      const db = await Database.load(`sqlite:${dbPath}`);

      // Get all actions to build the current state
      const results = await db.select(
        "SELECT action_type, target, value FROM actions ORDER BY id",
      );

      // Build the project state from all actions
      let projectState = {};

      for (const row of results) {
        if (row.action_type === "init" && row.value) {
          const initData = JSON.parse(row.value);
          if (initData.project) {
            projectState = { ...initData.project };
          }
        } else if (row.action_type === "set" && row.target) {
          // Handle set actions for project fields
          if (row.target === "project.name") {
            projectState.name = row.value;
          } else if (row.target === "project.description") {
            projectState.description = row.value;
          }
        }
      }

      // Require project name and description from database
      if (!projectState.name || !projectState.description) {
        throw new Error(
          "Project database is missing required project information (name or description)",
        );
      }

      projectName = projectState.name;
      projectDescription = projectState.description;
    } catch (error) {
      console.error("Failed to read project information from database:", error);
      alert(
        `Cannot import project: Failed to read project information from database. ${error.message || error}`,
      );
      return;
    }

    // Generate a unique device-local project ID
    const deviceProjectId = nanoid();

    // Create imported project entry
    const importedProject = {
      id: deviceProjectId,
      name: projectName,
      description: projectDescription,
      projectPath: selected,
      template: "imported",
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    // Get existing projects
    const projects = (await keyValueStore.get("projects")) || [];

    // Check if this project path already exists
    const existingProject = projects.find((p) => p.projectPath === selected);
    if (existingProject) {
      alert("This project has already been imported.");
      return;
    }

    // Add imported project
    projects.push(importedProject);

    // Save to key-value store
    await keyValueStore.set("projects", projects);

    // Update store
    store.setProjects(projects);

    render();

    alert(`Project "${projectName}" has been successfully imported.`);
  } catch (error) {
    console.error("Error importing project:", error);
    alert(`Failed to import project: ${error.message || error}`);
  }
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

    // Check if the selected directory is empty
    let canProceed = false;
    try {
      const entries = await readDir(projectPath);
      if (entries.length === 0) {
        canProceed = true;
      } else {
        alert(
          "The selected folder must be empty. Please choose an empty folder for your new project.",
        );
        return;
      }
    } catch (error) {
      console.error("Cannot read directory:", error);
      alert(
        `Cannot access the selected folder: ${error.message || error}. Please choose a different folder.`,
      );
      return;
    }

    // Only proceed if explicitly confirmed it's safe
    if (!canProceed) {
      alert(
        "Cannot verify if the selected folder is empty. Please choose a different folder.",
      );
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
      const { initializeProject } = deps;

      await initializeProject({
        name,
        description,
        projectPath,
        template,
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

export const handleProjectContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  const projectId = e.currentTarget.id.replace("project-", "");
  const projects = store.selectProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return;
  }

  store.openDropdownMenu({
    x: e.clientX,
    y: e.clientY,
    projectId: projectId,
  });
  render();
};

export const handleDropdownMenuClose = (e, deps) => {
  const { store, render } = deps;
  store.closeDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (e, deps) => {
  const { store, render, keyValueStore } = deps;
  const detail = e.detail;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  if (item.value !== "delete") {
    // Hide dropdown for non-delete actions
    store.closeDropdownMenu();
    render();
    return;
  }

  // Get projectId BEFORE closing dropdown (important!)
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

  // Close dropdown before showing confirm dialog
  store.closeDropdownMenu();
  render();

  // Check if the result is a Promise (tauri override) or boolean (native)
  // Handle both sync and async confirm dialogs
  let confirmed;
  const confirmResult = window.confirm(
    `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
  );
  if (confirmResult instanceof Promise) {
    confirmed = await confirmResult;
  } else {
    confirmed = confirmResult;
  }

  if (!confirmed) {
    return;
  }

  // Delete the project only after confirmation
  const allProjects = (await keyValueStore.get("projects")) || [];
  const updatedProjects = allProjects.filter((p) => p.id !== projectId);
  await keyValueStore.set("projects", updatedProjects);
  store.setProjects(updatedProjects);
  render();
};
