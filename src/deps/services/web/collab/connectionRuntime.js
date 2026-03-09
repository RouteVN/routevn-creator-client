import {
  COLLAB_CONNECTION_ERROR_THROTTLE_MS,
  COLLAB_HEARTBEAT_INTERVAL_MS,
  COLLAB_RECONNECT_INTERVAL_MS,
  DEFAULT_COLLAB_ENDPOINT,
} from "./constants.js";
import { isLocalProjectId } from "./localProjectMode.js";

const generateClientIdSuffix = () => {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
};

const getCollabEndpointCandidates = (endpointUrl) => {
  const raw =
    typeof endpointUrl === "string" && endpointUrl.length > 0
      ? endpointUrl
      : DEFAULT_COLLAB_ENDPOINT;
  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
      return;
    }
    seen.add(value);
    candidates.push(value);
  };

  addCandidate(raw);

  try {
    const parsed = new URL(raw);
    const isWsProtocol = parsed.protocol === "ws:";
    const isDefaultPort = parsed.port === "" || parsed.port === "8787";
    const isDefaultPath = parsed.pathname === "/sync";

    if (isWsProtocol && isDefaultPort && isDefaultPath) {
      if (parsed.hostname === "localhost") {
        parsed.hostname = "127.0.0.1";
        addCandidate(parsed.toString());
      } else if (parsed.hostname === "127.0.0.1") {
        parsed.hostname = "localhost";
        addCandidate(parsed.toString());
      } else if (parsed.hostname === "::1") {
        parsed.hostname = "127.0.0.1";
        addCandidate(parsed.toString());
        parsed.hostname = "localhost";
        addCandidate(parsed.toString());
      }
    }
  } catch {
    // Keep only original candidate for invalid URLs.
  }

  return candidates;
};

