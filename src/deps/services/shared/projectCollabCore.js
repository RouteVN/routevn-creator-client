import { createWebSocketTransport } from "../web/collab/createWebSocketTransport.js";
import { recursivelyCheckResource } from "../../../internal/project/projection.js";
import { createCommandApi } from "./commandApi.js";
import { checkProjectResourceUsage } from "./resourceUsage.js";
import {
  mainPartitionFor,
  mainScenePartitionFor,
  scenePartitionFor,
} from "./collab/partitions.js";

export const createProjectCollabCore = ({
  router,
  idGenerator,
  now,
  collabLog,
  getCurrentRepository,
  getCachedRepository,
  getRepositoryByProject,
  getAdapterByProject,
  createSessionForProject,
  createTransport,
  onEnsureLocalSession,
  onSessionCleared,
  onSessionTransportUpdated,
}) => {
  const collabSessionsByProject = new Map();
  const collabSessionModeByProject = new Map();
  const localCollabActorsByProject = new Map();

  const getCurrentProjectId = () => {
    const { p } = router.getPayload();
    return p;
  };

  const storyBasePartitionFor = () => mainPartitionFor();
  const storyScenePartitionFor = (_projectId, sceneId) =>
    mainScenePartitionFor(sceneId);
  const directScenePartitionFor = (_projectId, sceneId) =>
    scenePartitionFor(sceneId);
  const resourceTypePartitionFor = () => mainPartitionFor();

  const getOrCreateLocalActor = (projectId) => {
    const existing = localCollabActorsByProject.get(projectId);
    if (existing) return existing;
    const actor = {
      userId: `local-${projectId}`,
      clientId: `local-${idGenerator()}`,
    };
    localCollabActorsByProject.set(projectId, actor);
    return actor;
  };

  const clearSession = ({ projectId, reason }) => {
    collabSessionsByProject.delete(projectId);
    collabSessionModeByProject.delete(projectId);
    if (typeof onSessionCleared === "function") {
      onSessionCleared({ projectId, reason });
    }
  };

  const rememberSession = ({ projectId, mode, session }) => {
    collabSessionsByProject.set(projectId, session);
    collabSessionModeByProject.set(projectId, mode);
    return session;
  };

  const createAndRememberSession = async ({
    projectId,
    token,
    userId,
    clientId,
    endpointUrl,
    mode,
  }) => {
    const session = await createSessionForProject({
      projectId,
      token,
      userId,
      clientId,
      endpointUrl,
      mode,
    });
    return rememberSession({ projectId, mode, session });
  };

  const syncSessionProjectedState = async ({ projectId, session }) => {
    if (typeof session?.syncProjectedRepositoryState !== "function") {
      return;
    }

    const repository = await getRepositoryByProject(projectId);
    const repositoryState = repository?.getState?.();
    session.syncProjectedRepositoryState(repositoryState);
  };

  const ensureCommandSessionForProject = async (projectId) => {
    const existing = collabSessionsByProject.get(projectId);
    if (existing) {
      await syncSessionProjectedState({ projectId, session: existing });
      return existing;
    }

    const actor = getOrCreateLocalActor(projectId);
    if (typeof onEnsureLocalSession === "function") {
      onEnsureLocalSession({ projectId, actor });
    }

    const session = await createAndRememberSession({
      projectId,
      token: `user:${actor.userId}:client:${actor.clientId}`,
      userId: actor.userId,
      clientId: actor.clientId,
      mode: "local",
    });
    await syncSessionProjectedState({ projectId, session });
    return session;
  };

  const resolveTransport = ({ endpointUrl }) => {
    if (typeof createTransport === "function") {
      return createTransport({ endpointUrl });
    }
    return createWebSocketTransport({ url: endpointUrl });
  };

  const createCollabSession = async ({
    token,
    userId,
    clientId = idGenerator(),
    endpointUrl,
  }) => {
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    collabLog("info", "createCollabSession called", {
      currentProjectId,
      endpointUrl: endpointUrl || null,
      hasToken: Boolean(token),
      userId,
      clientId,
    });

    const existing = collabSessionsByProject.get(currentProjectId);
    const existingMode = collabSessionModeByProject.get(currentProjectId);
    if (existing) {
      collabLog("info", "existing session found", {
        currentProjectId,
        existingMode,
      });
      const hasExplicitIdentity = Boolean(token && userId);
      if (hasExplicitIdentity && existingMode === "local") {
        await existing.stop();
        clearSession({ projectId: currentProjectId, reason: "replaced_local" });
        collabLog("info", "replaced local session with explicit identity", {
          currentProjectId,
        });
      } else {
        if (endpointUrl) {
          const transport = resolveTransport({ endpointUrl });
          await existing.setOnlineTransport(transport);
          if (typeof onSessionTransportUpdated === "function") {
            onSessionTransportUpdated({
              projectId: currentProjectId,
              endpointUrl,
            });
          }
          collabLog("info", "updated existing session transport", {
            currentProjectId,
            endpointUrl,
          });
        }
        return existing;
      }
    }

    return createAndRememberSession({
      projectId: currentProjectId,
      token,
      userId,
      clientId,
      endpointUrl,
      mode: "explicit",
    });
  };

  const getCollabSession = (projectId) => {
    const targetProjectId = projectId || getCurrentProjectId();
    if (!targetProjectId) return null;
    return collabSessionsByProject.get(targetProjectId) || null;
  };

  const getCollabSessionMode = (projectId) => {
    const targetProjectId = projectId || getCurrentProjectId();
    if (!targetProjectId) return null;
    return collabSessionModeByProject.get(targetProjectId) || null;
  };

  const stopCollabSession = async (projectId) => {
    const targetProjectId = projectId || getCurrentProjectId();
    if (!targetProjectId) return;
    const session = collabSessionsByProject.get(targetProjectId);
    if (!session) return;
    await session.stop();
    clearSession({ projectId: targetProjectId, reason: "stopped" });
    collabLog("info", "session stopped", {
      projectId: targetProjectId,
    });
  };

  const submitCommand = async (command) => {
    const session = getCollabSession();
    if (!session) {
      throw new Error(
        "Collaboration session not initialized. Call createCollabSession() first.",
      );
    }
    return session.submitCommand(command);
  };

  const addVersionToProject = async (projectId, version) => {
    let adapter = getAdapterByProject(projectId);
    if (!adapter) {
      await getRepositoryByProject(projectId);
      adapter = getAdapterByProject(projectId);
    }
    const versions = (await adapter.app.get("versions")) || [];
    versions.unshift(version);
    await adapter.app.set("versions", versions);
  };

  const updateVersionInProject = async (projectId, versionId, patch) => {
    let adapter = getAdapterByProject(projectId);
    if (!adapter) {
      await getRepositoryByProject(projectId);
      adapter = getAdapterByProject(projectId);
    }
    const versions = (await adapter.app.get("versions")) || [];
    const nextVersions = versions.map((version) =>
      version.id === versionId ? { ...version, ...patch } : version,
    );
    await adapter.app.set("versions", nextVersions);
  };

  const deleteVersionFromProject = async (projectId, versionId) => {
    let adapter = getAdapterByProject(projectId);
    if (!adapter) {
      await getRepositoryByProject(projectId);
      adapter = getAdapterByProject(projectId);
    }
    const versions = (await adapter.app.get("versions")) || [];
    const newVersions = versions.filter((version) => version.id !== versionId);
    await adapter.app.set("versions", newVersions);
  };

  const commandApi = createCommandApi({
    idGenerator,
    now,
    getCurrentProjectId,
    getCurrentRepository,
    getCachedRepository,
    ensureCommandSessionForProject,
    getOrCreateLocalActor,
    storyBasePartitionFor,
    storyScenePartitionFor,
    scenePartitionFor: directScenePartitionFor,
    resourceTypePartitionFor,
  });

  const deleteItemIfUnused = async ({
    resourceId,
    checkTargets = [],
    deleteItem,
  }) => {
    const projectId = getCurrentProjectId();
    let usage;

    if (projectId) {
      const repository = await getCurrentRepository();
      const store = getAdapterByProject(projectId);
      if (repository && store) {
        usage = await checkProjectResourceUsage({
          repository,
          store,
          projectId,
          itemId: resourceId,
          checkTargets,
        });
      }
    }

    if (!usage) {
      const state = commandApi.getState();
      usage = recursivelyCheckResource({
        state,
        itemId: resourceId,
        checkTargets,
      });
    }

    if (usage.isUsed) {
      return { deleted: false, usage };
    }

    const deleteResult = await deleteItem(resourceId);

    if (deleteResult?.valid === false) {
      return {
        deleted: false,
        usage,
        deleteResult,
      };
    }

    return { deleted: true, usage, deleteResult };
  };

  const deleteImageIfUnused = async ({ imageId, checkTargets = [] }) =>
    deleteItemIfUnused({
      resourceId: imageId,
      checkTargets,
      deleteItem: (resourceId) =>
        commandApi.deleteImages({
          imageIds: [resourceId],
        }),
    });

  const deleteSoundIfUnused = async ({ soundId, checkTargets = [] }) =>
    deleteItemIfUnused({
      resourceId: soundId,
      checkTargets,
      deleteItem: (resourceId) =>
        commandApi.deleteSounds({
          soundIds: [resourceId],
        }),
    });

  const deleteVideoIfUnused = async ({ videoId, checkTargets = [] }) =>
    deleteItemIfUnused({
      resourceId: videoId,
      checkTargets,
      deleteItem: (resourceId) =>
        commandApi.deleteVideos({
          videoIds: [resourceId],
        }),
    });

  return {
    getCurrentProjectId,
    storyBasePartitionFor,
    storyScenePartitionFor,
    scenePartitionFor: directScenePartitionFor,
    resourceTypePartitionFor,
    getOrCreateLocalActor,
    commandApi,
    ensureCommandSessionForProject,
    createCollabSession,
    getCollabSession,
    getCollabSessionMode,
    stopCollabSession,
    submitCommand,
    addVersionToProject,
    updateVersionInProject,
    deleteVersionFromProject,
    deleteImageIfUnused,
    deleteSoundIfUnused,
    deleteVideoIfUnused,
  };
};
