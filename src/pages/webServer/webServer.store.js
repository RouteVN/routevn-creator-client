const normalizeDisplayPath = (path) => {
  if (typeof path !== "string") {
    return "";
  }

  return path.startsWith("\\\\?\\") ? path.slice(4) : path;
};

const buildDetailFields = ({ server } = {}) => {
  if (!server) {
    return [];
  }

  return [
    {
      type: "description",
      value: "Items live only in memory.",
    },
    {
      type: "text",
      label: "Folder",
      value: normalizeDisplayPath(server.rootPath),
    },
    {
      type: "text",
      label: "URL",
      value: server.url ?? "",
    },
    {
      type: "text",
      label: "Status",
      value: server.statusText ?? "",
    },
    {
      type: "slot",
      slot: "actions",
      label: "Actions",
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

export const selectViewData = ({ state }) => {
  const selectedServer = selectServer({ state }, state.selectedItemId);
  const canAdd = state.platform === "tauri";

  return {
    platform: state.platform,
    canAdd,
    servers: (state.servers ?? []).map((server) => {
      const isSelected = server.id === state.selectedItemId;
      const isRunning = server.status !== "stopped";

      return {
        ...server,
        displayRootPath: normalizeDisplayPath(server.rootPath),
        statusText: isRunning ? "Running" : "Stopped",
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
      server: selectedServer
        ? {
            ...selectedServer,
            statusText:
              selectedServer.status !== "stopped" ? "Running" : "Stopped",
          }
        : undefined,
    }),
    canCopySelectedServerUrl:
      selectedServer?.status !== "stopped" && !!selectedServer?.url,
    canStartSelectedServer:
      selectedServer?.status === "stopped" && !!selectedServer?.rootPath,
    canStopSelectedServer:
      selectedServer?.status !== "stopped" && !!selectedServer?.serverId,
    emptyStateTitle: canAdd ? "No web servers" : "Desktop only",
    emptyStateDescription: canAdd
      ? "Add a static site folder with an index.html file to serve it over localhost."
      : "This release tool needs the Tauri desktop app because it starts a local server.",
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
