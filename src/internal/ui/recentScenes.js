const RECENT_SCENE_IDS_CONFIG_KEY = "sceneEditor.recentSceneIdsByProject";
const RECENT_SCENE_IDS_LIMIT = 8;

const normalizeId = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const readRecentSceneIdsByProject = (appService) => {
  const value = appService?.getUserConfig?.(RECENT_SCENE_IDS_CONFIG_KEY);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return structuredClone(value);
  }

  return {};
};

const writeRecentSceneIdsByProject = (appService, value) => {
  appService?.setUserConfig?.(RECENT_SCENE_IDS_CONFIG_KEY, value);
};

export const getRecentSceneIds = ({ appService, projectId } = {}) => {
  const normalizedProjectId = normalizeId(projectId);
  if (!normalizedProjectId) {
    return [];
  }

  const byProject = readRecentSceneIdsByProject(appService);
  const sceneIds = byProject[normalizedProjectId];
  return Array.isArray(sceneIds) ? sceneIds.filter(Boolean) : [];
};

export const recordRecentSceneVisit = ({
  appService,
  projectId,
  sceneId,
} = {}) => {
  const normalizedProjectId = normalizeId(projectId);
  const normalizedSceneId = normalizeId(sceneId);
  if (!normalizedProjectId || !normalizedSceneId) {
    return getRecentSceneIds({ appService, projectId: normalizedProjectId });
  }

  const byProject = readRecentSceneIdsByProject(appService);
  const currentSceneIds = Array.isArray(byProject[normalizedProjectId])
    ? byProject[normalizedProjectId].filter(Boolean)
    : [];
  const nextSceneIds = [
    normalizedSceneId,
    ...currentSceneIds.filter((id) => id !== normalizedSceneId),
  ].slice(0, RECENT_SCENE_IDS_LIMIT);

  byProject[normalizedProjectId] = nextSceneIds;
  writeRecentSceneIdsByProject(appService, byProject);
  return nextSceneIds;
};
