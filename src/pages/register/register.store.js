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
    },
    {
      name: "acceptPrivacy",
      type: "checkbox",
      content: "I accept Privacy Policy",
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
  email: "",
});

export const setEmail = ({ state }, { email } = {}) => {
  state.email = email || "";
};

export const selectEmail = ({ state }) => {
  return state.email || "";
};

export const selectViewData = ({ state }) => {
  return {
    ...state,
    registerForm: createRegisterForm(),
    registerDefaultValues: {
      acceptTerms: false,
      acceptPrivacy: false,
    },
  };
};
