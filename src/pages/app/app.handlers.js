import { filter, fromEvent, tap } from "rxjs";

const GLOBAL_NAV_TIMEOUT_MS = 1500;

const getRuntime = (refs) => {
  refs.__appPageRuntime ??= {
    awaitingGlobalNavigationTarget: false,
    globalNavigationTimerId: undefined,
    routeTransitionToken: 0,
    lastEnsuredProjectId: "",
  };
  return refs.__appPageRuntime;
};

const isProjectRoute = (path) => {
  return path === "/project" || path.startsWith("/project/");
};

const getCurrentQueryPayload = (appService) => {
  const payload = appService.getPayload() || {};
  return Object.keys(payload).length > 0 ? payload : undefined;
};

const normalizePayload = (payload) => {
  if (payload && typeof payload === "object") {
    return payload;
  }
  return undefined;
};

const routeNeedsRepository = (path, projectId) => {
  return isProjectRoute(path) && !!projectId;
};

const clearGlobalNavigationState = (refs) => {
  const runtime = getRuntime(refs);
  runtime.awaitingGlobalNavigationTarget = false;
  if (runtime.globalNavigationTimerId !== undefined) {
    clearTimeout(runtime.globalNavigationTimerId);
    runtime.globalNavigationTimerId = undefined;
  }
};

const armGlobalNavigationState = (refs) => {
  const runtime = getRuntime(refs);
  runtime.awaitingGlobalNavigationTarget = true;
  if (runtime.globalNavigationTimerId !== undefined) {
    clearTimeout(runtime.globalNavigationTimerId);
  }
  runtime.globalNavigationTimerId = setTimeout(() => {
    clearGlobalNavigationState(refs);
  }, GLOBAL_NAV_TIMEOUT_MS);
};

const EDITABLE_TAGS = new Set([
  "input",
  "textarea",
  "select",
  "rtgl-input",
  "rtgl-select",
  "rtgl-textarea",
  "rvn-editable-text",
]);

const isEditableElement = (element) => {
  if (!(element instanceof Element)) {
    return false;
  }

  const tagName = element.tagName?.toLowerCase?.() || "";
  if (EDITABLE_TAGS.has(tagName)) {
    return true;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (typeof element.closest === "function") {
    const editableParent = element.closest(
      "[contenteditable], input, textarea, select, rtgl-input, rtgl-select, rtgl-textarea, rvn-editable-text",
    );
    if (editableParent) {
      return true;
    }
  }

  return false;
};

const isEditableTarget = (event) => {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];

  for (const node of path) {
    if (isEditableElement(node)) {
      return true;
    }
  }

  if (isEditableElement(event.target)) {
    return true;
  }

  if (isEditableElement(document.activeElement)) {
    return true;
  }

  return false;
};

const isTextInputFocused = (appService) => {
  if (typeof appService?.isInputFocused !== "function") {
    return false;
  }

  try {
    return appService.isInputFocused();
  } catch {
    return false;
  }
};

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const runRouteTransition = async (
  deps,
  { path, payload, shouldUpdateHistory = false } = {},
) => {
  const { appService, projectService, store, render, refs } = deps;
  const runtime = getRuntime(refs);
  const transitionToken = ++runtime.routeTransitionToken;
  const nextPayload = normalizePayload(payload);

  if (shouldUpdateHistory) {
    appService.redirect(path, nextPayload);
  }

  const currentProject = await appService.refreshCurrentProjectEntry();
  const currentProjectId = currentProject.id || "";
  const needsRepository = routeNeedsRepository(path, currentProjectId);
  const isAlreadyEnsured = currentProjectId === runtime.lastEnsuredProjectId;

  store.setCurrentRoute({ route: path });
  store.setRepositoryLoading({
    isLoading: needsRepository && !isAlreadyEnsured,
  });
  render();

  if (!needsRepository || isAlreadyEnsured) {
    if (transitionToken !== runtime.routeTransitionToken) {
      return;
    }
    store.setRepositoryLoading({ isLoading: false });
    render();
    return;
  }

  try {
    await projectService.ensureRepository();
    if (transitionToken !== runtime.routeTransitionToken) {
      return;
    }
    runtime.lastEnsuredProjectId = currentProjectId;
    store.setRepositoryLoading({ isLoading: false });
    render();
  } catch (error) {
    if (transitionToken !== runtime.routeTransitionToken) {
      return;
    }
    store.setRepositoryLoading({ isLoading: false });
    appService.showToast(error?.message || "Failed to load project.");
    appService.redirect("/projects");
    store.setCurrentRoute({ route: "/projects" });
    render();
  }
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  const { appService } = deps;
  const currentPath = appService.getPath();
  clearGlobalNavigationState(deps.refs);

  const initialPath = currentPath === "/" ? "/projects" : currentPath;
  runRouteTransition(deps, {
    path: initialPath,
    payload: appService.getPayload(),
    shouldUpdateHistory: currentPath === "/",
  }).catch((error) => {
    console.error("Failed to resolve initial route:", error);
  });

  return () => {
    clearGlobalNavigationState(deps.refs);
    cleanupSubscriptions();
  };
};

