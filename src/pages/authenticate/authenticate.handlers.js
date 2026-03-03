export const handleBackButtonClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};

export const handleFormAction = (deps, payload) => {
  const { appService, store, render } = deps;
  const detail = payload?._event?.detail || {};

  if (detail.actionId === "request-otp") {
    const email = detail?.values?.email?.trim?.() || "";
    if (!email) {
      appService.showToast("Email is required.");
      return;
    }

    store.setOtpRequested({ email });
    render();
    return;
  }

  if (detail.actionId === "next") {
    const otp = detail?.values?.otp?.trim?.() || "";
    if (!otp) {
      appService.showToast("OTP is required.");
      return;
    }

    const email = store.selectRequestedEmail();
    const existingUser = appService.getUserConfig("auth.user");
    const isReturningUser =
      existingUser?.registered === true && existingUser?.email === email;

    if (isReturningUser) {
      appService.setUserConfig("auth.user", {
        email,
        registered: true,
      });
      appService.navigate("/projects");
      return;
    }

    store.setRegisterStep();
    render();
    return;
  }

  if (detail.actionId === "register") {
    const acceptTerms = Boolean(detail?.values?.acceptTerms);
    const acceptPrivacy = Boolean(detail?.values?.acceptPrivacy);

    if (!acceptTerms || !acceptPrivacy) {
      appService.showToast("Please accept Terms and Privacy Policy.");
      return;
    }

    const email = store.selectRequestedEmail();

    appService.setUserConfig("auth.user", {
      email,
      registered: true,
    });
    appService.navigate("/projects");
  }
};
