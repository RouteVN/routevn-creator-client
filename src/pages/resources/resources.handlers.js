export const lstrip = (prefix) => {
  return (str) => {
    if (str.startsWith(prefix)) {
      return str.slice(prefix.length);
    }
    return str;
  };
};

export const handleResourcesClick = (deps, payload) => {
  console.log("iiiiiiiiiiiiiiii");
  const { selectResourceRoute } = deps.store;
  const resourceId = lstrip("resource-")(payload._event.currentTarget.id);
  const route = selectResourceRoute(resourceId);
  console.log({
    resourceId,
    route,
  });
  deps.subject.dispatch("redirect", {
    path: route,
  });
  // deps.router.redirect(route);
};
