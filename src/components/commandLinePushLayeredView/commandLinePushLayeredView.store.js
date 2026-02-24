import { toFlatItems } from "#tree-state";

const form = {
  fields: [
    {
      name: "resourceId",
      type: "select",
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

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setInitiated = ({ state }, _payload = {}) => {
  state.initiated = true;
};

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = layouts;
};

export const setFormValues = ({ state }, { payload, ...rest } = {}) => {
  state.formValues = payload ?? rest;
};

export const selectViewData = ({ state }) => {
  const layouts = toFlatItems(state.layouts);
  const allLayouts = layouts.filter((item) => item.type === "layout");

  const breadcrumb = [
    { id: "actions", label: "Actions", click: true },
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
