export const createInitialState = () => ({
  currentRoute: "/projects",
  isRepositoryLoading: false,
  repositoryLoadingPhase: "",
  repositoryLoadingCurrent: 0,
  repositoryLoadingTotal: 0,
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
    "/project/scenes",
    "/project/scene-editor",
    "/project/animation-editor",
    "/project/about",
    "/project/appearance",
    "/project/user",
    "/project/fonts",
    "/project/layouts",
    "/project/layout-editor",
    "/project/releases",
    "/project/releases/versions",
    "/project/releases/web-server",
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
  if (state.isRepositoryLoading) {
    state.repositoryLoadingPhase = "Loading project...";
    state.repositoryLoadingCurrent = 0;
    state.repositoryLoadingTotal = 0;
    return;
  }

  state.repositoryLoadingPhase = "";
  state.repositoryLoadingCurrent = 0;
  state.repositoryLoadingTotal = 0;
};

export const setRepositoryLoadingPhase = ({ state }, { phase } = {}) => {
  state.repositoryLoadingPhase = phase ?? "";
};

export const setRepositoryLoadingProgress = (
  { state },
  { current, total } = {},
) => {
  const nextCurrent = Number(current);
  const nextTotal = Number(total);
  const normalizedTotal = Number.isFinite(nextTotal)
    ? Math.max(0, Math.floor(nextTotal))
    : 0;
  const normalizedCurrent = Number.isFinite(nextCurrent)
    ? Math.max(0, Math.floor(nextCurrent))
    : 0;
  const currentTotal = Number(state.repositoryLoadingTotal) || 0;
  const currentProgress = Number(state.repositoryLoadingCurrent) || 0;
  const hasCompletedProgress =
    currentTotal > 0 && currentProgress >= currentTotal;

  if (
    normalizedTotal === 0 &&
    normalizedCurrent === 0 &&
    hasCompletedProgress
  ) {
    return;
  }

  state.repositoryLoadingTotal = normalizedTotal;
  state.repositoryLoadingCurrent =
    normalizedTotal > 0
      ? Math.min(normalizedTotal, normalizedCurrent)
      : normalizedCurrent;
};

const selectRepositoryLoadingProgressPercent = ({ state }) => {
  const total = Number(state.repositoryLoadingTotal) || 0;
  const current = Number(state.repositoryLoadingCurrent) || 0;
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
};

export const selectViewData = ({ state }) => {
  const showSidebar = selectShowSidebar({ state });
  const repositoryLoadingProgressPercent =
    selectRepositoryLoadingProgressPercent({
      state,
    });
  const hasRepositoryLoadingProgress =
    state.repositoryLoadingTotal > 0 && state.isRepositoryLoading;
  const repositoryLoadingBaseText = "Loading project...";

  return {
    ...state,
    currentRoutePattern: selectCurrentRoutePattern({ state }),
    showSidebar,
    contentWidth: showSidebar ? `calc(100vw - ${SIDEBAR_WIDTH_PX}px)` : "100vw",
    repositoryLoadingProgressPercent,
    repositoryLoadingProgressWidth: `${repositoryLoadingProgressPercent}%`,
    hasRepositoryLoadingProgress,
    repositoryLoadingStatusText: hasRepositoryLoadingProgress
      ? `${repositoryLoadingBaseText} ${repositoryLoadingProgressPercent}%`
      : repositoryLoadingBaseText,
  };
};
