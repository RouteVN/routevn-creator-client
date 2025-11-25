import { nanoid } from "nanoid";

export const createWebProjectsService = (deps) => {
  const { keyValueStore, initializeWebProject, fileManagerFactory } = deps;

  const loadProjectIcon = async (projectId, iconFileId) => {
    if (!iconFileId) return null;
    const fileManager = await fileManagerFactory.getByProject(projectId);
    const { url } = await fileManager.getFileContent({ fileId: iconFileId });
    return url;
  };

  const loadAllProjects = async () => {
    const projectEntries = (await keyValueStore.get("projects")) || [];

    const projectsWithIcons = await Promise.all(
      projectEntries.map(async (project) => {
        if (project.iconFileId) {
          const iconUrl = await loadProjectIcon(project.id, project.iconFileId);
          return { ...project, iconUrl };
        }
        return project;
      }),
    );

    return projectsWithIcons;
  };

  const createNewProject = async ({
    name,
    description,
    template,
    repositoryFactory,
    storageAdapterFactory,
  }) => {
    const projectId = nanoid();

    const projectEntry = {
      id: projectId,
      name,
      description,
      createdAt: Date.now(),
      lastOpenedAt: null,
      iconFileId: null,
    };

    await initializeWebProject({
      repositoryFactory,
      storageAdapterFactory,
      template,
      projectId, 
    });

    const projectEntries = (await keyValueStore.get("projects")) || [];
    projectEntries.push(projectEntry);
    await keyValueStore.set("projects", projectEntries);

    return projectEntry;
  };

  const removeProjectEntry = async (projectId) => {
    const projectEntries = (await keyValueStore.get("projects")) || [];
    const updatedEntries = projectEntries.filter((p) => p.id !== projectId);
    await keyValueStore.set("projects", updatedEntries);
  };

  return {
    loadAllProjects,
    createNewProject,
    removeProjectEntry,
  };
};
