const selectAuthenticateCopy = (i18n = {}) => i18n.authenticatePage ?? {};

const createRequestOtpForm = (copy = {}) => ({
  title: copy.loginTitle ?? "Login",
  fields: [
    {
      name: "email",
      type: "input-text",
      label: copy.emailLabel ?? "Email",
      placeholder: "name@example.com",
      required: true,
      validations: [
        {
          rule: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          message:
            copy.validEmailMessage ?? "Please enter a valid email address",
        },
      ],
    },
  ],
  actions: {
    buttons: [
      {
        id: "request-otp",
        variant: "pr",
        label: copy.requestOtpButton ?? "Request OTP",
        type: "submit",
        validate: true,
      },
    ],
  },
});

const createVerifyOtpForm = (copy = {}) => ({
  title: copy.loginTitle ?? "Login",
  fields: [
    {
      name: "otp",
      type: "input-text",
      label: copy.otpLabel ?? "OTP",
      placeholder: copy.otpPlaceholder ?? "Enter OTP",
      required: true,
      validations: [
        {
          rule: /^.+$/,
          message: copy.otpRequired ?? "OTP is required",
        },
      ],
    },
  ],
  actions: {
    buttons: [
      {
        id: "next",
        variant: "pr",
        label: copy.nextButton ?? "Next",
        type: "submit",
        validate: true,
      },
    ],
  },
});

const createRegisterForm = (copy = {}) => ({
  title: copy.registerTitle ?? "Register",
  fields: [
    {
      type: "read-only-text",
      content:
        copy.completeRegistrationMessage ??
        "Complete registration to continue.",
    },
    {
      name: "acceptTerms",
      type: "checkbox",
      content: copy.acceptTermsLabel ?? "I accept Terms & Conditions",
      required: true,
    },
    {
      name: "acceptPrivacy",
      type: "checkbox",
      content: copy.acceptPrivacyLabel ?? "I accept Privacy Policy",
      required: true,
    },
  ],
  actions: {
    buttons: [
      {
        id: "register",
        variant: "pr",
        label: copy.registerButton ?? "Register",
        type: "submit",
      },
    ],
  },
});

export const createInitialState = () => ({
  step: "request-otp",
  requestedEmail: "",
  registerCode: "",
});

export const setOtpRequested = ({ state }, { email } = {}) => {
  state.step = "verify-otp";
  state.requestedEmail = email || "";
  state.registerCode = "";
};

export const selectRequestedEmail = ({ state }) => {
  return state.requestedEmail || "";
};

export const setRegisterStep = ({ state }, { registerCode } = {}) => {
  state.step = "register";
  state.registerCode = registerCode || "";
};

export const selectRegisterCode = ({ state }) => {
  return state.registerCode || "";
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectAuthenticateCopy(i18n);
  const isRequestOtpStep = state.step === "request-otp";
  const isOtpStep = state.step === "verify-otp";
  const isRegisterStep = state.step === "register";

  return {
    step: state.step,
    requestedEmail: state.requestedEmail,
    isRequestOtpStep,
    isOtpStep,
    isRegisterStep,
    backButton: copy.backButton ?? "Back",
    requestOtpForm: createRequestOtpForm(copy),
    verifyOtpForm: createVerifyOtpForm(copy),
    registerForm: createRegisterForm(copy),
    requestOtpDefaultValues: { email: state.requestedEmail || "" },
    verifyOtpDefaultValues: { otp: "" },
    registerDefaultValues: { acceptTerms: false, acceptPrivacy: false },
  };
};
