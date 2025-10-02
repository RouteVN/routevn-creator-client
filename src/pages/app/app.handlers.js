import { filter, fromEvent, tap } from "rxjs";

export const handleBeforeMount = (deps) => {
  console.log("handleBeforeMount", deps.router.getPathName());
  const currentPath = deps.router.getPathName();

  if (currentPath === "/") {
    deps.router.redirect("/projects");
    deps.store.setCurrentRoute("/projects");
  } else {
    deps.store.setCurrentRoute(currentPath);
  }

  deps.render();
};

export const handleAfterMount = (deps) => {
  // Start checking for updates on app startup (Tauri only)
  if (deps.updaterService) {
    // deps.updaterService.checkForUpdatesOnStartup();
  }
};

export const handleRedirect = (deps, payload) => {
  deps.store.setCurrentRoute(payload.path);
  deps.router.redirect(payload.path, payload.payload);
  deps.render();
};

export const handleWindowPop = (deps, payload) => {
  // console.log('handleWindowPop', payload._event);
  console.log("pathname", deps.router.getPathName());
  deps.store.setCurrentRoute(deps.router.getPathName());
  deps.render();
};

export const handleUpdateTransform = async (deps, payload) => {
  const { repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId, updates } = payload;

  repository.addAction({
    actionType: "treeUpdate",
    target: "transforms",
    value: {
      id: itemId,
      replace: false,
      item: updates,
    },
  });
};

export const handleUpdateColor = async (deps, payload) => {
  const { repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId, updates } = payload;

  repository.addAction({
    actionType: "treeUpdate",
    target: "colors",
    value: {
      itemId: itemId,
      updates: updates,
    },
  });
};

export const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action, payload }) => action === "redirect"),
      tap(({ action, payload }) => {
        deps.handlers.handleRedirect(deps, { ...payload, action } );
      }),
    ),
    fromEvent(window, "popstate").pipe(
      filter((e) => {
        console.log("popstate", e.target.location);
        // return !!e.target.location;
        return true;
      }),
      tap((e) => {
        deps.handlers.handleWindowPop(deps, { _event: e });
      }),
    ),
  ];
};
