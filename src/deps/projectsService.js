import { convertFileSrc } from "@tauri-apps/api/core";
import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { nanoid } from "nanoid";

export const createProjectsService = (deps) => {
  const { keyValueStore, repositoryFactory } = deps;

  const loadProjectDataFromDatabase = async (projectPath) => {
    const repository = await repositoryFactory.getByPath(projectPath);
    const { project } = repository.getState();
    return project;
  };

  const loadProjectIcon = async (projectPath, iconFileId) => {
    if (!iconFileId || !projectPath) {
      return null;
    }

    try {
      const iconPath = await join(projectPath, "files", iconFileId);
      const exists = await exists(iconPath);

      if (exists) {
        return convertFileSrc(iconPath);
      }
    } catch (error) {
      console.warn(`Failed to load icon:`, error);
    }

    return null;
  };

  const loadAllProjects = async () => {
    // Load project entries from key-value store (only id, path, metadata)
    const projectEntries = (await keyValueStore.get("projects")) || [];

    // Load full project data from each project's database
    const projectsWithFullData = await Promise.all(
      projectEntries.map(async (entry) => {
        try {
          const projectState = await loadProjectDataFromDatabase(
            entry.projectPath,
          );

          // Build complete project object with data from database
          const project = {
            id: entry.id,
            name: projectState.name || "Untitled Project",
            description: projectState.description || "",
            iconFileId: projectState.iconFileId || null,
            projectPath: entry.projectPath,
            createdAt: entry.createdAt,
            lastOpenedAt: entry.lastOpenedAt,
            versions: entry.versions || [],
          };

          // Load icon URL if iconFileId exists
          const iconUrl = await loadProjectIcon(
            project.projectPath,
            project.iconFileId,
          );
          if (iconUrl) {
            project.iconUrl = iconUrl;
          }

          return project;
        } catch (error) {
          console.error(`Failed to load project data for ${entry.id}:`, error);
          // Return minimal project data if database read fails
          return {
            id: entry.id,
            name: "Error loading project",
            description: "Unable to read project data",
            projectPath: entry.projectPath,
            createdAt: entry.createdAt,
            lastOpenedAt: entry.lastOpenedAt,
            versions: entry.versions || [],
          };
        }
      }),
    );

    return projectsWithFullData;
  };

  const validateProjectFolder = async (folderPath) => {
    try {
      // Check for repository.db
      const dbPath = await join(folderPath, "repository.db");
      const dbExists = await exists(dbPath);

      // Check for files folder
      const filesPath = await join(folderPath, "files");
      const filesExists = await exists(filesPath);

      if (!dbExists || !filesExists) {
        const missing = [];
        if (!dbExists) missing.push("repository.db");
        if (!filesExists) missing.push("files folder");

        return {
          isValid: false,
          error: `Missing ${missing.join(" and ")}`,
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error.message || error,
      };
    }
  };

  const importProject = async (projectPath) => {
    // Read project data from database
    const projectState = await loadProjectDataFromDatabase(projectPath);

    // Require project name and description from database
    if (!projectState.name || !projectState.description) {
      throw new Error(
        "Project database is missing required project information (name or description)",
      );
    }

    return {
      name: projectState.name,
      description: projectState.description,
      iconFileId: projectState.iconFileId || null,
    };
  };

  const addProjectEntry = async (projectEntry) => {
    const projectEntries = (await keyValueStore.get("projects")) || [];

    // Check if this project path already exists
    const existingProject = projectEntries.find(
      (p) => p.projectPath === projectEntry.projectPath,
    );

    if (existingProject) {
      throw new Error("This project has already been added.");
    }

    projectEntries.push(projectEntry);
    await keyValueStore.set("projects", projectEntries);
  };

  const openExistingProject = async (folderPath) => {
    // Validate project folder
    const validation = await validateProjectFolder(folderPath);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Import project data from database
    const projectData = await importProject(folderPath);

    // Generate a unique device-local project ID

    const deviceProjectId = nanoid();

    // Create imported project entry
    const projectEntry = {
      id: deviceProjectId,
      projectPath: folderPath,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    // Add to storage
    await addProjectEntry(projectEntry);

    // Return full project object with data from database
    const fullProject = {
      ...projectEntry,
      name: projectData.name,
      description: projectData.description,
      iconFileId: projectData.iconFileId,
    };

    // Load icon URL if exists
    if (projectData.iconFileId) {
      const iconUrl = await loadProjectIcon(folderPath, projectData.iconFileId);
      if (iconUrl) {
        fullProject.iconUrl = iconUrl;
      }
    }

    return fullProject;
  };

  const createNewProject = async ({
    name,
    description,
    projectPath,
    template,
    initializeProject,
  }) => {
    // Check if the selected directory is empty
    const entries = await readDir(projectPath);
    if (entries.length > 0) {
      throw new Error(
        "The selected folder must be empty. Please choose an empty folder for your new project.",
      );
    }

    // Generate a unique device-local project ID
    const deviceProjectId = nanoid();

    // Create new project entry
    const projectEntry = {
      id: deviceProjectId,
      projectPath,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    // Initialize project structure and database
    await initializeProject({
      name,
      description,
      projectPath,
      template,
    });

    // Add to storage
    await addProjectEntry(projectEntry);

    // Return full project object
    return {
      ...projectEntry,
      name,
      description,
      iconFileId: null,
    };
  };

  const removeProjectEntry = async (projectId) => {
    const projectEntries = (await keyValueStore.get("projects")) || [];
    const updatedEntries = projectEntries.filter((p) => p.id !== projectId);
    await keyValueStore.set("projects", updatedEntries);
  };

  const addVersionToProject = async (projectId, version) => {
    const projectEntries = await keyValueStore.get("projects");
    const projectIndex = projectEntries.findIndex((p) => p.id === projectId);
    
    if (projectIndex === -1) {
      throw new Error("Project not found");
    }
    
    if (!projectEntries[projectIndex].versions) {
      projectEntries[projectIndex].versions = [];
    }
    
    projectEntries[projectIndex].versions.unshift(version);
    await keyValueStore.set("projects", projectEntries);
  };

  const deleteVersionFromProject = async (projectId, versionId) => {
    const projectEntries = await keyValueStore.get("projects");
    const projectIndex = projectEntries.findIndex((p) => p.id === projectId);
    
    if (projectIndex === -1) {
      throw new Error("Project not found");
    }
    
    if (!projectEntries[projectIndex].versions) {
      throw new Error("No versions found for this project");
    }
    
    projectEntries[projectIndex].versions = projectEntries[projectIndex].versions.filter(
      (v) => v.id !== versionId
    );
    await keyValueStore.set("projects", projectEntries);
  };

  return {
    loadAllProjects,
    loadProjectDataFromDatabase,
    loadProjectIcon,
    validateProjectFolder,
    importProject,
    addProjectEntry,
    openExistingProject,
    createNewProject,
    removeProjectEntry,
    addVersionToProject,
    deleteVersionFromProject,
  };
};