export const handleAfterMount = (deps) => {
  // Start checking for updates on app startup (Tauri only)
  if (deps.updaterService) {
    deps.updaterService.startAutomaticChecks();
  }
};

export const handleRedirect = (deps, payload) => {
  runRouteTransition(deps, {
    path: payload.path,
    payload: payload.payload,
    shouldUpdateHistory: true,
  }).catch((error) => {
    console.error("Failed to navigate:", error);
  });
};

export const handleWindowPop = (deps) => {
  const { appService } = deps;
  clearGlobalNavigationState(deps.refs);
  runRouteTransition(deps, {
    path: appService.getPath(),
    payload: appService.getPayload(),
    shouldUpdateHistory: false,
  }).catch((error) => {
    console.error("Failed to apply browser navigation:", error);
  });
};

export const handleGlobalKeyDown = (deps, payload) => {
  const { appService } = deps;
  const event = payload._event;
  const currentPath = appService.getPath();

  if (!isProjectRoute(currentPath)) {
    clearGlobalNavigationState(deps.refs);
    return;
  }

  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat ||
    isTextInputFocused(appService) ||
    isEditableTarget(event)
  ) {
    return;
  }

  const key = String(event.key || "").toLowerCase();
  if (!key) {
    return;
  }

  const runtime = getRuntime(deps.refs);

  if (runtime.awaitingGlobalNavigationTarget) {
    clearGlobalNavigationState(deps.refs);
    const queryPayload = getCurrentQueryPayload(appService);
    const targetPathByKey = {
      p: "/project",
      i: "/project/resources/images",
      c: "/project/resources/characters",
      o: "/project/resources/colors",
      f: "/project/resources/fonts",
      y: "/project/resources/typography",
      l: "/project/resources/layouts",
      v: "/project/resources/videos",
      b: "/project/resources/variables",
      t: "/project/resources/transforms",
      w: "/project/resources/tweens",
      s: "/project/resources/sounds",
      n: "/project/scenes",
      r: "/project/releases",
      a: "/project/settings/about",
    };
    const targetPath = targetPathByKey[key];

    if (targetPath) {
      event.preventDefault();
      event.stopPropagation();
      appService.navigate(targetPath, queryPayload);
      return;
    }

    return;
  }

  if (key === "g") {
    event.preventDefault();
    event.stopPropagation();
    armGlobalNavigationState(deps.refs);
  }
};

export const handleUpdateTransform = async (deps, payload) => {
  const { projectService } = deps;
  const { itemId, updates } = payload;

  await projectService.updateResourceItem({
    resourceType: "transforms",
    resourceId: itemId,
    patch: updates,
  });
};

export const handleUpdateColor = async (deps, payload) => {
  const { projectService } = deps;
  const { itemId, updates } = payload;

  await projectService.updateResourceItem({
    resourceType: "colors",
    resourceId: itemId,
    patch: updates,
  });
};

const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === "redirect"),
      tap(({ action, payload }) => {
        deps.handlers.handleRedirect(deps, { ...payload, action });
      }),
    ),
    fromEvent(window, "popstate").pipe(
      tap((e) => {
        deps.handlers.handleWindowPop(deps, { _event: e });
      }),
    ),
    fromEvent(window, "keydown").pipe(
      tap((e) => {
        deps.handlers.handleGlobalKeyDown(deps, { _event: e });
      }),
    ),
  ];
};
