export const createInitialState = () => ({
  currentRoute: "/projects",
});

const routesWithoutNavbar = ["/projects"];

export const selectShowSidebar = ({ state }) => {
  const currentRoutePattern = selectCurrentRoutePattern({ state });
  const normalizedPattern = currentRoutePattern?.replace(/\/$/, "");
  const normalizedRoutesWithoutNavbar = routesWithoutNavbar.map((route) =>
    route.replace(/\/$/, ""),
  );
  return !normalizedRoutesWithoutNavbar.includes(normalizedPattern);
};

export const selectCurrentRoutePattern = ({ state }) => {
  const routePatterms = [
    "/project",
    "/projects",
    "/project/resources",
    "/project/resources/images",
    "/project/resources/characters",
    "/project/resources/character-sprites",
    "/project/resources/sounds",
    "/project/resources/tweens",
    "/project/resources/transforms",
    "/project/resources/videos",
    "/project/resources/colors",
    "/project/resources/typography",
    "/project/resources/choices",
    "/project/resources/variables",
    "/project/scenes",
    "/project/scene-editor",
    "/project/settings/about",
    "/project/settings/user",
    "/project/resources/fonts",
    "/project/resources/layouts",
    "/project/resources/layout-editor",
    "/project/releases/versions",
  ];
  const currentRoute = state.currentRoute;
  const matchPaths = (path, pattern) => {
    // Remove trailing slash if present (unless it's just "/")
    const normalizedPath =
      path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    const normalizedPattern =
      pattern.length > 1 && pattern.endsWith("/")
        ? pattern.slice(0, -1)
        : pattern;

    const pathParts = normalizedPath.split("/");
    const patternParts = normalizedPattern.split("/");

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

export const setCurrentRoute = ({ state }, { route } = {}) => {
  state.currentRoute = route;
};

export const selectViewData = ({ state }) => {
  return {
    ...state,
    currentRoutePattern: selectCurrentRoutePattern({ state }),
    showSidebar: selectShowSidebar({ state }),
  };
};
