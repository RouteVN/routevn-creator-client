import { getTransitionAnimationOptions } from "../../internal/animationOptions.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const form = {
  fields: [
    {
      name: "transitionAnimationId",
      type: "select",
      label: "Animation",
      description: "",
      required: true,
      clearable: true,
      placeholder: "Animation",
      options: "${transitionAnimationOptions}",
    },
  ],
  actions: {
    layout: "",
    buttons: [],
  },
};

export const createInitialState = () => ({
  animations: createEmptyCollection(),
  formValues: {},
});

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations ?? createEmptyCollection();
};

export const setFormValues = ({ state }, { values } = {}) => {
  state.formValues = values ?? {};
};

export const selectViewData = ({ state, props }) => {
  const propsAnimationId = props?.screen?.animations?.resourceId;
  const hasFormAnimationId = Object.prototype.hasOwnProperty.call(
    state.formValues ?? {},
    "transitionAnimationId",
  );
  const selectedAnimationId = hasFormAnimationId
    ? state.formValues.transitionAnimationId
    : propsAnimationId;

  return {
    breadcrumb: [
      {
        id: "actions",
        label: "Actions",
        click: true,
      },
      {
        label: "Screen",
      },
    ],
    form,
    formKey: propsAnimationId ?? "new-screen",
    defaultValues: {
      ...state.formValues,
      transitionAnimationId: selectedAnimationId,
    },
    context: {
      transitionAnimationOptions: getTransitionAnimationOptions(
        state.animations,
        selectedAnimationId,
      ).map((option) => ({
        ...option,
        suffixText: "Transition",
      })),
    },
  };
};
