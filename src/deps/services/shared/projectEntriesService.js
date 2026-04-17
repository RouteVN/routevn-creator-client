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
  let projectEntriesCache = [];
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
        const project = normalizeLocalProjectEntry(localEntry);
        const iconResult = await platformAdapter.loadProjectIcon?.({
          entry: project,
          projectService,
        });
        return setProjectIcon({ project, iconResult });
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
    const entries = (await db.get("projectEntries")) || [];
    projectEntriesCache = Array.isArray(entries)
      ? structuredClone(entries)
      : [];
    return entries;
  };

  const addProjectEntry = async (entry) => {
    const entries = await getProjectEntries();
    const existingEntryIndex = entries.findIndex(
      (candidate) => candidate?.id && candidate.id === entry?.id,
    );
    if (existingEntryIndex !== -1) {
      const existingEntry = entries[existingEntryIndex] || {};
      entries[existingEntryIndex] = {
        ...existingEntry,
        ...entry,
        createdAt: existingEntry.createdAt ?? entry?.createdAt,
        lastOpenedAt: existingEntry.lastOpenedAt ?? entry?.lastOpenedAt,
      };
      await db.set("projectEntries", entries);
      projectEntriesCache = structuredClone(entries);
      if (entry?.id === getCurrentProjectId()) {
        currentProjectEntry = normalizeLocalProjectEntry(
          entries[existingEntryIndex],
        );
      }
      return entries;
    }

    const isDuplicate = platformAdapter.isDuplicateProjectEntry?.({
      entries,
      entry,
    });
    if (isDuplicate) {
      throw new Error("This project has already been added.");
    }

    entries.push(entry);
    await db.set("projectEntries", entries);
    projectEntriesCache = structuredClone(entries);
    if (entry?.id === getCurrentProjectId()) {
      currentProjectEntry = normalizeLocalProjectEntry(entry);
    }
    return entries;
  };

  const removeProjectEntry = async (projectId) => {
    const entries = await getProjectEntries();
    const filtered = entries.filter((entry) => entry.id !== projectId);
    await db.set("projectEntries", filtered);
    projectEntriesCache = structuredClone(filtered);
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
      projectEntriesCache = structuredClone(entries);
      if (
        currentProjectEntry.id === projectId &&
        currentProjectEntry.source === "local"
      ) {
        currentProjectEntry = normalizeLocalProjectEntry(entries[index]);
      }
    }
    return entries;
  };

  const removeProjectEntryByPath = async (projectPath) => {
    if (!projectPath) {
      return getProjectEntries();
    }

    const entries = await getProjectEntries();
    const filtered = entries.filter(
      (entry) => entry?.projectPath !== projectPath,
    );
    await db.set("projectEntries", filtered);
    projectEntriesCache = structuredClone(filtered);

    if (currentProjectEntry?.projectPath === projectPath) {
      const routeProjectId = getCurrentProjectId();
      currentProjectEntry = routeProjectId
        ? createEmptyProjectEntry({ id: routeProjectId, source: "cloud" })
        : createEmptyProjectEntry();
    }

    return filtered;
  };

  const repairProjectEntries = async (entries = []) => {
    if (
      typeof projectService?.getProjectInfoByPath !== "function" ||
      !Array.isArray(entries) ||
      entries.length === 0
    ) {
      return Array.isArray(entries) ? entries : [];
    }

    let didChange = false;
    const nextEntries = [];

    for (const entry of entries) {
      let nextEntry = structuredClone(entry);

      if (!nextEntry?.id && nextEntry?.projectPath) {
        try {
          const projectInfo = await projectService.getProjectInfoByPath(
            nextEntry.projectPath,
          );
          if (projectInfo?.id) {
            nextEntry.id = projectInfo.id;
            nextEntry.name = projectInfo.name ?? nextEntry.name ?? "";
            nextEntry.description =
              projectInfo.description ?? nextEntry.description ?? "";
            nextEntry.iconFileId =
              projectInfo.iconFileId ?? nextEntry.iconFileId ?? null;
            didChange = true;
          }
        } catch {
          // Keep the stale entry visible so the user can remove it.
        }
      }

      const duplicateIndex = nextEntries.findIndex((candidate) => {
        if (nextEntry?.id && candidate?.id) {
          return candidate.id === nextEntry.id;
        }

        return (
          nextEntry?.projectPath &&
          candidate?.projectPath === nextEntry.projectPath
        );
      });

      if (duplicateIndex === -1) {
        nextEntries.push(nextEntry);
        continue;
      }

      nextEntries[duplicateIndex] = {
        ...nextEntries[duplicateIndex],
        ...nextEntry,
      };
      didChange = true;
    }

    if (!didChange) {
      return nextEntries;
    }

    await db.set("projectEntries", nextEntries);
    projectEntriesCache = structuredClone(nextEntries);
    return nextEntries;
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

    async removeProjectEntryByPath(projectPath) {
      return removeProjectEntryByPath(projectPath);
    },

    async updateProjectEntry(projectId, updates) {
      return updateProjectEntry(projectId, updates);
    },

    async loadAllProjects() {
      const projectEntries = await repairProjectEntries(
        await getProjectEntries(),
      );
      const projectsWithFullData = await Promise.all(
        projectEntries.map(async (entry) => {
          // projectEntries cache the current projectInfo snapshot for fast
          // listing without opening every project DB.
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

    setCurrentProjectEntry(entry) {
      if (!entry?.id) {
        currentProjectEntry = createEmptyProjectEntry();
        return currentProjectEntry;
      }

      const cachedEntry = projectEntriesCache.find(
        (projectEntry) => projectEntry?.id === entry.id,
      );

      currentProjectEntry = normalizeLocalProjectEntry(cachedEntry || entry);
      return currentProjectEntry;
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
