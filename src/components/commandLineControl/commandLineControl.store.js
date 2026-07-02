import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

export const createInitialState = () => ({
  controls: [],
  selectedControlId: "",

  defaultValues: {
    resourceId: "",
  },

  form: {
    fields: [
      {
        name: "resourceId",
        type: "select",
        label: "Control",
        description: "",
        required: false,
        placeholder: "Choose a control...",
        options: [],
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const setSelectedResourceId = ({ state }, { resourceId } = {}) => {
  state.selectedControlId = resourceId;
  state.defaultValues.resourceId = resourceId;
};

export const selectSelectedControlId = ({ state }) => state.selectedControlId;

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const controls = props.controls || [];

  const controlOptions = controls.map((control) => ({
    value: control.id,
    label: control.name,
  }));

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Control",
    },
  ];

  // Update form options with current data
  const form = {
    ...state.form,
    fields: state.form.fields.map((field) => {
      if (field.name === "resourceId") {
        return {
          ...field,
          options: controlOptions,
          value: state.selectedControlId,
        };
      }
      return field;
    }),
  };

  // Update default values with current selections
  const defaultValues = {
    resourceId: state.selectedControlId,
  };

  return {
    controls: controlOptions,
    selectedControlId: state.selectedControlId,
    submitDisabled: false,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: localizeCommandLineForm(form, copy),
    defaultValues,
  };
};
