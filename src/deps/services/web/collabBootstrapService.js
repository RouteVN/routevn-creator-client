import { createProjectService } from "./projectService.js";

const COLLAB_PAGE_COMPONENT_TAGS = [
  "rvn-projects",
  "rvn-project",
  "rvn-resources",
  "rvn-images",
  "rvn-characters",
  "rvn-character-sprites",
  "rvn-sound",
  "rvn-tweens",
  "rvn-transforms",
  "rvn-videos",
  "rvn-typography",
  "rvn-choices",
  "rvn-variables",
  "rvn-scenes",
  "rvn-scene-editor",
  "rvn-about",
  "rvn-settings-user",
  "rvn-colors",
  "rvn-fonts",
  "rvn-layouts",
  "rvn-layout-editor",
  "rvn-versions",
];

const COLLAB_REFRESH_HANDLER_NAMES = [
  "handleDataChanged",
  "handleFileExplorerDataChanged",
];
const COLLAB_IMAGES_REFRESH_ACTION = "collab.images.refresh";
const DEFAULT_COLLAB_ENDPOINT = "ws://127.0.0.1:8787/sync";
const COLLAB_HEARTBEAT_INTERVAL_MS = 10_000;
const COLLAB_RECONNECT_INTERVAL_MS = 5_000;
const COLLAB_CONNECTION_ERROR_THROTTLE_MS = 10_000;

const parseEnabledFlag = (value) => value === "1" || value === "true";

const resolveCollabDebugEnabled = () => {
  const params = new URLSearchParams(window.location.search);
  if (parseEnabledFlag(params.get("collabDebug"))) {
    return true;
  }
  try {
    const storedValue = localStorage.getItem("routevn.collab.debug");
    return parseEnabledFlag(storedValue);
  } catch {
    return false;
  }
};

const createCollabDebugLogger =
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
    fn(`[routevn.collab.debug] ${message}`, meta);
  };

const createRemoteRefreshDispatcher = ({ subject, collabDebugLog }) => {
  const getQueryRoots = () => {
    const roots = [document];
    const visited = new Set([document]);

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      const elements = root?.querySelectorAll?.("*") || [];
      for (const element of elements) {
        const shadowRoot = element?.shadowRoot;
        if (shadowRoot && !visited.has(shadowRoot)) {
          visited.add(shadowRoot);
          roots.push(shadowRoot);
        }
      }
    }

    return roots;
  };

  const findConnectedComponentByTag = (tagName) => {
    for (const root of getQueryRoots()) {
      const component = root?.querySelector?.(tagName);
      if (component && component.isConnected) {
        return component;
      }
    }
    return null;
  };

  const shouldRefreshImagesForEvent = (event) => {
    const eventType = event?.type || null;
    if (eventType === "typedSnapshot") return true;
    const target = event?.payload?.target;
    if (typeof target !== "string" || target.length === 0) return false;
    return target === "images" || target.startsWith("images.");
  };

  const refreshImagesPageOnRemoteEvent = async (payload) => {
    if (!shouldRefreshImagesForEvent(payload?.event)) {
      return false;
    }
    collabDebugLog("info", "images remote refresh trigger", {
      projectId: payload?.projectId || null,
      sourceType: payload?.sourceType || null,
      eventType: payload?.event?.type || null,
      eventTarget: payload?.event?.payload?.target || null,
    });
    subject.dispatch(COLLAB_IMAGES_REFRESH_ACTION, {
      source: "collab.remote.images",
      projectId: payload?.projectId || null,
      sourceType: payload?.sourceType || null,
      eventType: payload?.event?.type || null,
      committedId: payload?.committedEvent?.committed_id ?? null,
    });
    collabDebugLog("info", "images refresh event dispatched", {
      action: COLLAB_IMAGES_REFRESH_ACTION,
      projectId: payload?.projectId || null,
      sourceType: payload?.sourceType || null,
    });
    return true;
  };

  const getMountedPageComponent = () => {
    for (const tagName of COLLAB_PAGE_COMPONENT_TAGS) {
      const component = findConnectedComponentByTag(tagName);
      if (component && component.isConnected) {
        return { tagName, component };
      }
    }

    return null;
  };

  const invokeCollabRefreshOnMountedPage = async ({
    projectId,
    sourceType,
    event,
    committedEvent,
  }) => {
    const imagesHandled = await refreshImagesPageOnRemoteEvent({
      projectId,
      sourceType,
      event,
      committedEvent,
    });
    if (imagesHandled) {
      return;
    }

    const mounted = getMountedPageComponent();
    if (!mounted) {
      collabDebugLog(
        "warn",
        "remote event ignored (no mounted page component)",
        {
          projectId,
          sourceType,
          eventType: event?.type || null,
          committedId: committedEvent?.committed_id ?? null,
        },
      );
      return;
    }

    const { tagName, component } = mounted;
    const transformedHandlers = component?.transformedHandlers;
    if (!transformedHandlers || typeof transformedHandlers !== "object") {
      collabDebugLog(
        "warn",
        "remote event ignored (page has no transformed handlers)",
        {
          projectId,
          sourceType,
          tagName,
        },
      );
      return;
    }

    for (const handlerName of COLLAB_REFRESH_HANDLER_NAMES) {
      if (typeof transformedHandlers[handlerName] !== "function") {
        continue;
      }

      await transformedHandlers[handlerName]({
        _event: {
          detail: {
            source: "collab.remote",
            projectId,
            sourceType,
            eventType: event?.type || null,
            committedId: committedEvent?.committed_id ?? null,
          },
        },
      });

      collabDebugLog("info", "remote event applied to mounted page", {
        projectId,
        sourceType,
        tagName,
        handlerName,
        eventType: event?.type || null,
        committedId: committedEvent?.committed_id ?? null,
      });
      return;
    }

    if (typeof component?.render === "function") {
      component.render();
      collabDebugLog(
        "info",
        "remote event applied via component.render fallback",
        {
          projectId,
          sourceType,
          tagName,
          eventType: event?.type || null,
          committedId: committedEvent?.committed_id ?? null,
        },
      );
      return;
    }

    collabDebugLog("warn", "remote event had no applicable refresh handler", {
      projectId,
      sourceType,
      tagName,
      triedHandlers: COLLAB_REFRESH_HANDLER_NAMES,
      eventType: event?.type || null,
      committedId: committedEvent?.committed_id ?? null,
    });
  };

  let remoteRefreshQueue = Promise.resolve();
  return ({ projectId, sourceType, event, committedEvent }) => {
    collabDebugLog("info", "remote event received", {
      projectId,
      sourceType,
      eventType: event?.type || null,
      committedId: committedEvent?.committed_id ?? null,
    });

    remoteRefreshQueue = remoteRefreshQueue
      .catch(() => {})
      .then(() =>
        invokeCollabRefreshOnMountedPage({
          projectId,
          sourceType,
          event,
          committedEvent,
        }),
      )
      .catch((error) => {
        collabDebugLog("error", "remote event refresh failed", {
          error: error?.message || "unknown",
        });
      });
    return remoteRefreshQueue;
  };
};

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
    if (typeof value !== "string" || value.length === 0) return;
    if (seen.has(value)) return;
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

