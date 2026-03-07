const createEmptyProjectEntry = ({ id = "", source = "local" } = {}) => ({
  id,
  source,
  name: "",
  description: "",
  iconFileId: null,
});

const normalizeLocalProjectEntry = (entry) => ({
  ...entry,
  source: "local",
  name: entry?.name ?? "",
  description: entry?.description ?? "",
  iconFileId: entry?.iconFileId ?? null,
});

export const createProjectEntriesService = ({
  db,
  getCurrentProjectId,
  projectService,
  platformAdapter,
}) => {
  let currentProjectEntry = createEmptyProjectEntry();
  const iconCleanupByProjectId = new Map();

  const setProjectIcon = ({ project, iconResult }) => {
    if (!project?.id) {
      return project;
    }

    const previousCleanup = iconCleanupByProjectId.get(project.id);
    if (typeof previousCleanup === "function") {
      previousCleanup();
      iconCleanupByProjectId.delete(project.id);
    }

    if (!iconResult) {
      return project;
    }

    if (typeof iconResult === "string") {
      project.iconUrl = iconResult;
      return project;
    }

    if (iconResult?.url) {
      project.iconUrl = iconResult.url;
      if (typeof iconResult.cleanup === "function") {
        iconCleanupByProjectId.set(project.id, iconResult.cleanup);
      }
    }

    return project;
  };

  const pruneIconCleanup = (projects = []) => {
    const activeIds = new Set(projects.map((project) => project.id));
    for (const [projectId, cleanup] of iconCleanupByProjectId.entries()) {
      if (activeIds.has(projectId)) {
        continue;
      }
      cleanup?.();
      iconCleanupByProjectId.delete(projectId);
    }
  };

  const resolveCurrentProjectEntry = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      return createEmptyProjectEntry();
    }

    try {
      const entries = (await db.get("projectEntries")) || [];
      if (!Array.isArray(entries)) {
        return createEmptyProjectEntry({ id: projectId, source: "local" });
      }

      const localEntry = entries.find((entry) => entry?.id === projectId);
      if (localEntry) {
        return normalizeLocalProjectEntry(localEntry);
      }

      return createEmptyProjectEntry({
        id: projectId,
        source: "cloud",
      });
    } catch {
      return createEmptyProjectEntry({ id: projectId, source: "local" });
    }
  };

  const refreshCurrentProjectEntry = async () => {
    currentProjectEntry = await resolveCurrentProjectEntry();
    return currentProjectEntry;
  };

  const getProjectEntries = async () => {
    return (await db.get("projectEntries")) || [];
  };

  const addProjectEntry = async (entry) => {
    const entries = await getProjectEntries();
    const isDuplicate = platformAdapter.isDuplicateProjectEntry?.({
      entries,
      entry,
    });
    if (isDuplicate) {
      throw new Error("This project has already been added.");
    }

    entries.push(entry);
    await db.set("projectEntries", entries);
    if (entry?.id === getCurrentProjectId()) {
      currentProjectEntry = normalizeLocalProjectEntry(entry);
    }
    return entries;
  };

  const removeProjectEntry = async (projectId) => {
    const entries = await getProjectEntries();
    const filtered = entries.filter((entry) => entry.id !== projectId);
    await db.set("projectEntries", filtered);
    if (currentProjectEntry.id === projectId) {
      const routeProjectId = getCurrentProjectId();
      currentProjectEntry = routeProjectId
        ? createEmptyProjectEntry({ id: routeProjectId, source: "cloud" })
        : createEmptyProjectEntry();
    }

    const cleanup = iconCleanupByProjectId.get(projectId);
    cleanup?.();
    iconCleanupByProjectId.delete(projectId);
    return filtered;
  };

  const updateProjectEntry = async (projectId, updates) => {
    const entries = await getProjectEntries();
    const index = entries.findIndex((entry) => entry.id === projectId);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates };
      await db.set("projectEntries", entries);
      if (
        currentProjectEntry.id === projectId &&
        currentProjectEntry.source === "local"
      ) {
        currentProjectEntry = normalizeLocalProjectEntry(entries[index]);
      }
    }
    return entries;
  };

  return {
    async getProjectEntries() {
      return getProjectEntries();
    },

    async addProjectEntry(entry) {
      return addProjectEntry(entry);
    },

    async removeProjectEntry(projectId) {
      return removeProjectEntry(projectId);
    },

    async updateProjectEntry(projectId, updates) {
      return updateProjectEntry(projectId, updates);
    },

    async loadAllProjects() {
      const projectEntries = await getProjectEntries();
      const projectsWithFullData = await Promise.all(
        projectEntries.map(async (entry) => {
          const project = {
            id: entry.id,
            name: entry.name || "Untitled Project",
            description: entry.description || "",
            iconFileId: entry.iconFileId || null,
            createdAt: entry.createdAt,
            lastOpenedAt: entry.lastOpenedAt,
            ...platformAdapter.mapProjectEntryToProject?.(entry),
          };

          const iconResult = await platformAdapter.loadProjectIcon?.({
            entry,
            projectService,
          });
          return setProjectIcon({ project, iconResult });
        }),
      );

      pruneIconCleanup(projectsWithFullData);
      return projectsWithFullData;
    },

    async validateProjectFolder(folderPath) {
      return platformAdapter.validateProjectFolder(folderPath);
    },

    async importProject(projectPath) {
      return platformAdapter.importProject(projectPath);
    },

    async openExistingProject(folderPath) {
      return platformAdapter.openExistingProject({
        folderPath,
        addProjectEntry,
        loadProjectIcon: platformAdapter.loadProjectIcon,
        projectService,
      });
    },

    async createNewProject(payload) {
      return platformAdapter.createNewProject({
        ...payload,
        addProjectEntry,
        projectService,
      });
    },

    getCurrentProjectEntry() {
      return currentProjectEntry;
    },

    async refreshCurrentProjectEntry() {
      return refreshCurrentProjectEntry();
    },
  };
};
