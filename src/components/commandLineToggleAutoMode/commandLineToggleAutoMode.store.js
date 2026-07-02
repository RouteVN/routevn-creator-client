import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

export const createInitialState = () => ({
  defaultValues: {},

  form: {
    fields: [
      {
        name: "placeholder",
        type: "read-only-text",
        label: "Toggle Auto Mode Action",
        description: "This action will toggle auto-advance mode on/off",
        required: false,
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Toggle Auto Mode",
    },
  ];

  return {
    submitDisabled: false,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: localizeCommandLineForm(state.form, copy),
    defaultValues: state.defaultValues,
  };
};
