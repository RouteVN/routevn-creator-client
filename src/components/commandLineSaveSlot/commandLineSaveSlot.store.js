import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

export const createInitialState = () => ({
  defaultValues: {
    slotId: undefined,
  },
  form: {
    fields: [
      {
        name: "slotId",
        type: "input-text",
        label: "Slot Id",
        description:
          "Leave empty for auto, or use a fixed value like 1, ${slot.slotId}, or _event.slotId",
        required: false,
        placeholder: "Auto",
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const setDefaultValues = ({ state }, payload = {}) => {
  state.defaultValues = {
    ...state.defaultValues,
    ...payload,
  };
};

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Save Slot",
    },
  ];

  return {
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: localizeCommandLineForm(state.form, copy),
    defaultValues: state.defaultValues,
  };
};
