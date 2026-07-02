import { persistAuthenticatedSession } from "../../deps/services/shared/authSession.js";

const selectAuthenticateCopy = (i18n = {}) => i18n.authenticatePage ?? {};

export const handleBackButtonClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};

const getErrorMessage = (error, copy = {}) => {
  const code = error?.code || "";
  if (code === "VALIDATION_ERROR") {
    return copy.validEmailAlert ?? "Please enter a valid email.";
  }
  return (
    error?.message || copy.failedRequestOtp || "Failed to request OTP. Please try again."
  );
};

const getAuthenticateErrorMessage = (error, copy = {}) => {
  const code = error?.code || "";
  if (code === "VALIDATION_ERROR") {
    return copy.validOtpAlert ?? "Please enter a valid OTP.";
  }
  if (code === "OTP_NOT_FOUND") {
    return copy.otpNotFound ?? "OTP not found. Please request a new OTP.";
  }
  if (code === "OTP_INVALID") {
    return copy.otpInvalid ?? "Invalid OTP. Please try again.";
  }
  if (code === "OTP_EXPIRED") {
    return copy.otpExpired ?? "OTP expired. Please request a new OTP.";
  }
  return (
    error?.message || copy.failedVerifyOtp || "Failed to verify OTP. Please try again."
  );
};

const getRegisterErrorMessage = (error, copy = {}) => {
  const code = error?.code || "";
  if (code === "VALIDATION_ERROR") {
    return copy.invalidRegistrationRequest ?? "Invalid registration request.";
  }
  if (code === "REGISTER_CODE_NOT_FOUND") {
    return (
      copy.registrationSessionExpired ??
      "Registration session expired. Please login again."
    );
  }
  if (code === "REGISTER_CODE_INVALID") {
    return (
      copy.registrationSessionInvalid ??
      "Registration session is invalid. Please login again."
    );
  }
  if (code === "REGISTER_CODE_EXPIRED") {
    return (
      copy.registrationSessionExpired ??
      "Registration session expired. Please login again."
    );
  }
  return error?.message || copy.failedRegister || "Failed to register. Please try again.";
};

const shouldReissueRegisterCode = (error) => {
  const code = error?.code || "";
  if (code === "REGISTER_CODE_NOT_FOUND") return true;
  if (code === "REGISTER_CODE_INVALID") return true;
  if (code === "REGISTER_CODE_EXPIRED") return true;
  return false;
};

const extractRegisterCode = (result) => {
  const registerCodeCandidate =
    typeof result?.registerCode === "string" ? result.registerCode.trim() : "";
  if (registerCodeCandidate) {
    return registerCodeCandidate;
  }

  const tokenCandidate =
    typeof result?.token === "string" ? result.token.trim() : "";
  if (tokenCandidate) {
    return tokenCandidate;
  }

  return "";
};

export const handleFormAction = async (deps, payload) => {
  const { appService, apiService, store, render, i18n } = deps;
  const copy = selectAuthenticateCopy(i18n);
  const detail = payload?._event?.detail || {};

  if (detail.actionId === "request-otp") {
    const email = detail?.values?.email?.trim?.() || "";
    if (!email) {
      appService.showAlert({
        message: copy.emailRequired ?? "Email is required.",
      });
      return;
    }

    try {
      await apiService.requestAuthOtp({ email });
      store.setOtpRequested({ email });
      render();
    } catch (error) {
      appService.showAlert({ message: getErrorMessage(error, copy) });
    }
    return;
  }

  if (detail.actionId === "next") {
    const otp = detail?.values?.otp?.trim?.() || "";
    if (!otp) {
      appService.showAlert({ message: copy.otpRequired ?? "OTP is required." });
      return;
    }

    const email = store.selectRequestedEmail();
    if (!email) {
      appService.showAlert({
        message: copy.emailRequired ?? "Email is required.",
      });
      return;
    }

    try {
      const authResult = await apiService.authenticate({ email, otp });
      const isNewUser = authResult?.isNewUser === true;

      if (isNewUser) {
        const registerCode =
          typeof authResult?.registerCode === "string"
            ? authResult.registerCode
            : "";
        if (!registerCode) {
          appService.showAlert({
            message:
              copy.registrationFailedRequestOtpAgain ??
              "Registration failed. Please request OTP again.",
          });
          return;
        }
        store.setRegisterStep({ registerCode });
        render();
        return;
      }

      persistAuthenticatedSession(appService, authResult);
      appService.navigate("/projects");
      return;
    } catch (error) {
      appService.showAlert({
        message: getAuthenticateErrorMessage(error, copy),
      });
    }
    return;
  }

  if (detail.actionId === "register") {
    const acceptTerms = Boolean(detail?.values?.acceptTerms);
    const acceptPrivacy = Boolean(detail?.values?.acceptPrivacy);

    if (!acceptTerms || !acceptPrivacy) {
      appService.showAlert({
        message:
          copy.acceptTermsPrivacyRequired ??
          "Please accept Terms and Privacy Policy.",
      });
      return;
    }

    const email = store.selectRequestedEmail();
    const registerCode = store.selectRegisterCode();
    if (!email || !registerCode) {
      appService.showAlert({
        message:
          copy.registrationSessionExpired ??
          "Registration session expired. Please login again.",
      });
      return;
    }

    try {
      const registerResult = await apiService.register({
        email,
        registerCode,
      });
      persistAuthenticatedSession(appService, registerResult);
      appService.navigate("/projects");
    } catch (error) {
      if (!shouldReissueRegisterCode(error)) {
        appService.showAlert({
          message: getRegisterErrorMessage(error, copy),
        });
        return;
      }

      try {
        const reissueResult = await apiService.reissueRegisterToken({
          email,
          registerCode,
        });
        const nextRegisterCode = extractRegisterCode(reissueResult);
        if (!nextRegisterCode) {
          appService.showAlert({
            message:
              copy.registrationSessionExpired ??
              "Registration session expired. Please login again.",
          });
          return;
        }

        store.setRegisterStep({ registerCode: nextRegisterCode });
        const registerResult = await apiService.register({
          email,
          registerCode: nextRegisterCode,
        });
        persistAuthenticatedSession(appService, registerResult);
        appService.navigate("/projects");
      } catch (reissueError) {
        appService.showAlert({
          message: getRegisterErrorMessage(reissueError, copy),
        });
      }
      return;
    }
  }
};
