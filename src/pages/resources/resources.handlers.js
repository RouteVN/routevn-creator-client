export const lstrip = (prefix) => {
  return (str) => {
    if (str.startsWith(prefix)) {
      return str.slice(prefix.length);
    }
    return str;
  };
};

export const handleResourcesClick = (deps, payload) => {
  const { appService, store, subject } = deps;
  const { selectResourceRoute } = store;
  const target = payload._event.currentTarget;
  const resourceId =
    target?.dataset?.resourceId || lstrip("resource-")(target?.id || "") || "";
  const route = selectResourceRoute(resourceId);
  if (!route) {
    console.warn(`[resources] Missing route for resource id: ${resourceId}`);
    return;
  }
  subject.dispatch("redirect", {
    path: route,
    payload: appService.getPayload(),
  });
};
