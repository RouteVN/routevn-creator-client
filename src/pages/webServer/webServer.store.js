import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { selectWebServerPageCopy } from "./support/webServerPageCopy.js";

const normalizeDisplayPath = (path) => {
  if (typeof path !== "string") {
    return "";
  }

  return path.startsWith("\\\\?\\") ? path.slice(4) : path;
};

const getServerStatusText = (server = {}, copy = {}) => {
  return server.status !== "stopped"
    ? (copy.runningStatus ?? "Running")
    : (copy.stoppedStatus ?? "Stopped");
};

const buildDetailFields = ({ server, copy = {} } = {}) => {
  if (!server) {
    return [];
  }

  return [
    {
      type: "description",
      value: copy.memoryOnlyDescription ?? "Items live only in memory.",
    },
    {
      type: "text",
      label: copy.folderLabel ?? "Folder",
      value: normalizeDisplayPath(server.rootPath),
    },
    {
      type: "text",
      label: copy.urlLabel ?? "URL",
      value: server.url ?? "",
    },
    {
      type: "text",
      label: copy.statusLabel ?? "Status",
      value: server.statusText ?? "",
    },
    {
      type: "slot",
      slot: "actions",
      label: copy.actionsLabel ?? "Actions",
    },
  ];
};

export const createInitialState = () => ({
  platform: "tauri",
  servers: [],
  selectedItemId: undefined,
});

export const selectServer = ({ state }, serverId) => {
  if (!serverId) {
    return undefined;
  }

  return (state.servers ?? []).find((server) => server.id === serverId);
};

export const selectServers = ({ state }) => {
  return state.servers;
};

export const selectServerByRootPath = ({ state }, rootPath) => {
  if (!rootPath) {
    return undefined;
  }

  return (state.servers ?? []).find((server) => server.rootPath === rootPath);
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectWebServerPageCopy(i18n);
  const selectedServer = selectServer({ state }, state.selectedItemId);
  const canAdd = state.platform === "tauri";

  return {
    platform: state.platform,
    canAdd,
    servers: (state.servers ?? []).map((server) => {
      const isSelected = server.id === state.selectedItemId;
      const isRunning = server.status !== "stopped";
      const statusText = getServerStatusText(server, copy);

      return {
        ...server,
        displayRootPath: normalizeDisplayPath(server.rootPath),
        statusText,
        statusSummary: formatI18nCopy(
          copy.statusSummaryTemplate ?? "Status: {status}",
          { status: statusText },
        ),
        canCopyUrl: isRunning && !!server.url,
        canStartServer: !isRunning && !!server.rootPath,
        canStopServer: isRunning && !!server.serverId,
        itemBorderColor: isSelected ? "pr" : "bo",
        itemHoverBorderColor: isSelected ? "pr" : "ac",
      };
    }),
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedServer?.name ?? "",
    detailFields: buildDetailFields({
      copy,
      server: selectedServer
        ? {
            ...selectedServer,
            statusText: getServerStatusText(selectedServer, copy),
          }
        : undefined,
    }),
    canCopySelectedServerUrl:
      selectedServer?.status !== "stopped" && !!selectedServer?.url,
    canStartSelectedServer:
      selectedServer?.status === "stopped" && !!selectedServer?.rootPath,
    canStopSelectedServer:
      selectedServer?.status !== "stopped" && !!selectedServer?.serverId,
    emptyStateTitle: canAdd
      ? (copy.emptyTitle ?? "No web servers")
      : (copy.desktopOnlyTitle ?? "Desktop only"),
    emptyStateDescription: canAdd
      ? (copy.emptyDescription ??
        "Add a static site folder with an index.html file to serve it over localhost.")
      : (copy.desktopOnlyDescription ??
        "This release tool needs the Tauri desktop app because it starts a local server."),
    title: copy.title ?? "Web Server",
    addButton: copy.addButton ?? "Add",
    copyUrlButton: copy.copyUrlButton ?? "Copy URL",
    startButton: copy.startButton ?? "Start",
    stopButton: copy.stopButton ?? "Stop",
    startWebServerButton: copy.startWebServerButton ?? "Start Web Server",
    stopWebServerButton: copy.stopWebServerButton ?? "Stop Web Server",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    resourceCategory: "releases",
    selectedResourceId: "webServer",
  };
};

export const setPlatform = ({ state }, { platform } = {}) => {
  state.platform = platform ?? "tauri";
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setServers = ({ state }, { servers } = {}) => {
  state.servers = Array.isArray(servers) ? servers : [];

  const hasSelectedServer = state.servers.some(
    (server) => server.id === state.selectedItemId,
  );
  if (!hasSelectedServer) {
    state.selectedItemId = undefined;
  }
};

export const addServer = ({ state }, { server } = {}) => {
  if (!server?.id) {
    return;
  }

  const existingIndex = state.servers.findIndex(
    (item) => item.id === server.id || item.rootPath === server.rootPath,
  );
  if (existingIndex === -1) {
    state.servers = [server, ...state.servers];
  } else {
    state.servers[existingIndex] = {
      ...state.servers[existingIndex],
      ...server,
    };
  }

  state.selectedItemId =
    existingIndex === -1 ? server.id : state.servers[existingIndex].id;
};

export const stopServer = ({ state }, { itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const existingIndex = state.servers.findIndex((item) => item.id === itemId);
  if (existingIndex === -1) {
    return;
  }

  state.servers[existingIndex].status = "stopped";
  state.servers[existingIndex].serverId = undefined;
  state.servers[existingIndex].url = "";
};
