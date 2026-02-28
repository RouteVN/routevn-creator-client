import { createWebSocketTransport } from "../../../collab/v2/index.js";
import { RESOURCE_TYPES } from "../../../domain/v2/constants.js";
import { createTypedCommandApi } from "./typedCommandApi.js";

export const createProjectServiceCore = ({
  router,
  idGenerator,
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

  const storyBasePartitionFor = (projectId) => `project:${projectId}:story`;
  const storyScenePartitionFor = (projectId, sceneId) =>
    `project:${projectId}:story:scene:${sceneId}`;
  const resourceTypePartitionFor = (projectId, resourceType) =>
    `project:${projectId}:resources:${resourceType}`;

  const getBasePartitions = (projectId, partitions) =>
    partitions || [
      storyBasePartitionFor(projectId),
      ...RESOURCE_TYPES.map((resourceType) =>
        resourceTypePartitionFor(projectId, resourceType),
      ),
      `project:${projectId}:layouts`,
      `project:${projectId}:settings`,
    ];

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
    partitions,
    mode,
  }) => {
    const session = await createSessionForProject({
      projectId,
      token,
      userId,
      clientId,
      endpointUrl,
      partitions,
      mode,
      partitioning: {
        getBasePartitions,
        storyBasePartitionFor,
        storyScenePartitionFor,
        resourceTypePartitionFor,
      },
    });
    return rememberSession({ projectId, mode, session });
  };

  const ensureCommandSessionForProject = async (projectId) => {
    const existing = collabSessionsByProject.get(projectId);
    if (existing) return existing;

    const actor = getOrCreateLocalActor(projectId);
    if (typeof onEnsureLocalSession === "function") {
      onEnsureLocalSession({ projectId, actor });
    }

    return createAndRememberSession({
      projectId,
      token: `user:${actor.userId}:client:${actor.clientId}`,
      userId: actor.userId,
      clientId: actor.clientId,
      mode: "local",
    });
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
    partitions,
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
      partitions,
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

  const deleteVersionFromProject = async (projectId, versionId) => {
    let adapter = getAdapterByProject(projectId);
    if (!adapter) {
      await getRepositoryByProject(projectId);
      adapter = getAdapterByProject(projectId);
    }
    const versions = (await adapter.app.get("versions")) || [];
    const newVersions = versions.filter((v) => v.id !== versionId);
    await adapter.app.set("versions", newVersions);
  };

  const typedCommandApi = createTypedCommandApi({
    idGenerator,
    getCurrentProjectId,
    getCurrentRepository,
    getCachedRepository,
    ensureCommandSessionForProject,
    getOrCreateLocalActor,
    storyBasePartitionFor,
    storyScenePartitionFor,
    resourceTypePartitionFor,
  });

  return {
    getCurrentProjectId,
    getBasePartitions,
    storyBasePartitionFor,
    storyScenePartitionFor,
    resourceTypePartitionFor,
    getOrCreateLocalActor,
    typedCommandApi,
    ensureCommandSessionForProject,
    createCollabSession,
    getCollabSession,
    getCollabSessionMode,
    stopCollabSession,
    submitCommand,
    addVersionToProject,
    deleteVersionFromProject,
  };
};
