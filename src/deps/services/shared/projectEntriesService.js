import {
  normalizeProjectLanguage,
  requireProjectLanguage,
} from "../../../internal/projectLanguage.js";

const normalizeCachedProjectEntry = (entry = {}) => ({
  ...entry,
  language: normalizeProjectLanguage(entry.language),
});

const createEmptyProjectEntry = ({ id = "", source = "local" } = {}) => ({
  id,
  source,
  name: "",
  description: "",
  language: normalizeProjectLanguage(),
  iconFileId: null,
});

const normalizeLocalProjectEntry = (entry) => ({
  ...normalizeCachedProjectEntry(entry),
  source: "local",
  name: entry?.name ?? "",
  description: entry?.description ?? "",
  iconFileId: entry?.iconFileId ?? null,
});

const mergeProjectEntriesPreservingWorkingPath = (currentEntry, nextEntry) => {
  const mergedEntry = {
    ...currentEntry,
    ...nextEntry,
  };

  if (
    currentEntry?.id &&
    nextEntry?.id &&
    currentEntry.id === nextEntry.id &&
    currentEntry?.projectPath &&
    nextEntry?.projectPath &&
    currentEntry.projectPath !== nextEntry.projectPath
  ) {
    mergedEntry.projectPath = currentEntry.projectPath;
  }

  return mergedEntry;
};

