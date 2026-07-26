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

const selectLocalProjectKey = (entry) => {
  return entry?.projectPath ? entry.projectPath : entry?.id;
};

const isSameLocalProject = (left, right) => {
  if (left?.projectPath || right?.projectPath) {
    return Boolean(
      left?.projectPath &&
        right?.projectPath &&
        left.projectPath === right.projectPath,
    );
  }

  return Boolean(left?.id && right?.id && left.id === right.id);
};

const canUpdateLocalProject = (currentEntry, nextEntry) => {
  if (!isSameLocalProject(currentEntry, nextEntry)) {
    return false;
  }

  return Boolean(
    !currentEntry?.id || !nextEntry?.id || currentEntry.id === nextEntry.id,
  );
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
  const cachedIconCleanupByProjectKey = new Map();
  let currentProjectIconCleanup;

  const invalidateCachedProjectIcon = (projectKey) => {
    const cachedProject = projectsCache?.find(
      (project) => selectLocalProjectKey(project) === projectKey,
    );
    if (cachedProject) {
      delete cachedProject.iconUrl;
    }
  };

  const clearCachedProjectIcon = (projectKey) => {
    cachedIconCleanupByProjectKey.get(projectKey)?.();
    cachedIconCleanupByProjectKey.delete(projectKey);
    invalidateCachedProjectIcon(projectKey);
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
    const cachedProjectsByKey = new Map(
      (projectsCache ?? []).map((project) => [
        selectLocalProjectKey(project),
        project,
      ]),
    );
    const projects = entries.map((entry) => {
      const project = mapProjectEntryToProject(entry);
      const projectKey = selectLocalProjectKey(project);
      const cachedProject = cachedProjectsByKey.get(projectKey);
      if (
        cachedProject?.iconUrl &&
        cachedProject.iconFileId === project.iconFileId
      ) {
        project.iconUrl = cachedProject.iconUrl;
      } else if (
        cachedProject &&
        cachedProject.iconFileId !== project.iconFileId
      ) {
        clearCachedProjectIcon(projectKey);
      }
      return project;
    });

    const projectKeys = new Set(projects.map(selectLocalProjectKey));
    for (const projectKey of cachedIconCleanupByProjectKey.keys()) {
      if (!projectKeys.has(projectKey)) {
        clearCachedProjectIcon(projectKey);
      }
    }

    setProjectsCache(projects);
  };

  const cacheProject = (project) => {
    const projectKey = selectLocalProjectKey(project);
    if (!projectKey || projectsCache === undefined) {
      return;
    }

    const existingIndex = projectsCache.findIndex(
      (cachedProject) => selectLocalProjectKey(cachedProject) === projectKey,
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

    const selectedProjectPath =
      currentProjectEntry.id === projectId
        ? currentProjectEntry.projectPath
        : undefined;
    const entryIndex = projectEntriesCache.findIndex((entry) => {
      if (selectedProjectPath) {
        return entry?.projectPath === selectedProjectPath;
      }
      return entry.id === projectId;
    });
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

    const projectKey =
      entryIndex === -1
        ? projectId
        : selectLocalProjectKey(projectEntriesCache[entryIndex]);
    const projectIndex = projectsCache.findIndex(
      (project) => selectLocalProjectKey(project) === projectKey,
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
      clearCachedProjectIcon(projectKey);
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
    const projectKey = selectLocalProjectKey(project);
    clearCachedProjectIcon(projectKey);
    return setProjectIcon({
      project,
      iconResult,
      setCleanup: (cleanup) => {
        cachedIconCleanupByProjectKey.set(projectKey, cleanup);
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
    const activeKeys = new Set(projects.map(selectLocalProjectKey));
    for (const projectKey of cachedIconCleanupByProjectKey.keys()) {
      if (activeKeys.has(projectKey)) {
        continue;
      }
      clearCachedProjectIcon(projectKey);
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

      const selectedProjectPath =
        currentProjectEntry.id === projectId
          ? currentProjectEntry.projectPath
          : undefined;
      const localEntry =
        entries.find(
          (entry) =>
            selectedProjectPath && entry?.projectPath === selectedProjectPath,
        ) ?? entries.find((entry) => entry?.id === projectId);
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
    const existingEntryIndex = entries.findIndex((candidate) =>
      canUpdateLocalProject(candidate, normalizedEntry),
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

    return filtered;
  };

  const updateProjectEntry = async (projectId, updates) => {
    const entries = await getProjectEntries();
    const selectedProjectPath =
      currentProjectEntry.id === projectId
        ? currentProjectEntry.projectPath
        : undefined;
    const index = entries.findIndex((entry) => {
      if (selectedProjectPath) {
        return entry?.projectPath === selectedProjectPath;
      }
      return entry.id === projectId;
    });
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
        return isSameLocalProject(candidate, nextEntry);
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

      const cachedEntry = entry.projectPath
        ? projectEntriesCache.find(
            (projectEntry) => projectEntry?.projectPath === entry.projectPath,
          )
        : projectEntriesCache.find(
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
