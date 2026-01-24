import { filter, fromEvent, tap } from "rxjs";

export const handleBeforeMount = (deps) => {
  const { appService } = deps;
  const currentPath = appService.getPath();

  if (currentPath === "/") {
    appService.navigate("/projects");
    deps.store.setCurrentRoute("/projects");
  } else {
    deps.store.setCurrentRoute(currentPath);
  }

  deps.render();
};

export const handleAfterMount = (deps) => {
  // Start checking for updates on app startup (Tauri only)
  if (deps.updaterService) {
    deps.updaterService.startAutomaticChecks();
  }
};

export const handleRedirect = (deps, payload) => {
  const { appService } = deps;
  deps.store.setCurrentRoute(payload.path);
  appService.redirect(payload.path, payload.payload);
  deps.render();
};

export const handleWindowPop = (deps) => {
  const { appService } = deps;
  deps.store.setCurrentRoute(appService.getPath());
  deps.render();
};

export const handleUpdateTransform = async (deps, payload) => {
  const { projectService } = deps;
  const { itemId, updates } = payload;

  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "transforms",
      value: {
        id: itemId,
        item: updates,
      },
      options: {
        replace: false,
      },
    },
  });
};

export const handleUpdateColor = async (deps, payload) => {
  const { projectService } = deps;
  const { itemId, updates } = payload;

  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "colors",
      value: {
        id: itemId,
        item: updates,
      },
      options: {
        replace: false,
      },
    },
  });
};

export const subscriptions = (deps) => {
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