export const createCollabConnectionRuntime = ({
  projectService,
  router,
  db,
  collabDebugLog,
}) => {
  const clientIdSuffix = generateClientIdSuffix();
  const collabRuntime = {
    endpointUrl: DEFAULT_COLLAB_ENDPOINT,
    autoConnectMode: "not_started",
    remoteEnabled: false,
    lastConnectError: null,
    userId: null,
    clientId: null,
    token: null,
    reconnectAttempts: 0,
    lastReconnectAttemptAt: null,
    lastConnectionErrorAt: 0,
    lastConnectionErrorSignature: null,
  };

  const reportCollabConnectionError = (message, meta = {}) => {
    const signature = `${message}:${meta?.error || "unknown"}`;
    const now = Date.now();
    if (
      collabRuntime.lastConnectionErrorSignature === signature &&
      now - collabRuntime.lastConnectionErrorAt <
        COLLAB_CONNECTION_ERROR_THROTTLE_MS
    ) {
      return;
    }

    collabRuntime.lastConnectionErrorSignature = signature;
    collabRuntime.lastConnectionErrorAt = now;
    console.error(`[routevn.collab.connection] ${message}`, meta);

    try {
      window.dispatchEvent(
        new CustomEvent("routevn:collab:connection-error", {
          detail: { message, meta },
        }),
      );
    } catch {
      // no-op
    }
  };

  const buildDefaultClientId = (projectId) => {
    const projectPart = (projectId || "no-project").slice(0, 8);
    return `web-${projectPart}-${clientIdSuffix}`;
  };

  const buildDebugToken = ({ userId, clientId, token }) =>
    token || `user:${userId}:client:${clientId}`;

  const getCollabProjectId = () => {
    const payload = router.getPayload?.() || {};
    if (payload?.p) {
      return payload.p;
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("p");
  };

  const connectCollabDebugSession = async ({
    endpointUrl = DEFAULT_COLLAB_ENDPOINT,
    userId = "web-debug-user",
    clientId,
    token,
    partitions,
  } = {}) => {
    const projectId = getCollabProjectId();
    const resolvedClientId = clientId || buildDefaultClientId(projectId);
    const resolvedToken = buildDebugToken({
      userId,
      clientId: resolvedClientId,
      token,
    });
    const endpointCandidates = getCollabEndpointCandidates(endpointUrl);
    let lastError;

    for (const candidateEndpointUrl of endpointCandidates) {
      collabDebugLog("info", "connect requested", {
        endpointUrl: candidateEndpointUrl,
        userId,
        clientId: resolvedClientId,
        tokenPreview: resolvedToken.slice(0, 48),
        endpointCandidates,
      });

      try {
        const session = await projectService.createCollabSession({
          endpointUrl: candidateEndpointUrl,
          token: resolvedToken,
          userId,
          clientId: resolvedClientId,
          partitions,
        });
        collabRuntime.endpointUrl = candidateEndpointUrl;
        collabRuntime.lastConnectError = null;
        return session;
      } catch (error) {
        lastError = error;
        collabDebugLog("warn", "connect attempt failed", {
          endpointUrl: candidateEndpointUrl,
          userId,
          clientId: resolvedClientId,
          error: error?.message || "unknown",
        });
      }
    }

    reportCollabConnectionError("all connection attempts failed", {
      endpointCandidates,
      userId,
      clientId: resolvedClientId,
      error: lastError?.message || "unknown",
    });

    throw lastError || new Error("Collaboration connect failed");
  };

  let collabAutoConnectInFlight = null;
  let collabReconnectTimer = null;
  let collabHeartbeatTimer = null;

  const shouldAttemptAutoConnect = () => {
    if (collabRuntime.autoConnectMode === "not_started") return false;
    if (!collabRuntime.remoteEnabled) return false;
    const projectId = getCollabProjectId();
    if (!projectId) return false;

    const hasSession = Boolean(projectService.getCollabSession());
    const sessionMode =
      typeof projectService.getCollabSessionMode === "function"
        ? projectService.getCollabSessionMode(projectId)
        : null;

    return !hasSession || sessionMode === "local";
  };

  const attemptCollabAutoReconnect = async ({ reason = "timer" } = {}) => {
    if (!shouldAttemptAutoConnect()) return false;
    if (collabAutoConnectInFlight) return collabAutoConnectInFlight;

    const projectId = getCollabProjectId();
    const endpointUrl = collabRuntime.endpointUrl || DEFAULT_COLLAB_ENDPOINT;
    const userId = collabRuntime.userId || `web-${projectId || "debug-user"}`;
    const clientId = collabRuntime.clientId || buildDefaultClientId(projectId);
    const token = collabRuntime.token || undefined;

    collabAutoConnectInFlight = (async () => {
      collabRuntime.lastReconnectAttemptAt = Date.now();
      collabRuntime.reconnectAttempts += 1;

      try {
        await connectCollabDebugSession({
          endpointUrl,
          userId,
          clientId,
          token,
        });
        collabRuntime.lastConnectError = null;
        collabDebugLog("info", "auto-reconnect success", {
          reason,
          endpointUrl,
          userId,
          clientId,
          reconnectAttempts: collabRuntime.reconnectAttempts,
        });
        return true;
      } catch (error) {
        collabRuntime.lastConnectError = error?.message || "unknown";
        collabDebugLog("warn", "auto-reconnect failed", {
          reason,
          endpointUrl,
          userId,
          clientId,
          reconnectAttempts: collabRuntime.reconnectAttempts,
          error: error?.message || "unknown",
        });
        return false;
      } finally {
        collabAutoConnectInFlight = null;
      }
    })();

    return collabAutoConnectInFlight;
  };

  const startCollabReconnectLoop = () => {
    if (collabReconnectTimer) return;
    collabReconnectTimer = setInterval(() => {
      void attemptCollabAutoReconnect({ reason: "interval" });
    }, COLLAB_RECONNECT_INTERVAL_MS);

    collabDebugLog("info", "reconnect loop started", {
      intervalMs: COLLAB_RECONNECT_INTERVAL_MS,
    });
  };

  const disconnectCollabDebugSession = async () => {
    await projectService.stopCollabSession();
    collabDebugLog("info", "disconnect requested");
  };

  const getCollabDebugStatus = () => {
    const session = projectService.getCollabSession();
    return {
      hasSession: Boolean(session),
      session,
    };
  };

  const startCollabHeartbeatLogs = () => {
    if (collabHeartbeatTimer) return;
    collabHeartbeatTimer = setInterval(() => {
      const { hasSession, session } = getCollabDebugStatus();
      const sessionError = session?.getLastError?.() || null;

      collabDebugLog("info", "heartbeat", {
        mode: collabRuntime.autoConnectMode,
        endpointUrl: collabRuntime.endpointUrl,
        hasSession,
        sessionError,
        lastConnectError: collabRuntime.lastConnectError,
      });
    }, COLLAB_HEARTBEAT_INTERVAL_MS);

    collabDebugLog("info", "heartbeat logger started", {
      intervalMs: COLLAB_HEARTBEAT_INTERVAL_MS,
    });
  };

  const bootCollabFromQuery = async () => {
    const params = new URLSearchParams(window.location.search);
    const enabledParam = params.get("collab");
    const projectId = params.get("p");
    const localProject = await isLocalProjectId({ db, projectId });
    const remoteEnabled = Boolean(projectId) && !localProject;
    const enabledByQuery = enabledParam === "1" || enabledParam === "true";

    const endpointUrl = params.get("collabEndpoint") || DEFAULT_COLLAB_ENDPOINT;
    const userId =
      params.get("collabUser") || `web-${projectId || "debug-user"}`;
    const clientId =
      params.get("collabClient") || buildDefaultClientId(projectId);
    const token = params.get("collabToken") || undefined;
    const autoConnectMode = remoteEnabled
      ? enabledByQuery
        ? "query_enabled"
        : "always_enabled"
      : "disabled_for_local_project";

    collabRuntime.endpointUrl = endpointUrl;
    collabRuntime.autoConnectMode = autoConnectMode;
    collabRuntime.remoteEnabled = remoteEnabled;
    collabRuntime.lastConnectError = null;
    collabRuntime.userId = userId;
    collabRuntime.clientId = clientId;
    collabRuntime.token = token || null;
    collabRuntime.reconnectAttempts = 0;
    collabRuntime.lastReconnectAttemptAt = null;

    if (!remoteEnabled) {
      collabDebugLog("info", "auto-connect skipped for local project", {
        mode: autoConnectMode,
        projectId: projectId || null,
        isLocalProject: localProject,
      });
      return;
    }

    collabDebugLog("info", "auto-connect attempting", {
      mode: autoConnectMode,
      endpointUrl,
      userId,
      clientId,
      projectId: projectId || null,
    });

    try {
      await connectCollabDebugSession({
        endpointUrl,
        userId,
        clientId,
        token,
      });
      collabDebugLog("info", "auto-connect success", {
        mode: autoConnectMode,
        endpointUrl,
        userId,
        clientId,
        projectId: projectId || null,
      });
    } catch (error) {
      collabRuntime.lastConnectError = error?.message || "unknown";
      collabDebugLog(
        "warn",
        "auto-connect failed; staying in local-only mode",
        {
          mode: autoConnectMode,
          endpointUrl,
          userId,
          clientId,
          projectId: projectId || null,
          error: error?.message || "unknown",
        },
      );
      reportCollabConnectionError("initial auto-connect failed", {
        mode: autoConnectMode,
        endpointUrl,
        userId,
        clientId,
        projectId: projectId || null,
        error: error?.message || "unknown",
      });
    }

    startCollabReconnectLoop();
  };

  return {
    bootCollabFromQuery,
    connectCollabDebugSession,
    disconnectCollabDebugSession,
    getCollabDebugStatus,
    startCollabHeartbeatLogs,
  };
};
