export const lstrip = (prefix) => {
  return (str) => {
    if (str.startsWith(prefix)) {
      return str.slice(prefix.length);
    }
    return str;
  };
};

export const handleResourcesClick = (e, deps) => {
  console.log("iiiiiiiiiiiiiiii");
  const { selectResourceRoute } = deps.store;
  const resourceId = lstrip("resource-")(e.currentTarget.id);
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
