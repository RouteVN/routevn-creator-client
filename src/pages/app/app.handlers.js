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
import {
  getProjectOpenErrorMessage,
  isIncompatibleProjectOpenError,
} from "../../internal/projectOpenErrors.js";
import {
  createNavigationTiming,
  finishNavigationTiming,
  logNavigationInteractionTiming,
  markNavigationPaintTiming,
  markNavigationTiming,
} from "../../internal/navigationTiming.js";
import { getRoutevnCreatorDocsUrl } from "../../internal/routevnUrls.js";
import { resolveUpdatesEnabled } from "../../internal/updates.js";
import { recordRecentSceneVisit } from "../../internal/ui/recentScenes.js";

const GLOBAL_NAV_TIMEOUT_MS = 1500;
const ROUTE_HISTORY_MODES = new Set(["push", "replace", "none"]);

const normalizeRouteHistoryMode = (historyMode, fallback = "none") =>
  ROUTE_HISTORY_MODES.has(historyMode) ? historyMode : fallback;

const selectAppCopy = (i18n = {}) => i18n.appPage ?? {};

const formatCopy = (template, values = {}) => {
  return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  );
};

const isDifferentPath = (left, right) => {
  return Boolean(left && right && left !== right);
};

const shouldSkipAppImageAutomaticUpdates = (status = {}) => {
  return (
    status.available === true &&
    status.integrated === true &&
    isDifferentPath(status.appimagePath, status.installedAppimagePath)
  );
};

export const maybePromptLinuxAppImageDesktopIntegration = async (deps) => {
  const { appService, i18n } = deps;
  const copy = selectAppCopy(i18n);

  if (
    appService?.getDistribution?.() !== "direct" ||
    typeof appService.getLinuxAppImageDesktopIntegrationStatus !== "function" ||
    typeof appService.installLinuxAppImageDesktopIntegration !== "function" ||
    typeof appService.restartLinuxAppImageFromDesktopIntegration !== "function"
  ) {
    return { skipAutomaticUpdateChecks: false };
  }

  let status;
  try {
    status = await appService.getLinuxAppImageDesktopIntegrationStatus();
  } catch (error) {
    console.error(
      "Failed to inspect Linux AppImage desktop integration:",
      error,
    );
    return { skipAutomaticUpdateChecks: false };
  }

  if (!status?.available) {
    return { skipAutomaticUpdateChecks: false };
  }

  if (status.integrated) {
    return {
      skipAutomaticUpdateChecks: shouldSkipAppImageAutomaticUpdates(status),
    };
  }

  const shouldInstall = await appService.showDialog({
    title: copy.linuxDesktopIntegrationTitle ?? "Add to Applications?",
    message:
      copy.linuxDesktopIntegrationMessage ??
      "Copy RouteVN Creator to ~/Applications, add the launcher icon, and reopen it from there.",
    confirmText: copy.linuxDesktopIntegrationConfirm ?? "Add to Applications",
    cancelText: copy.linuxDesktopIntegrationCancel ?? "Not Now",
  });

  if (!shouldInstall) {
    return { skipAutomaticUpdateChecks: false };
  }

  let nextStatus;
  try {
    nextStatus = await appService.installLinuxAppImageDesktopIntegration();
  } catch (error) {
    const message = error?.message ?? String(error ?? "");
    await appService.showAlert?.({
      title: copy.errorTitle ?? "Error",
      message: formatCopy(
        copy.linuxDesktopIntegrationFailed ??
          "Could not add RouteVN Creator to Applications: {message}",
        { message },
      ),
      status: "error",
    });
    return { skipAutomaticUpdateChecks: false };
  }

  try {
    await appService.restartLinuxAppImageFromDesktopIntegration();
  } catch (error) {
    const message = error?.message ?? String(error ?? "");
    await appService.showAlert?.({
      title: copy.errorTitle ?? "Error",
      message: formatCopy(
        copy.linuxDesktopIntegrationRestartFailed ??
          "RouteVN Creator was added to Applications, but could not reopen it: {message}",
        { message },
      ),
      status: "error",
    });
  }

  return {
    skipAutomaticUpdateChecks: shouldSkipAppImageAutomaticUpdates(nextStatus),
  };
};

