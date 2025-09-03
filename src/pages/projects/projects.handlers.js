import { nanoid } from "nanoid";
import { invoke } from "@tauri-apps/api/core";
import { mkdir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import {
  fetchTemplateImages,
  fetchTemplateFonts,
} from "../../utils/templateSetup";
import { createTemplateProjectData } from "../../utils/templateProjectData";

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
  const { keyValueStore, subject } = deps;
  const id = e.currentTarget.id.replace("project-", "");

  // Save last opened project
  await keyValueStore.set("lastOpenedProjectId", id);

  // Navigate to project page - the page will need to be refreshed to use the new database
  subject.dispatch("redirect", {
    path: `/project`,
  });

  // Reload the page to reinitialize with the project database
  window.location.reload();
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

    try {
      // Create files subfolder for assets
      const filesPath = await join(projectPath, "files");
      await mkdir(filesPath, { recursive: true });

      // Create templates subfolder
      const templatesPath = await join(projectPath, "templates");
      await mkdir(templatesPath, { recursive: true });

      // Initialize database and add template data if needed
      if (template === "default") {
        const { uploadImageFiles, uploadFontFiles } = deps;

        // Define initial data structure (same as in setup.tauri.js)
        const initialData = {
          project: {
            name: name,
            description: description,
          },
          images: { items: {}, tree: [] },
          animations: { items: {}, tree: [] },
          audio: { items: {}, tree: [] },
          videos: { items: {}, tree: [] },
          characters: { items: {}, tree: [] },
          fonts: { items: {}, tree: [] },
          transforms: { items: {}, tree: [] },
          colors: { items: {}, tree: [] },
          typography: { items: {}, tree: [] },
          variables: { items: {}, tree: [] },
          components: { items: {}, tree: [] },
          layouts: { items: {}, tree: [] },
          preset: { items: {}, tree: [] },
          scenes: { items: {}, tree: [] },
        };

        // Initialize repository to add template data
        const { createTauriSQLiteRepositoryAdapter } = await import(
          "../../deps/tauriRepositoryAdapter"
        );
        const { createRepository } = await import("../../deps/repository");

        const adapter = await createTauriSQLiteRepositoryAdapter(projectPath);
        const repo = createRepository(initialData, adapter);
        await repo.init();

        // Fetch template resources
        const templateImagesData = await fetchTemplateImages(uploadImageFiles);
        const templateFontsData = await fetchTemplateFonts(uploadFontFiles);

        // Create template data
        const templateData = createTemplateProjectData(
          templateImagesData.fetchedImages,
          templateFontsData.fetchedFonts,
        );

        // Prepare init data
        const initData = {
          images: {
            items: templateImagesData.imageItems,
            tree: templateImagesData.imageTree,
          },
          fonts: {
            items: {
              ...templateFontsData.fontItems,
              ...templateData.fonts.items,
            },
            tree: [...templateFontsData.fontTree, ...templateData.fonts.tree],
          },
          animations: templateData.animations,
          transforms: templateData.transforms,
          layouts: templateData.layouts,
          scenes: templateData.scenes,
        };

        // Use init action to set all template data at once
        await repo.addAction({
          actionType: "init",
          target: null,
          value: initData,
        });

        // Close the adapter
        await adapter.close();

        console.log("Template project created with data");
      } else {
        // Just initialize empty database
        await invoke("open_project_db", { projectPath });
        await invoke("close_project_db", { projectPath });
      }

      console.log(`Created project structure at: ${projectPath}`);
    } catch (error) {
      console.error("Failed to create project structure:", error);
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
