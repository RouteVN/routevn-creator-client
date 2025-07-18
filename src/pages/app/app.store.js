export const INITIAL_STATE = Object.freeze({
  currentRoute: "/projects",
});

export const selectShowSidebar = (state, props, payload) => {
  const currentRoutePattern = selectCurrentRoutePattern(state, props, payload);
  const routesWithNavBar = [
    "/project",
    "/project/resources",
    "/project/resources/images",
    "/project/resources/characters",
    "/project/resources/character-sprites",
    "/project/resources/audio",
    "/project/resources/animations",
    "/project/resources/placements",
    "/project/resources/videos",
    "/project/resources/colors",
    "/project/resources/components",
    "/project/resources/screens",
    "/project/resources/choices",
    "/project/resources/dialogue",
    "/project/resources/variables",
    "/project/resources/presets",
    "/project/scenes",
    "/project/scene-editor",
    "/project/settings/general",
    "/project/settings/user",
    "/project/resources/fonts",
    "/project/resources/typography",
    "/project/resources/layouts",
    "/project/resources/layout-editor",
    "/project/resources/component-editor",
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
    "/project/resources/images",
    "/project/resources/characters",
    "/project/resources/character-sprites",
    "/project/resources/audio",
    "/project/resources/animations",
    "/project/resources/placements",
    "/project/resources/videos",
    "/project/resources/colors",
    "/project/resources/typography",
    "/project/resources/components",
    "/project/resources/screens",
    "/project/resources/choices",
    "/project/resources/dialogue",
    "/project/resources/variables",
    "/project/resources/presets",
    "/project/scenes",
    "/project/scene-editor",
    "/project/settings/general",
    "/project/settings/user",
    "/project/resources/fonts",
    "/project/resources/layouts",
    "/project/resources/layout-editor",
    "/project/resources/component-editor",
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
    matchPaths(currentRoute, pattern),
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