const isProjectRoute = (path) => {
  return path === "/project" || path.startsWith("/project/");
};

const LEGACY_ROUTE_REDIRECTS = {
  "/project/system-variables": "/project/controls",
};

const getCanonicalRoutePath = (path) => {
  const normalizedPath =
    typeof path === "string" && path.length > 1
      ? path.replace(/\/+$/, "")
      : path;

  return LEGACY_ROUTE_REDIRECTS[normalizedPath] ?? path;
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

const renderWithNavigationTiming = ({ render, timing, event }) => {
  markNavigationTiming(timing, `${event}.render.start`);
  render();
  markNavigationTiming(timing, `${event}.render.end`);
  markNavigationPaintTiming(timing, `${event}.paint`);
};

const createRouteTransitionRunner = (deps) => {
  let transitionToken = 0;

  return async ({
    path,
    payload,
    historyMode,
    historyState,
    shouldUpdateHistory = false,
    timing,
  } = {}) => {
    const { appService, projectService, store, render, i18n } = deps;
    const copy = selectAppCopy(i18n);
    const currentTransitionToken = ++transitionToken;
    const nextPayload = normalizePayload(payload);
    const canonicalPath = getCanonicalRoutePath(path);
    const routeHistoryMode = normalizeRouteHistoryMode(
      historyMode,
      shouldUpdateHistory ? "push" : "none",
    );
    const routeTiming =
      timing ??
      createNavigationTiming({
        appService,
        source: "route.transition",
        path: canonicalPath,
        payload: nextPayload,
      });
    markNavigationTiming(routeTiming, "route.transition.start", {
      historyMode: routeHistoryMode,
      requestedPath: path,
      canonicalPath,
    });

    if (routeHistoryMode === "push") {
      appService.redirect(canonicalPath, nextPayload, { state: historyState });
      markNavigationTiming(routeTiming, "route.history.redirected");
    } else if (routeHistoryMode === "replace" || canonicalPath !== path) {
      appService.replace(canonicalPath, nextPayload, { state: historyState });
      markNavigationTiming(routeTiming, "route.history.replaced");
    }

    const currentProjectId = appService.getCurrentProjectId();
    if (isProjectRoute(canonicalPath) && !currentProjectId) {
      markNavigationTiming(routeTiming, "route.missing-project.redirect");
      appService.replace("/projects");
      store.setCurrentRoute({ route: "/projects" });
      store.setRepositoryLoading({ isLoading: false });
      renderWithNavigationTiming({
        render,
        timing: routeTiming,
        event: "route.missing-project-final",
      });
      finishNavigationTiming(routeTiming, "route.transition.complete", {
        missingProjectId: true,
      });
      return;
    }

    if (canonicalPath === "/project/scene-editor") {
      recordRecentSceneVisit({
        appService,
        projectId: nextPayload?.p ?? currentProjectId,
        sceneId: nextPayload?.s ?? nextPayload?.sceneId,
      });
    }

    const needsRepository = routeNeedsRepository(
      canonicalPath,
      currentProjectId,
    );
    const ensuredProjectId = projectService.getEnsuredProjectId();
    const isAlreadyEnsured = currentProjectId === ensuredProjectId;
    const shouldReleaseEnsuredRepository =
      !!ensuredProjectId &&
      (!needsRepository || ensuredProjectId !== currentProjectId);
    markNavigationTiming(routeTiming, "route.state.resolved", {
      currentProjectId,
      ensuredProjectId,
      needsRepository,
      isAlreadyEnsured,
      shouldReleaseEnsuredRepository,
    });
    store.setCurrentRoute({ route: canonicalPath });
    store.closeMobileSheet();
    store.setRepositoryLoading({
      isLoading: needsRepository && !isAlreadyEnsured,
    });
    if (needsRepository && !isAlreadyEnsured) {
      store.setRepositoryLoadingPhase({
        phase: copy.refreshingProjectEntry ?? "Refreshing project entry...",
      });
    }
    renderWithNavigationTiming({
      render,
      timing: routeTiming,
      event: "route.initial",
    });

    if (shouldReleaseEnsuredRepository) {
      markNavigationTiming(routeTiming, "repository.release.start", {
        ensuredProjectId,
      });
      await projectService.releaseProjectRuntime(ensuredProjectId);
      markNavigationTiming(routeTiming, "repository.release.end", {
        ensuredProjectId,
      });
    }

    if (!needsRepository) {
      if (currentTransitionToken !== transitionToken) {
        return;
      }

      void appService.refreshCurrentProjectEntry();
      markNavigationTiming(routeTiming, "project-entry.refresh.detached");
      store.setRepositoryLoading({ isLoading: false });
      renderWithNavigationTiming({
        render,
        timing: routeTiming,
        event: "route.non-project-final",
      });
      finishNavigationTiming(routeTiming, "route.transition.complete", {
        needsRepository,
      });
      return;
    }

    try {
      markNavigationTiming(routeTiming, "project-entry.refresh.start");
      await appService.refreshCurrentProjectEntry();
      markNavigationTiming(routeTiming, "project-entry.refresh.end");
      markNavigationTiming(routeTiming, "repository.ensure.start");
      await projectService.ensureRepository({
        onLoadStage: ({ label } = {}) => {
          if (currentTransitionToken !== transitionToken) {
            return;
          }

          if (typeof label === "string" && label.length > 0) {
            store.setRepositoryLoadingPhase({
              phase: label,
            });
            store.setRepositoryLoadingProgress({
              current: 0,
              total: 0,
            });
            renderWithNavigationTiming({
              render,
              timing: routeTiming,
              event: "repository.load-stage",
            });
          }
        },
        onEventLoadProgress: ({ current, total, label } = {}) => {
          if (currentTransitionToken !== transitionToken) {
            return;
          }

          if (typeof label === "string" && label.length > 0) {
            store.setRepositoryLoadingPhase({
              phase: label,
            });
          }

          store.setRepositoryLoadingProgress({
            current,
            total,
          });
          renderWithNavigationTiming({
            render,
            timing: routeTiming,
            event: "repository.event-progress",
          });
        },
        onHydrationProgress: ({ current, total } = {}) => {
          if (currentTransitionToken !== transitionToken) {
            return;
          }

          store.setRepositoryLoadingPhase({
            phase: copy.buildingProjectState ?? "Building project state...",
          });

          store.setRepositoryLoadingProgress({
            current,
            total,
          });
          renderWithNavigationTiming({
            render,
            timing: routeTiming,
            event: "repository.hydration-progress",
          });
        },
      });
      markNavigationTiming(routeTiming, "repository.ensure.end");

      if (currentTransitionToken !== transitionToken) {
        return;
      }

      store.setRepositoryLoading({ isLoading: false });
      renderWithNavigationTiming({
        render,
        timing: routeTiming,
        event: "route.project-final",
      });
      finishNavigationTiming(routeTiming, "route.transition.complete", {
        needsRepository,
      });
    } catch (error) {
      if (currentTransitionToken !== transitionToken) {
        return;
      }

      markNavigationTiming(routeTiming, "route.transition.error", {
        message: error?.message,
      });
      store.setRepositoryLoading({ isLoading: false });
      if (isIncompatibleProjectOpenError(error)) {
        await appService.showAlert({
          title: copy.incompatibleProjectTitle ?? "Incompatible Project",
          message: getProjectOpenErrorMessage(error),
          status: "error",
        });
      } else {
        appService.showAlert({ message: getProjectOpenErrorMessage(error) });
      }
      appService.redirect("/projects");
      store.setCurrentRoute({ route: "/projects" });
      renderWithNavigationTiming({
        render,
        timing: routeTiming,
        event: "route.error-final",
      });
      finishNavigationTiming(routeTiming, "route.transition.complete", {
        needsRepository,
        error: true,
      });
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
  t: "/project/transforms",
  s: "/project/sounds",
  n: "/project/scenes",
  r: "/project/releases",
  a: "/project/about",
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  const { appService, store, subject, uiConfig } = deps;
  const currentPath = appService.getPath();
  const initialPath = currentPath === "/" ? "/projects" : currentPath;

  appService.setAppCopyProvider?.(() => selectAppCopy(deps.i18n));
  store.setPlatform({ platform: appService.getPlatform() });
  store.setUiConfig({ uiConfig });
  subject.dispatch("app.route.request", {
    path: initialPath,
    payload: appService.getPayload(),
    shouldUpdateHistory: currentPath === "/",
  });

  return () => {
    cleanupSubscriptions();
  };
};

export const handleAfterMount = (deps) => {
  void maybePromptLinuxAppImageDesktopIntegration(deps)
    .catch((error) => {
      console.error(
        "Failed to handle Linux AppImage desktop integration:",
        error,
      );
      return { skipAutomaticUpdateChecks: false };
    })
    .then(({ skipAutomaticUpdateChecks = false } = {}) => {
      const { updaterService } = deps;

      if (
        !skipAutomaticUpdateChecks &&
        resolveUpdatesEnabled(deps) &&
        updaterService
      ) {
        updaterService.startAutomaticChecks({
          getCopy: () => selectAppCopy(deps.i18n),
        });
      }
    });
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

export const handleHelpFloatingButtonClick = (deps) => {
  const { appService, store } = deps;
  const currentRoutePattern = store.selectCurrentRoutePattern();

  appService.openUrl(getRoutevnCreatorDocsUrl(currentRoutePattern));
};

export const handleMobileTabClick = (deps, payload = {}) => {
  const { appService, store, render } = deps;
  const tabId = payload._event.currentTarget.dataset.tabId;
  logNavigationInteractionTiming({
    appService,
    source: "app.mobile-tab.click",
    event: payload._event,
    data: { tabId },
  });

  if (
    tabId === "assets" ||
    tabId === "scene-map" ||
    tabId === "release" ||
    tabId === "settings"
  ) {
    const timing = createNavigationTiming({
      appService,
      source: "app.mobile-tab.open-sheet",
      path: `mobile-sheet:${tabId}`,
      event: payload._event,
      data: { tabId },
    });
    store.openMobileSheet({ variant: tabId });
    renderWithNavigationTiming({
      render,
      timing,
      event: "mobile-sheet.open",
    });
    finishNavigationTiming(timing, "mobile-sheet.open.complete");
  }
};

export const handleMobileTabPointerDown = (deps, payload = {}) => {
  const { appService } = deps;
  logNavigationInteractionTiming({
    appService,
    source: "app.mobile-tab.pointerdown",
    event: payload._event,
    data: { tabId: payload._event.currentTarget.dataset.tabId },
  });
};

export const handleMobileTabPointerUp = (deps, payload = {}) => {
  const { appService } = deps;
  logNavigationInteractionTiming({
    appService,
    source: "app.mobile-tab.pointerup",
    event: payload._event,
    data: { tabId: payload._event.currentTarget.dataset.tabId },
  });
};

export const handleMobileSheetClose = (deps) => {
  const { store, render } = deps;

  store.closeMobileSheet();
  render();
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
        const historyMode = normalizeRouteHistoryMode(
          payload?.historyMode,
          shouldUpdateHistory || !!payload?.shouldUpdateHistory
            ? "push"
            : "none",
        );
        const timing =
          payload?.timing ??
          createNavigationTiming({
            appService,
            source: `subject.${action}`,
            path,
            payload: nextPayload,
          });
        markNavigationTiming(timing, "route.subscription.received", {
          action,
          historyMode,
        });

        runRouteTransition({
          path,
          payload: nextPayload,
          historyMode,
          historyState: payload?.historyState,
          timing,
        }).catch((error) => {
          markNavigationTiming(timing, "route.subscription.error", {
            message: error?.message,
          });
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
            appService.navigate(
              targetPath,
              getCurrentQueryPayload(appService),
              {
                historyMode: "replace",
              },
            );
          }),
        ),
      ),
    ),
  ];
};
