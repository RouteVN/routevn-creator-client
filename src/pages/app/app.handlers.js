import { filter, fromEvent, tap } from "rxjs";

const GLOBAL_NAV_TIMEOUT_MS = 1500;

let awaitingGlobalNavigationTarget = false;
let globalNavigationTimerId = null;

const isProjectRoute = (path) => {
  return path === "/project" || path.startsWith("/project/");
};

const getCurrentQueryPayload = (appService) => {
  const payload = appService.getPayload() || {};
  return Object.keys(payload).length > 0 ? payload : undefined;
};

const clearGlobalNavigationState = () => {
  awaitingGlobalNavigationTarget = false;
  if (globalNavigationTimerId !== null) {
    clearTimeout(globalNavigationTimerId);
    globalNavigationTimerId = null;
  }
};

const armGlobalNavigationState = () => {
  awaitingGlobalNavigationTarget = true;
  if (globalNavigationTimerId !== null) {
    clearTimeout(globalNavigationTimerId);
  }
  globalNavigationTimerId = setTimeout(() => {
    clearGlobalNavigationState();
  }, GLOBAL_NAV_TIMEOUT_MS);
};

const EDITABLE_TAGS = new Set([
  "input",
  "textarea",
  "select",
  "rtgl-input",
  "rtgl-select",
  "rtgl-textarea",
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
      "[contenteditable], input, textarea, select, rtgl-input, rtgl-select, rtgl-textarea",
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

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  const { appService } = deps;
  const currentPath = appService.getPath();
  clearGlobalNavigationState();

  if (currentPath === "/") {
    appService.navigate("/projects");
    deps.store.setCurrentRoute({ route: "/projects" });
  } else {
    deps.store.setCurrentRoute({ route: currentPath });
  }

  deps.render();
  return () => {
    clearGlobalNavigationState();
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
  const { appService } = deps;
  deps.store.setCurrentRoute({ route: payload.path });
  appService.redirect(payload.path, payload.payload);
  deps.render();
};

export const handleWindowPop = (deps) => {
  const { appService } = deps;
  deps.store.setCurrentRoute({ route: appService.getPath() });
  clearGlobalNavigationState();
  deps.render();
};

export const handleGlobalKeyDown = (deps, payload) => {
  const { appService } = deps;
  const event = payload._event;
  const currentPath = appService.getPath();

  if (!isProjectRoute(currentPath)) {
    clearGlobalNavigationState();
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

  if (awaitingGlobalNavigationTarget) {
    clearGlobalNavigationState();
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
    armGlobalNavigationState();
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
