export const INITIAL_STATE = Object.freeze({
  currentRoute: "/projects",
});

export const selectShowSidebar = (state, props, payload) => {
  const currentRoutePattern = selectCurrentRoutePattern(state, props, payload);
  const routesWithNavBar = [
    "/project",
    "/projects",
    "/project/resources",
    "/project/cgs",
    "/project/resources/backgrounds",
    "/project/resources/characters",
    "/project/resources/bgm",
    "/project/resources/sfx",
    "/project/resources/animations",
    "/project/resources/positions",
    "/project/resources/visuals",
    "/project/resources/videos",
    "/project/resources/design-tokens",
    "/project/resources/components",
    "/project/resources/screens",
    "/project/resources/choices",
    "/project/resources/dialogue",
    "/project/resources/variables",
    "/project/resources/presets",
    "/project/scenes",
    "/project/scene-editor",
    "/project/settings",
  ];
  console.log({
    currentRoutePattern,
    routesWithNavBar,
  });
  return routesWithNavBar.includes(currentRoutePattern);
};

export const selectCurrentRoutePattern = (state, props, payload) => {
  const routePatterms = [
    "/project",
    "/projects",
    "/project/resources",
    "/project/cgs",
    "/project/resources/backgrounds",
    "/project/resources/characters",
    "/project/resources/bgm",
    "/project/resources/sfx",
    "/project/resources/animations",
    "/project/resources/positions",
    "/project/resources/visuals",
    "/project/resources/videos",
    "/project/resources/design-tokens",
    "/project/resources/components",
    "/project/resources/screens",
    "/project/resources/choices",
    "/project/resources/dialogue",
    "/project/resources/variables",
    "/project/resources/presets",
    "/project/scenes",
    "/project/scene-editor",
    "/project/settings",
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
};

export const toViewData = ({ state, props }, payload) => {
  return {
    ...state,
    currentRoutePattern: selectCurrentRoutePattern(state, props, payload),
    showSidebar: selectShowSidebar(state, props, payload),
  };
};

