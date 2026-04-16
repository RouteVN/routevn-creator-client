import { persistAuthenticatedSession } from "../../deps/services/shared/authSession.js";

export const handleBackButtonClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};

const getErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "VALIDATION_ERROR") {
    return "Please enter a valid email.";
  }
  return error?.message || "Failed to request OTP. Please try again.";
};

const getAuthenticateErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "VALIDATION_ERROR") {
    return "Please enter a valid OTP.";
  }
  if (code === "OTP_NOT_FOUND") {
    return "OTP not found. Please request a new OTP.";
  }
  if (code === "OTP_INVALID") {
    return "Invalid OTP. Please try again.";
  }
  if (code === "OTP_EXPIRED") {
    return "OTP expired. Please request a new OTP.";
  }
  return error?.message || "Failed to verify OTP. Please try again.";
};

const getRegisterErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "VALIDATION_ERROR") {
    return "Invalid registration request.";
  }
  if (code === "REGISTER_CODE_NOT_FOUND") {
    return "Registration session expired. Please login again.";
  }
  if (code === "REGISTER_CODE_INVALID") {
    return "Registration session is invalid. Please login again.";
  }
  if (code === "REGISTER_CODE_EXPIRED") {
    return "Registration session expired. Please login again.";
  }
  return error?.message || "Failed to register. Please try again.";
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
  const { appService, apiService, store, render } = deps;
  const detail = payload?._event?.detail || {};

  if (detail.actionId === "request-otp") {
    const email = detail?.values?.email?.trim?.() || "";
    if (!email) {
      appService.showAlert({ message: "Email is required." });
      return;
    }

    try {
      await apiService.requestAuthOtp({ email });
      store.setOtpRequested({ email });
      render();
    } catch (error) {
      appService.showAlert({ message: getErrorMessage(error) });
    }
    return;
  }

  if (detail.actionId === "next") {
    const otp = detail?.values?.otp?.trim?.() || "";
    if (!otp) {
      appService.showAlert({ message: "OTP is required." });
      return;
    }

    const email = store.selectRequestedEmail();
    if (!email) {
      appService.showAlert({ message: "Email is required." });
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
            message: "Registration failed. Please request OTP again.",
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
      appService.showAlert({ message: getAuthenticateErrorMessage(error) });
    }
    return;
  }

  if (detail.actionId === "register") {
    const acceptTerms = Boolean(detail?.values?.acceptTerms);
    const acceptPrivacy = Boolean(detail?.values?.acceptPrivacy);

    if (!acceptTerms || !acceptPrivacy) {
      appService.showAlert({
        message: "Please accept Terms and Privacy Policy.",
      });
      return;
    }

    const email = store.selectRequestedEmail();
    const registerCode = store.selectRegisterCode();
    if (!email || !registerCode) {
      appService.showAlert({
        message: "Registration session expired. Please login again.",
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
        appService.showAlert({ message: getRegisterErrorMessage(error) });
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
            message: "Registration session expired. Please login again.",
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
          message: getRegisterErrorMessage(reissueError),
        });
      }
      return;
    }
  }
};
