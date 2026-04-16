import { generateId } from "../../../../internal/id.js";

export const DEFAULT_WEB_COLLAB_ENDPOINT = "ws://127.0.0.1:8787/sync";
const COLLAB_HEARTBEAT_INTERVAL_MS = 10_000;
const COLLAB_RECONNECT_INTERVAL_MS = 5_000;
const COLLAB_CONNECTION_ERROR_THROTTLE_MS = 10_000;

export const resolveCollabDebugEnabled = ({ enabled } = {}) => {
  if (enabled !== undefined) {
    return Boolean(enabled);
  }

  return false;
};

export const createCollabDebugLogger =
  ({ enabled }) =>
  (level, message, meta = {}) => {
    if (!enabled && level !== "error") {
      return;
    }

    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.info.bind(console);

    fn(`[routevn.collab] ${message}`, meta);
  };

const loadLocalProjectEntries = async ({ db } = {}) => {
  if (!db?.get) {
    return [];
  }

  try {
    const entries = await db.get("projectEntries");
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
};

const isLocalProjectId = async ({ db, projectId } = {}) => {
  if (!projectId) {
    return false;
  }

  const entries = await loadLocalProjectEntries({ db });
  return entries.some((entry) => entry?.id === projectId);
};

const getCollabEndpointCandidates = (endpointUrl) => {
  const raw = endpointUrl || DEFAULT_WEB_COLLAB_ENDPOINT;
  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    candidates.push(value);
  };

  addCandidate(raw);

  try {
    const parsed = new URL(raw);
    const isWsProtocol = parsed.protocol === "ws:";
    const isSyncPath = parsed.pathname === "/sync";

    if (isWsProtocol && isSyncPath) {
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
  endpointUrl = DEFAULT_WEB_COLLAB_ENDPOINT,
  userId,
  clientId,
  token,
}) => {
  const clientIdSuffix = generateId(12);
  const collabRuntime = {
    endpointUrl,
    autoConnectMode: "not_started",
    remoteEnabled: false,
    lastConnectError: undefined,
    userId,
    clientId,
    token,
    reconnectAttempts: 0,
    lastReconnectAttemptAt: undefined,
    lastConnectionErrorAt: 0,
    lastConnectionErrorSignature: undefined,
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
    endpointUrl = collabRuntime.endpointUrl || DEFAULT_WEB_COLLAB_ENDPOINT,
    userId = collabRuntime.userId || "web-debug-user",
    clientId,
    token,
  } = {}) => {
    const projectId = getCollabProjectId();
    const resolvedClientId =
      clientId || collabRuntime.clientId || buildDefaultClientId(projectId);
    const resolvedToken = buildDebugToken({
      userId,
      clientId: resolvedClientId,
      token: token || collabRuntime.token,
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
        });
        collabRuntime.endpointUrl = candidateEndpointUrl;
        collabRuntime.userId = userId;
        collabRuntime.clientId = resolvedClientId;
        collabRuntime.token = token || collabRuntime.token;
        collabRuntime.lastConnectError = undefined;
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

  let collabAutoConnectInFlight;
  let collabReconnectTimer;
  let collabHeartbeatTimer;

  const shouldAttemptAutoConnect = () => {
    if (collabRuntime.autoConnectMode === "not_started") return false;
    if (!collabRuntime.remoteEnabled) return false;
    const projectId = getCollabProjectId();
    if (!projectId) return false;

    const hasSession = Boolean(projectService.getCollabSession());
    const sessionMode =
      typeof projectService.getCollabSessionMode === "function"
        ? projectService.getCollabSessionMode(projectId)
        : undefined;

    return !hasSession || sessionMode === "local";
  };

  const attemptCollabAutoReconnect = async ({ reason = "timer" } = {}) => {
    if (!shouldAttemptAutoConnect()) return false;
    if (collabAutoConnectInFlight) return collabAutoConnectInFlight;

    const projectId = getCollabProjectId();
    const endpointUrl =
      collabRuntime.endpointUrl || DEFAULT_WEB_COLLAB_ENDPOINT;
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
        collabRuntime.lastConnectError = undefined;
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
        collabAutoConnectInFlight = undefined;
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
      const sessionError = session?.getLastError?.() || undefined;

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

  const bootCollabAutoConnect = async () => {
    const projectId = getCollabProjectId();
    const localProject = await isLocalProjectId({ db, projectId });
    const remoteEnabled = Boolean(projectId) && !localProject;
    const endpointUrl =
      collabRuntime.endpointUrl || DEFAULT_WEB_COLLAB_ENDPOINT;
    const userId = collabRuntime.userId || `web-${projectId || "debug-user"}`;
    const clientId = collabRuntime.clientId || buildDefaultClientId(projectId);
    const token = collabRuntime.token || undefined;
    const autoConnectMode = remoteEnabled
      ? "always_enabled"
      : "disabled_for_local_project";

    collabRuntime.endpointUrl = endpointUrl;
    collabRuntime.autoConnectMode = autoConnectMode;
    collabRuntime.remoteEnabled = remoteEnabled;
    collabRuntime.lastConnectError = undefined;
    collabRuntime.userId = userId;
    collabRuntime.clientId = clientId;
    collabRuntime.token = token || undefined;
    collabRuntime.reconnectAttempts = 0;
    collabRuntime.lastReconnectAttemptAt = undefined;

    if (!remoteEnabled) {
      collabDebugLog("info", "auto-connect skipped for local project", {
        mode: autoConnectMode,
        projectId: projectId || undefined,
        isLocalProject: localProject,
      });
      return;
    }

    collabDebugLog("info", "auto-connect attempting", {
      mode: autoConnectMode,
      endpointUrl,
      userId,
      clientId,
      projectId: projectId || undefined,
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
        projectId: projectId || undefined,
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
          projectId: projectId || undefined,
          error: error?.message || "unknown",
        },
      );
      reportCollabConnectionError("initial auto-connect failed", {
        mode: autoConnectMode,
        endpointUrl,
        userId,
        clientId,
        projectId: projectId || undefined,
        error: error?.message || "unknown",
      });
    }

    startCollabReconnectLoop();
  };

  return {
    bootCollabAutoConnect,
    connectCollabDebugSession,
    disconnectCollabDebugSession,
    getCollabDebugStatus,
    startCollabHeartbeatLogs,
  };
};
