import { filter, fromEvent, tap } from "rxjs";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  const { appService } = deps;
  const currentPath = appService.getPath();

  if (currentPath === "/") {
    appService.navigate("/projects");
    deps.store.setCurrentRoute({ route: "/projects" });
  } else {
    deps.store.setCurrentRoute({ route: currentPath });
  }

  deps.render();
  return cleanupSubscriptions;
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
  deps.render();
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
  ];
};
