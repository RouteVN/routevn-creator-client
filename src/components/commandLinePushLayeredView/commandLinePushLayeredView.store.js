import { toFlatItems } from "insieme";

const form = {
  fields: [
    {
      name: "resourceId",
      inputType: "select",
      label: "Layout",
      description: "Select which layout to display",
      required: true,
      placeholder: "Choose a layout",
      options: "${layoutOptions}",
    },
  ],
  actions: {
    layout: "",
    buttons: [],
  },
};

export const createInitialState = () => ({
  mode: "current",
  initiated: false,
  layouts: { items: {}, tree: [] },
  formValues: {},
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setInitiated = (state) => {
  state.initiated = true;
};

export const setLayouts = (state, payload) => {
  state.layouts = payload.layouts;
};

export const setFormValues = (state, payload) => {
  state.formValues = payload;
};

export const selectViewData = ({ state }) => {
  const layouts = toFlatItems(state.layouts);
  const allLayouts = layouts.filter((item) => item.type === "layout");

  const breadcrumb = [
    { id: "actions", label: "Actions" },
    { label: "Push Layered View" },
  ];

  const layoutOptions = allLayouts.map((layout) => ({
    value: layout.id,
    label: layout.name,
  }));

  const context = { layoutOptions };

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb,
    form,
    context,
    defaultValues: state.formValues,
  };
};
