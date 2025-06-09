export const INITIAL_STATE = Object.freeze({
  currentRoute: "/projects",
});

export const selectShowSidebar = (state, props, payload) => {
  const currentRoutePattern = selectCurrentRoutePattern(state, props, payload);
  const routesWithNavBar = [
    "/projects/:projectId",
    "/projects/:projectId/resources",
    "/projects/:projectId/cgs",
    "/projects/:projectId/backgrounds",
    "/projects/:projectId/scenes",
    "/projects/:projectId/scenes/:sceneId/editor",
  ];
  console.log({
    currentRoutePattern,
    routesWithNavBar,
  });
  return routesWithNavBar.includes(currentRoutePattern);
};

export const selectCurrentRoutePattern = (state, props, payload) => {
  const routePatterms = [
    "/projects",
    "/projects/:projectId",
    "/projects/:projectId/resources",
    "/projects/:projectId/cgs",
    "/projects/:projectId/backgrounds",
    "/projects/:projectId/scenes",
    "/projects/:projectId/scenes/:sceneId/editor",
  ];
  const currentRoute = state.currentRoute;
  const matchPaths = (path, pattern) => {
    const pathParts = path.split("/");
    const patternParts = pattern.split("/");

    if (pathParts.length !== patternParts.length) {
      return false;
    }

    return pathParts.every((part, index) => {
      const patternPart = patternParts[index];
      // Check if the pattern part is a parameter (e.g., :id or {paramName})
      return patternPart === part || patternPart.startsWith(":");
    });
  };
  const routePattern = routePatterms.find((pattern) =>
    matchPaths(currentRoute, pattern)
  );
  return routePattern;
};

export const setCurrentRoute = (state, payload) => {
  state.currentRoute = payload;
  return state;
};

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    currentRoutePattern: selectCurrentRoutePattern(state, props, payload),
    showSidebar: selectShowSidebar(state, props, payload),
  };
};

