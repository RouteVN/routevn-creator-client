import {
  EMPTY,
  filter,
  fromEvent,
  share,
  switchMap,
  take,
  tap,
  timeout,
} from "rxjs";

const GLOBAL_NAV_TIMEOUT_MS = 1500;

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

const isMissingProjectResolutionError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("project resolution is required") &&
    message.includes("width") &&
    message.includes("height")
  );
};

const getProjectLoadErrorMessage = (error) => {
  if (isMissingProjectResolutionError(error)) {
    return "Project is missing required resolution settings.";
  }

  return error?.message || "Failed to load project.";
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

const createRouteTransitionRunner = (deps) => {
  let transitionToken = 0;

  return async ({ path, payload, shouldUpdateHistory = false } = {}) => {
    const { appService, projectService, store, render } = deps;
    const currentTransitionToken = ++transitionToken;
    const nextPayload = normalizePayload(payload);

    if (shouldUpdateHistory) {
      appService.redirect(path, nextPayload);
    }

    const currentProjectId = appService.getCurrentProjectId();
    const needsRepository = routeNeedsRepository(path, currentProjectId);
    const isAlreadyEnsured =
      currentProjectId === projectService.getEnsuredProjectId();

    store.setCurrentRoute({ route: path });
    store.setRepositoryLoading({
      isLoading: needsRepository && !isAlreadyEnsured,
    });
    render();

    if (!needsRepository) {
      if (currentTransitionToken !== transitionToken) {
        return;
      }

      void appService.refreshCurrentProjectEntry();
      store.setRepositoryLoading({ isLoading: false });
      render();
      return;
    }

    try {
      await appService.refreshCurrentProjectEntry();
      await projectService.ensureRepository();

      if (currentTransitionToken !== transitionToken) {
        return;
      }

      store.setRepositoryLoading({ isLoading: false });
      render();
    } catch (error) {
      if (currentTransitionToken !== transitionToken) {
        return;
      }

      store.setRepositoryLoading({ isLoading: false });
      appService.showToast(getProjectLoadErrorMessage(error));
      appService.redirect("/projects");
      store.setCurrentRoute({ route: "/projects" });
      render();
    }
  };
};

const targetPathByKey = {
  p: "/project",
  i: "/project/images",
  h: "/project/spritesheets",
  c: "/project/characters",
  o: "/project/colors",
  f: "/project/fonts",
  y: "/project/text-styles",
  l: "/project/layouts",
  v: "/project/videos",
  b: "/project/variables",
  t: "/project/transforms",
  s: "/project/sounds",
  n: "/project/scenes",
  r: "/project/releases",
  a: "/project/about",
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  const { appService } = deps;
  const currentPath = appService.getPath();
  const initialPath = currentPath === "/" ? "/projects" : currentPath;

  deps.subject.dispatch("app.route.request", {
    path: initialPath,
    payload: appService.getPayload(),
    shouldUpdateHistory: currentPath === "/",
  });

  return () => {
    cleanupSubscriptions();
  };
};

export const handleAfterMount = (deps) => {
  // Start checking for updates on app startup (Tauri only)
  if (deps.updaterService) {
    deps.updaterService.startAutomaticChecks();
  }
};

export const handleWindowPop = (deps) => {
  const { appService } = deps;
  deps.subject.dispatch("app.route.request", {
    path: appService.getPath(),
    payload: appService.getPayload(),
    shouldUpdateHistory: false,
  });
};

export const handleUpdateTransform = async (deps, payload) => {
  const { projectService } = deps;
  const { itemId, updates } = payload;

  await projectService.updateTransform({
    transformId: itemId,
    data: updates,
  });
};

export const handleUpdateColor = async (deps, payload) => {
  const { projectService } = deps;
  const { itemId, updates } = payload;

  await projectService.updateColor({
    colorId: itemId,
    data: updates,
  });
};

const subscriptions = (deps) => {
  const { appService, subject } = deps;
  const runRouteTransition = createRouteTransitionRunner(deps);
  const projectKeyDown$ = fromEvent(window, "keydown").pipe(
    filter(() => isProjectRoute(appService.getPath())),
    filter((event) => !event.defaultPrevented),
    filter((event) => !event.ctrlKey && !event.metaKey && !event.altKey),
    filter((event) => !event.repeat),
    filter(() => !isTextInputFocused(appService)),
    filter((event) => !isEditableTarget(event)),
    share(),
  );

  return [
    subject.pipe(
      filter(
        ({ action }) => action === "redirect" || action === "app.route.request",
      ),
      tap(({ action, payload }) => {
        const shouldUpdateHistory = action === "redirect";
        const path = shouldUpdateHistory ? payload.path : payload?.path;
        const nextPayload = shouldUpdateHistory
          ? payload.payload
          : payload?.payload;

        runRouteTransition({
          path,
          payload: nextPayload,
          shouldUpdateHistory:
            shouldUpdateHistory || !!payload?.shouldUpdateHistory,
        }).catch((error) => {
          console.error("Failed to navigate:", error);
        });
      }),
    ),
    projectKeyDown$.pipe(
      filter((event) => String(event.key || "").toLowerCase() === "g"),
      tap((event) => {
        event.preventDefault();
        event.stopPropagation();
      }),
      switchMap(() =>
        projectKeyDown$.pipe(
          take(1),
          timeout({
            first: GLOBAL_NAV_TIMEOUT_MS,
            with: () => EMPTY,
          }),
          tap((event) => {
            const key = String(event.key || "").toLowerCase();
            const targetPath = targetPathByKey[key];
            if (!targetPath) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            appService.navigate(targetPath, getCurrentQueryPayload(appService));
          }),
        ),
      ),
    ),
  ];
};
