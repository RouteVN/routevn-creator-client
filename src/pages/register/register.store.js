const selectRegisterCopy = (i18n = {}) => i18n.registerPage ?? {};

const createRegisterForm = (copy = {}) => ({
  title: copy.title ?? "Register",
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
    },
    {
      name: "acceptPrivacy",
      type: "checkbox",
      content: copy.acceptPrivacyLabel ?? "I accept Privacy Policy",
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
  email: "",
});

export const setEmail = ({ state }, { email } = {}) => {
  state.email = email || "";
};

export const selectEmail = ({ state }) => {
  return state.email || "";
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectRegisterCopy(i18n);

  return {
    ...state,
    backButton: copy.backButton ?? "Back",
    registerForm: createRegisterForm(copy),
    registerDefaultValues: {
      acceptTerms: false,
      acceptPrivacy: false,
    },
  };
};
