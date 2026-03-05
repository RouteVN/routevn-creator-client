export const handleAfterMount = (deps) => {
  const { appService, store, render } = deps;
  const payload = appService.getPayload() || {};
  store.setEmail({ email: payload.email || "" });
  render();
};

export const handleBackButtonClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/authenticate");
};

export const handleFormAction = (deps, payload) => {
  const { appService, store } = deps;
  const detail = payload?._event?.detail || {};

  if (detail.actionId !== "register") {
    return;
  }

  const acceptTerms = Boolean(detail?.values?.acceptTerms);
  const acceptPrivacy = Boolean(detail?.values?.acceptPrivacy);

  if (!acceptTerms || !acceptPrivacy) {
    appService.showToast("Please accept Terms and Privacy Policy.");
    return;
  }

  const existingUser = appService.getUserConfig("auth.user") || {};
  const email =
    store.selectEmail() ||
    existingUser?.email ||
    appService.getPayload?.()?.email ||
    "";

  if (!email) {
    appService.showToast("Email is required.");
    return;
  }

  appService.setUserConfig("auth.user", {
    ...existingUser,
    email,
    registered: true,
  });
  appService.navigate("/projects");
};
