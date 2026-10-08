import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const form = {
  fields: [
    {
      name: "resourceId",
      type: "select",
      label: "Layout",
      description: "Select which overlay layout to display",
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

export const setFormValues = ({ state }, payload = {}) => {
  state.formValues = payload;
};

export const selectFormValues = ({ state }) => state.formValues;

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);

  const breadcrumb = [
    { id: "actions", label: "Actions", click: true },
    { label: "Push Overlay" },
  ];

  // The layouts outside folders first, then a section for each folder that
  // has layouts, in the order of the layouts tree.
  const toLayoutOption = (layout) => ({
    value: layout.id,
    label: layout.name,
  });
  const layoutOptions = toFlatItems(state.layouts)
    .filter((item) => item.type === "layout" && !item.parentId)
    .map(toLayoutOption);
  for (const group of toFlatGroups(state.layouts)) {
    const children = group.children.filter((item) => item.type === "layout");
    if (children.length > 0) {
      layoutOptions.push(
        { type: "section", label: group.fullLabel },
        ...children.map(toLayoutOption),
      );
    }
  }

  const context = { layoutOptions };

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: localizeCommandLineForm(form, copy),
    context,
    defaultValues: state.formValues,
  };
};
