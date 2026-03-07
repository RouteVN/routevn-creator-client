export const mapApiUserToAuthUser = (user) => {
  const email = typeof user?.email === "string" ? user.email : "";
  const name =
    typeof user?.creatorDisplayName === "string" ? user.creatorDisplayName : "";
  const displayColor =
    typeof user?.creatorDisplayColor === "string" && user.creatorDisplayColor
      ? user.creatorDisplayColor
      : "#E2E8F0";
  const avatar =
    typeof user?.creatorDisplayAvatar === "string"
      ? user.creatorDisplayAvatar
      : "";
  const id = typeof user?.id === "string" ? user.id : "";

  return {
    id,
    email,
    name,
    displayColor,
    avatar,
    registered: true,
  };
};

export const getSessionAuthToken = (appService) => {
  const authSession = appService.getUserConfig("auth.session");
  return authSession?.authToken?.trim?.() ?? "";
};

export const getStoredAuthUser = (appService) => {
  const authUser = appService.getUserConfig("auth.user");
  return authUser && typeof authUser === "object" ? authUser : undefined;
};

export const getPersistedAuthenticatedUser = (appService) => {
  return getSessionAuthToken(appService)
    ? getStoredAuthUser(appService)
    : undefined;
};

export const getAuthenticatedSession = (appService) => {
  const authToken = getSessionAuthToken(appService);
  if (!authToken) {
    return;
  }

  return {
    authToken,
    authUser: getStoredAuthUser(appService),
  };
};

export const persistAuthenticatedSession = (appService, authResult) => {
  const authToken =
    typeof authResult?.authToken === "string" ? authResult.authToken : "";
  const refreshToken =
    typeof authResult?.refreshToken === "string" ? authResult.refreshToken : "";

  appService.setUserConfig("auth.session", {
    authToken,
    refreshToken,
  });
  appService.setUserConfig("auth.user", mapApiUserToAuthUser(authResult?.user));
};

export const clearAuthenticatedSession = (appService) => {
  appService.setUserConfig("auth.session", null);
  appService.setUserConfig("auth.user", null);
};
