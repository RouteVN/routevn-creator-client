const normalizeRootPath = (path) => {
  if (typeof path !== "string" || path.length === 0) {
    return "";
  }

  if (path.length === 1) {
    return path;
  }

  return path.replace(/[\\/]+$/, "");
};

const getPathLabel = (path) => {
  const normalizedPath = normalizeRootPath(path);
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalizedPath;
};

const getItemIdFromEvent = (event) => {
  return event?.currentTarget?.dataset?.serverId ?? "";
};

const toServerItem = (server = {}, { itemId } = {}) => {
  return {
    id: itemId ?? server.serverId,
    serverId: server.serverId,
    name: getPathLabel(server.rootPath),
    rootPath: server.rootPath ?? "",
    url: server.url ?? "",
    status: "running",
  };
};

const getStartServerErrorMessage = (error) => {
  const message = error?.message ?? "";

  if (message.includes("index.html")) {
    return "Selected folder must contain an index.html file.";
  }

  if (message.includes("directory")) {
    return "Please select a valid folder.";
  }

  return "Failed to start the web server.";
};

const startServer = async (deps, { itemId, rootPath } = {}) => {
  const { appService, render, store } = deps;

  if (!rootPath) {
    appService.showAlert({
      title: "Error",
      message: "Server folder is missing.",
    });
    return false;
  }

  let startedServer;
  try {
    startedServer = await appService.startStaticWebServer({
      rootPath,
    });
  } catch (error) {
    console.error("Failed to start static web server", {
      itemId,
      rootPath,
      error,
    });
    appService.showAlert({
      title: "Error",
      message: getStartServerErrorMessage(error),
    });
    return false;
  }

  const existingServer = store.selectServerByRootPath(startedServer.rootPath);
  if (
    existingServer &&
    existingServer.status !== "stopped" &&
    existingServer.id !== itemId
  ) {
    store.setSelectedItemId({
      itemId: existingServer.id,
    });
    render();
    appService.showToast({
      message: "That folder is already being served.",
    });
    return false;
  }

  store.addServer({
    server: toServerItem(startedServer, {
      itemId: itemId ?? existingServer?.id,
    }),
  });
  render();

  appService.showToast({
    message: existingServer ? "Web server restarted." : "Web server started.",
  });

  return true;
};

const loadRunningServers = async (deps) => {
  const { appService, render, store } = deps;

  if (appService.getPlatform() !== "tauri") {
    store.setServers({
      servers: [],
    });
    render();
    return;
  }

  try {
    const servers = await appService.listStaticWebServers();
    store.setServers({
      servers: (Array.isArray(servers) ? servers : []).map((server) =>
        toServerItem(server),
      ),
    });
    render();
  } catch (error) {
    console.error("Failed to load static web servers", { error });
    appService.showToast({
      title: "Error",
      message: "Failed to load running web servers.",
      status: "error",
    });
  }
};

export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;

  store.setPlatform({
    platform: appService.getPlatform(),
  });

  void loadRunningServers(deps);
};

export const handleAfterMount = async (deps) => {
  await loadRunningServers(deps);
};

export const handleAddServerClick = async (deps) => {
  const { appService } = deps;

  if (appService.getPlatform() !== "tauri") {
    appService.showAlert({
      title: "Unsupported",
      message: "The web server page is only available in the desktop app.",
    });
    return;
  }

  let rootPath;
  try {
    rootPath = await appService.openFolderPicker({
      title: "Select Static Site Folder",
    });
  } catch {
    appService.showAlert({
      title: "Error",
      message: "Failed to open the folder picker.",
    });
    return;
  }

  if (!rootPath) {
    return;
  }

  await startServer(deps, {
    rootPath,
  });
};

export const handleServerItemClick = (deps, payload) => {
  const { store, render } = deps;
  const serverId = getItemIdFromEvent(payload?._event);

  if (!serverId) {
    return;
  }

  store.setSelectedItemId({
    itemId: serverId,
  });
  render();
};

export const handleCopyUrlClick = async (deps, payload) => {
  const { appService, store } = deps;
  payload?._event?.stopPropagation?.();

  const serverId = getItemIdFromEvent(payload?._event);
  if (!serverId) {
    return;
  }

  const server = store.selectServer(serverId);
  if (!server?.url) {
    appService.showAlert({
      title: "Error",
      message: "Server URL is missing.",
    });
    return;
  }

  if (server.status === "stopped") {
    appService.showAlert({
      title: "Warning",
      message: "Web server is stopped.",
    });
    return;
  }

  try {
    await appService.copyText(server.url);
    appService.showToast({
      message: "Server URL copied.",
    });
  } catch {
    appService.showAlert({
      title: "Error",
      message: "Failed to copy the server URL.",
    });
  }
};

export const handleStartServerClick = async (deps, payload) => {
  const { appService, store } = deps;
  payload?._event?.stopPropagation?.();

  const itemId = getItemIdFromEvent(payload?._event);
  if (!itemId) {
    return;
  }

  const server = store.selectServer(itemId);
  if (!server) {
    return;
  }

  if (server.status !== "stopped" && server.serverId) {
    appService.showToast({
      message: "Web server is already running.",
    });
    return;
  }

  await startServer(deps, {
    itemId: server.id,
    rootPath: server.rootPath,
  });
};

export const handleStopServerClick = async (deps, payload) => {
  const { appService, store, render } = deps;
  payload?._event?.stopPropagation?.();

  const serverId = getItemIdFromEvent(payload?._event);
  if (!serverId) {
    return;
  }

  const server = store.selectServer(serverId);
  if (!server) {
    return;
  }

  if (server.status === "stopped" || !server.serverId) {
    store.stopServer({
      itemId: serverId,
    });
    render();
    return;
  }

  try {
    await appService.stopStaticWebServer({
      serverId: server.serverId,
    });
  } catch (error) {
    console.error("Failed to stop static web server", {
      server,
      error,
    });
    appService.showAlert({
      title: "Error",
      message: "Failed to stop the web server.",
    });
    return;
  }

  store.stopServer({
    itemId: serverId,
  });
  render();

  appService.showToast({
    message: "Web server stopped.",
  });
};
