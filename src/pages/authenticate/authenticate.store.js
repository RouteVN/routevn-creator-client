const createRequestOtpForm = () => ({
  title: "Login",
  fields: [
    {
      name: "email",
      type: "input-text",
      label: "Email",
      placeholder: "name@example.com",
      required: true,
      validations: [
        {
          rule: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          message: "Please enter a valid email address",
        },
      ],
    },
  ],
  actions: {
    buttons: [
      {
        id: "request-otp",
        variant: "pr",
        label: "Request OTP",
        type: "submit",
        validate: true,
      },
    ],
  },
});

const createVerifyOtpForm = () => ({
  title: "Login",
  fields: [
    {
      name: "otp",
      type: "input-text",
      label: "OTP",
      placeholder: "Enter OTP",
      required: true,
      validations: [
        {
          rule: /^.+$/,
          message: "OTP is required",
        },
      ],
    },
  ],
  actions: {
    buttons: [
      {
        id: "next",
        variant: "pr",
        label: "Next",
        type: "submit",
        validate: true,
      },
    ],
  },
});

const createRegisterForm = () => ({
  title: "Register",
  fields: [
    {
      type: "read-only-text",
      content: "Complete registration to continue.",
    },
    {
      name: "acceptTerms",
      type: "checkbox",
      content: "I accept Terms & Conditions",
      required: true,
    },
    {
      name: "acceptPrivacy",
      type: "checkbox",
      content: "I accept Privacy Policy",
      required: true,
    },
  ],
  actions: {
    buttons: [
      {
        id: "register",
        variant: "pr",
        label: "Register",
        type: "submit",
      },
    ],
  },
});

export const createInitialState = () => ({
  step: "request-otp",
  requestedEmail: "",
});

export const setOtpRequested = ({ state }, { email } = {}) => {
  state.step = "verify-otp";
  state.requestedEmail = email || "";
};

export const selectRequestedEmail = ({ state }) => {
  return state.requestedEmail || "";
};

export const setRegisterStep = ({ state }, _payload = {}) => {
  state.step = "register";
};

export const selectViewData = ({ state }) => {
  const isRequestOtpStep = state.step === "request-otp";
  const isOtpStep = state.step === "verify-otp";
  const isRegisterStep = state.step === "register";

  return {
    step: state.step,
    requestedEmail: state.requestedEmail,
    isRequestOtpStep,
    isOtpStep,
    isRegisterStep,
    requestOtpForm: createRequestOtpForm(),
    verifyOtpForm: createVerifyOtpForm(),
    registerForm: createRegisterForm(),
    requestOtpDefaultValues: { email: state.requestedEmail || "" },
    verifyOtpDefaultValues: { otp: "" },
    registerDefaultValues: { acceptTerms: false, acceptPrivacy: false },
  };
};
