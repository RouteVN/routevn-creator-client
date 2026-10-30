import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineText,
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

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Load Slot",
    },
  ];

  const form = localizeCommandLineForm(state.form, copy);

  // Auto takes the slot from the save/load slot item that was clicked, so
  // anywhere else the action needs its own slot. Blank text counts as Auto.
  if (props.allowAutoSlot !== true) {
    const message = localizeCommandLineText(
      "Auto only works inside a Save/Load Slot container. Enter a slot id.",
      copy,
    );
    form.fields[0].required = { message };
    form.fields[0].rules = [{ rule: "pattern", value: "\\S", message }];
  }

  return {
    submitButtonLabel: localizeCommandLineText("Submit", copy),
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form,
    defaultValues: state.defaultValues,
  };
};
