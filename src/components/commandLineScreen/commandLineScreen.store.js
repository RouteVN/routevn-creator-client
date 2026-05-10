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
      label: "Transition Animation",
      description: "",
      required: true,
      clearable: false,
      placeholder: "Choose a transition animation",
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
  const selectedAnimationId =
    state.formValues?.transitionAnimationId ??
    props?.screen?.animations?.resourceId;

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
    defaultValues: state.formValues,
    context: {
      transitionAnimationOptions: getTransitionAnimationOptions(
        state.animations,
        selectedAnimationId,
      ),
    },
  };
};