export const createProjectEntriesService = ({
  db,
  getCurrentProjectId,
  projectService,
  platformAdapter,
}) => {
  let currentProjectEntry = createEmptyProjectEntry();
  let projectEntriesCache = [];
  let projectsCache;
  const cachedIconCleanupByProjectId = new Map();
  let currentProjectIconCleanup;

  const invalidateCachedProjectIcon = (projectId) => {
    const cachedProject = projectsCache?.find(
      (project) => project.id === projectId,
    );
    if (cachedProject) {
      delete cachedProject.iconUrl;
    }
  };

  const clearCachedProjectIcon = (projectId) => {
    cachedIconCleanupByProjectId.get(projectId)?.();
    cachedIconCleanupByProjectId.delete(projectId);
    invalidateCachedProjectIcon(projectId);
  };

  const clearCurrentProjectIcon = () => {
    currentProjectIconCleanup?.();
    currentProjectIconCleanup = undefined;
  };

  const mapProjectEntryToProject = (entry) => ({
    id: entry.id,
    name: entry.name || "Untitled Project",
    description: entry.description || "",
    language: normalizeProjectLanguage(entry.language),
    iconFileId: entry.iconFileId || null,
    createdAt: entry.createdAt,
    lastOpenedAt: entry.lastOpenedAt,
    ...platformAdapter.mapProjectEntryToProject?.(entry),
  });

  const setProjectsCache = (projects) => {
    projectsCache = structuredClone(projects);
  };

  const syncProjectsCacheFromEntries = (entries) => {
    const cachedProjectsById = new Map(
      (projectsCache ?? []).map((project) => [project.id, project]),
    );
    const projects = entries.map((entry) => {
      const project = mapProjectEntryToProject(entry);
      const cachedProject = cachedProjectsById.get(project.id);
      if (
        cachedProject?.iconUrl &&
        cachedProject.iconFileId === project.iconFileId
      ) {
        project.iconUrl = cachedProject.iconUrl;
      } else if (
        cachedProject &&
        cachedProject.iconFileId !== project.iconFileId
      ) {
        clearCachedProjectIcon(project.id);
      }
      return project;
    });

    const projectIds = new Set(projects.map((project) => project.id));
    for (const projectId of cachedIconCleanupByProjectId.keys()) {
      if (!projectIds.has(projectId)) {
        clearCachedProjectIcon(projectId);
      }
    }

    setProjectsCache(projects);
  };

  const cacheProject = (project) => {
    if (!project?.id || projectsCache === undefined) {
      return;
    }

    const existingIndex = projectsCache.findIndex(
      (cachedProject) => cachedProject.id === project.id,
    );
    if (existingIndex === -1) {
      projectsCache.push(structuredClone(project));
      return;
    }

    projectsCache[existingIndex] = structuredClone({
      ...projectsCache[existingIndex],
      ...project,
    });
  };

  const updateCachedProject = (projectId, updates) => {
    const normalizedUpdates = structuredClone(updates);
    if (Object.hasOwn(normalizedUpdates, "language")) {
      normalizedUpdates.language = normalizeProjectLanguage(
        normalizedUpdates.language,
      );
    }

    const entryIndex = projectEntriesCache.findIndex(
      (entry) => entry.id === projectId,
    );
    if (entryIndex !== -1) {
      projectEntriesCache[entryIndex] = {
        ...projectEntriesCache[entryIndex],
        ...normalizedUpdates,
      };
    }

    if (
      currentProjectEntry.id === projectId &&
      currentProjectEntry.source === "local"
    ) {
      const didCurrentIconChange =
        Object.hasOwn(normalizedUpdates, "iconFileId") &&
        normalizedUpdates.iconFileId !== currentProjectEntry.iconFileId;
      const nextCurrentProjectEntry = normalizeLocalProjectEntry({
        ...currentProjectEntry,
        ...normalizedUpdates,
      });
      if (didCurrentIconChange) {
        clearCurrentProjectIcon();
        delete nextCurrentProjectEntry.iconUrl;
      }
      currentProjectEntry = nextCurrentProjectEntry;
    }

    if (projectsCache === undefined) {
      return undefined;
    }

    const projectIndex = projectsCache.findIndex(
      (project) => project.id === projectId,
    );
    if (projectIndex === -1) {
      return undefined;
    }

    const previousProject = projectsCache[projectIndex];
    const project = {
      ...previousProject,
      ...normalizedUpdates,
    };
    const didIconChange =
      Object.hasOwn(normalizedUpdates, "iconFileId") &&
      normalizedUpdates.iconFileId !== previousProject.iconFileId;
    if (didIconChange) {
      delete project.iconUrl;
      clearCachedProjectIcon(projectId);
    }

    projectsCache[projectIndex] = structuredClone(project);
    return structuredClone(project);
  };

  const setProjectIcon = ({ project, iconResult, setCleanup }) => {
    if (!project?.id) {
      return project;
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
        setCleanup(iconResult.cleanup);
      }
    }

    return project;
  };

  const setCachedProjectIcon = ({ project, iconResult }) => {
    clearCachedProjectIcon(project?.id);
    return setProjectIcon({
      project,
      iconResult,
      setCleanup: (cleanup) => {
        cachedIconCleanupByProjectId.set(project.id, cleanup);
      },
    });
  };

  const setCurrentProjectIcon = ({ project, iconResult }) => {
    clearCurrentProjectIcon();
    return setProjectIcon({
      project,
      iconResult,
      setCleanup: (cleanup) => {
        currentProjectIconCleanup = cleanup;
      },
    });
  };

  const pruneIconCleanup = (projects = []) => {
    const activeIds = new Set(projects.map((project) => project.id));
    for (const projectId of cachedIconCleanupByProjectId.keys()) {
      if (activeIds.has(projectId)) {
        continue;
      }
      clearCachedProjectIcon(projectId);
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
        return setCurrentProjectIcon({ project, iconResult });
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
    const normalizedEntry = normalizeCachedProjectEntry(entry);
    const entries = await getProjectEntries();
    const existingEntryIndex = entries.findIndex(
      (candidate) => candidate?.id && candidate.id === normalizedEntry.id,
    );
    if (existingEntryIndex !== -1) {
      const existingEntry = entries[existingEntryIndex] || {};
      entries[existingEntryIndex] = {
        ...existingEntry,
        ...normalizedEntry,
        createdAt: existingEntry.createdAt ?? normalizedEntry.createdAt,
        lastOpenedAt:
          existingEntry.lastOpenedAt ?? normalizedEntry.lastOpenedAt,
      };
      await db.set("projectEntries", entries);
      projectEntriesCache = structuredClone(entries);
      syncProjectsCacheFromEntries(entries);
      if (normalizedEntry.id === getCurrentProjectId()) {
        currentProjectEntry = normalizeLocalProjectEntry(
          entries[existingEntryIndex],
        );
      }
      return entries;
    }

    const isDuplicate = platformAdapter.isDuplicateProjectEntry?.({
      entries,
      entry: normalizedEntry,
    });
    if (isDuplicate) {
      throw new Error("This project has already been added.");
    }

    entries.push(normalizedEntry);
    await db.set("projectEntries", entries);
    projectEntriesCache = structuredClone(entries);
    syncProjectsCacheFromEntries(entries);
    if (normalizedEntry.id === getCurrentProjectId()) {
      currentProjectEntry = normalizeLocalProjectEntry(normalizedEntry);
    }
    return entries;
  };

  const removeProjectEntry = async (projectId) => {
    const entries = await getProjectEntries();
    const filtered = entries.filter((entry) => entry.id !== projectId);
    await db.set("projectEntries", filtered);
    projectEntriesCache = structuredClone(filtered);
    syncProjectsCacheFromEntries(filtered);
    if (currentProjectEntry.id === projectId) {
      const routeProjectId = getCurrentProjectId();
      currentProjectEntry = routeProjectId
        ? createEmptyProjectEntry({ id: routeProjectId, source: "cloud" })
        : createEmptyProjectEntry();
    }

    clearCachedProjectIcon(projectId);
    return filtered;
  };

  const updateProjectEntry = async (projectId, updates) => {
    const entries = await getProjectEntries();
    const index = entries.findIndex((entry) => entry.id === projectId);
    if (index !== -1) {
      entries[index] = normalizeCachedProjectEntry({
        ...entries[index],
        ...updates,
      });
      await db.set("projectEntries", entries);
      projectEntriesCache = structuredClone(entries);
      syncProjectsCacheFromEntries(entries);
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
    syncProjectsCacheFromEntries(filtered);

    if (currentProjectEntry?.projectPath === projectPath) {
      const routeProjectId = getCurrentProjectId();
      currentProjectEntry = routeProjectId
        ? createEmptyProjectEntry({ id: routeProjectId, source: "cloud" })
        : createEmptyProjectEntry();
    }

    return filtered;
  };

  const repairProjectEntries = async (entries = []) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return Array.isArray(entries) ? entries : [];
    }

    let didChange = false;
    const nextEntries = [];

    for (const entry of entries) {
      let nextEntry = normalizeCachedProjectEntry(structuredClone(entry));
      if (nextEntry.language !== entry?.language) {
        didChange = true;
      }

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
            nextEntry.language = normalizeProjectLanguage(projectInfo.language);
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

      nextEntries[duplicateIndex] = mergeProjectEntriesPreservingWorkingPath(
        nextEntries[duplicateIndex],
        nextEntry,
      );
      didChange = true;
    }

    if (!didChange) {
      return nextEntries;
    }

    await db.set("projectEntries", nextEntries);
    projectEntriesCache = structuredClone(nextEntries);
    syncProjectsCacheFromEntries(nextEntries);
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
          const project = mapProjectEntryToProject(entry);

          const iconResult = await platformAdapter.loadProjectIcon?.({
            entry,
            projectService,
          });
          return setCachedProjectIcon({ project, iconResult });
        }),
      );

      pruneIconCleanup(projectsWithFullData);
      setProjectsCache(projectsWithFullData);
      return projectsWithFullData;
    },

    getCachedProjects() {
      return projectsCache === undefined
        ? undefined
        : structuredClone(projectsCache);
    },

    updateCachedProject(projectId, updates) {
      return updateCachedProject(projectId, updates);
    },

    setCurrentProjectEntry(entry) {
      clearCurrentProjectIcon();
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
      const project = await platformAdapter.openExistingProject({
        folderPath,
        addProjectEntry,
        loadProjectIcon: platformAdapter.loadProjectIcon,
        projectService,
      });
      cacheProject(project);
      return project;
    },

    async createNewProject(payload) {
      const project = await platformAdapter.createNewProject({
        ...payload,
        language: requireProjectLanguage(payload.language),
        addProjectEntry,
        projectService,
      });
      cacheProject(project);
      return project;
    },

    getCurrentProjectEntry() {
      return currentProjectEntry;
    },

    async refreshCurrentProjectEntry() {
      return refreshCurrentProjectEntry();
    },
  };
};
