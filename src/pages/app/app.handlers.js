import { filter, fromEvent, tap } from "rxjs";

export const handleBeforeMount = (deps) => {
  console.log("handleBeforeMount", deps.router.getPathName());
  const currentPath = deps.router.getPathName();

  if (currentPath === "/") {
    deps.router.redirect("/project");
    deps.store.setCurrentRoute("/project");
  } else {
    deps.store.setCurrentRoute(currentPath);
  }

  deps.render();
};

export const handleRedirect = (payload, deps) => {
  deps.store.setCurrentRoute(payload.path);
  deps.router.redirect(payload.path, payload.payload);
  deps.render();
};

export const handleWindowPop = (payload, deps) => {
  // console.log('handleWindowPop', payload);
  console.log("pathname", deps.router.getPathName());
  deps.store.setCurrentRoute(deps.router.getPathName());
  deps.render();
};

export const handleUpdatePlacement = (payload, deps) => {
  const { repository } = deps;
  const { itemId, updates } = payload;

  repository.addAction({
    actionType: "treeUpdate",
    target: "placements",
    value: {
      id: itemId,
      replace: false,
      item: updates,
    },
  });
};

export const handleUpdateColor = (payload, deps) => {
  const { repository } = deps;
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
        deps.handlers.handleRedirect(payload, deps);
      }),
    ),
    fromEvent(window, "popstate").pipe(
      filter((e) => {
        console.log("popstate", e.target.location);
        // return !!e.target.location;
        return true;
      }),
      tap((e) => {
        deps.handlers.handleWindowPop(e, deps);
      }),
    ),
  ];
};