const createCollabRuntimeBootstrap = ({
  projectService,
  router,
  collabDebugLog,
}) => {
  const collabBootClientIdSuffix = generateClientIdSuffix();
  const collabRuntime = {
    endpointUrl: DEFAULT_COLLAB_ENDPOINT,
    autoConnectMode: "not_started",
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
    return `web-${projectPart}-${collabBootClientIdSuffix}`;
  };

  const buildDebugToken = ({ userId, clientId, token }) =>
    token || `user:${userId}:client:${clientId}`;

  const getCollabProjectId = () => {
    const payload = router.getPayload?.() || {};
    if (payload?.p) return payload.p;
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
    const resolvedClientId = clientId || buildDefaultClientId();
    const resolvedToken = buildDebugToken({
      userId,
      clientId: resolvedClientId,
      token,
    });
    const endpointCandidates = getCollabEndpointCandidates(endpointUrl);
    let lastError = null;

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
    const projectId = getCollabProjectId();
    if (!projectId) return false;

    const diagnostics =
      typeof projectService.getCollabDiagnostics === "function"
        ? projectService.getCollabDiagnostics(projectId)
        : null;
    const hasSession = Boolean(projectService.getCollabSession());
    const sessionMode = diagnostics?.sessionMode || null;
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
      attemptCollabAutoReconnect({ reason: "interval" });
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
      const collabDiagnostics =
        typeof projectService.getCollabDiagnostics === "function"
          ? projectService.getCollabDiagnostics()
          : null;

      collabDebugLog("info", "heartbeat", {
        mode: collabRuntime.autoConnectMode,
        endpointUrl: collabRuntime.endpointUrl,
        hasSession,
        sessionError,
        lastConnectError: collabRuntime.lastConnectError,
        collabDiagnostics,
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
    const enabledByQuery = enabledParam === "1" || enabledParam === "true";

    const endpointUrl = params.get("collabEndpoint") || DEFAULT_COLLAB_ENDPOINT;
    const userId =
      params.get("collabUser") || `web-${projectId || "debug-user"}`;
    const clientId =
      params.get("collabClient") || buildDefaultClientId(projectId);
    const token = params.get("collabToken") || undefined;
    const autoConnectMode = enabledByQuery ? "query_enabled" : "always_enabled";
    collabRuntime.endpointUrl = endpointUrl;
    collabRuntime.autoConnectMode = autoConnectMode;
    collabRuntime.lastConnectError = null;
    collabRuntime.userId = userId;
    collabRuntime.clientId = clientId;
    collabRuntime.token = token || null;
    collabRuntime.reconnectAttempts = 0;
    collabRuntime.lastReconnectAttemptAt = null;

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

export const createWebProjectServiceWithCollab = async ({
  router,
  filePicker,
  subject,
}) => {
  const collabDebugEnabled = resolveCollabDebugEnabled();
  const collabDebugLog = createCollabDebugLogger({
    enabled: collabDebugEnabled,
  });

  const onRemoteEvent = createRemoteRefreshDispatcher({
    subject,
    collabDebugLog,
  });

  const projectService = createProjectService({
    router,
    filePicker,
    onRemoteEvent,
  });

  const collabRuntimeBootstrap = createCollabRuntimeBootstrap({
    projectService,
    router,
    collabDebugLog,
  });

  window.routevnCollab = {
    connect: collabRuntimeBootstrap.connectCollabDebugSession,
    disconnect: collabRuntimeBootstrap.disconnectCollabDebugSession,
    status: collabRuntimeBootstrap.getCollabDebugStatus,
  };

  if (collabDebugEnabled) {
    collabDebugLog("info", "debug helpers ready", {
      helpers: [
        "window.routevnCollab.connect(options)",
        "window.routevnCollab.disconnect()",
        "window.routevnCollab.status()",
      ],
    });
    collabRuntimeBootstrap.startCollabHeartbeatLogs();
  }

  await collabRuntimeBootstrap.bootCollabFromQuery();
  return projectService;
};
