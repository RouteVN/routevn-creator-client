export const createInitialState = () => ({
  currentRoute: "/projects",
  isRepositoryLoading: false,
});

const SIDEBAR_WIDTH_PX = 64;

const routesWithoutNavbar = ["/projects", "/authenticate"];

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
    "/authenticate",
    "/project/images",
    "/project/spritesheets",
    "/project/characters",
    "/project/character-sprites",
    "/project/sounds",
    "/project/transforms",
    "/project/animations",
    "/project/particles",
    "/project/videos",
    "/project/colors",
    "/project/text-styles",
    "/project/controls",
    "/project/variables",
    "/project/system-variables",
    "/project/scenes",
    "/project/scene-editor",
    "/project/animation-editor",
    "/project/about",
    "/project/user",
    "/project/fonts",
    "/project/layouts",
    "/project/layout-editor",
    "/project/releases",
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

export const setRepositoryLoading = ({ state }, { isLoading } = {}) => {
  state.isRepositoryLoading = !!isLoading;
};

export const selectViewData = ({ state }) => {
  const showSidebar = selectShowSidebar({ state });
  return {
    ...state,
    currentRoutePattern: selectCurrentRoutePattern({ state }),
    showSidebar,
    contentWidth: showSidebar ? `calc(100vw - ${SIDEBAR_WIDTH_PX}px)` : "100vw",
  };
};
