const createSaveLoadPaginationModeOptions = (copy = {}) => [
  { label: copy.continuousOption ?? "Continuous", value: "continuous" },
  { label: copy.paginatedOption ?? "Paginated", value: "paginated" },
];

export const getSaveLoadPaginationSummary = ({ values, copy = {} } = {}) => {
  const paginationMode = values?.paginationMode ?? "continuous";

  if (paginationMode !== "paginated") {
    return copy.continuousOption ?? "Continuous";
  }

  const paginationSize = Number(values?.paginationSize);
  const resolvedPaginationSize =
    Number.isFinite(paginationSize) && paginationSize > 0 ? paginationSize : 0;

  return `${copy.paginatedOption ?? "Paginated"}: runtime.saveLoadPagination • ${resolvedPaginationSize} ${copy.perPageLabel ?? "per page"}`;
};

export const createSaveLoadPaginationDialogDefaults = (values = {}) => {
  const paginationSize = Number(values?.paginationSize);

  return {
    paginationMode: values?.paginationMode ?? "continuous",
    paginationSize:
      Number.isFinite(paginationSize) && paginationSize > 0
        ? paginationSize
        : 3,
  };
};

export const createSaveLoadPaginationForm = ({ copy = {} } = {}) => {
  return {
    title: copy.paginationTitle ?? "Pagination",
    fields: [
      {
        name: "paginationMode",
        type: "select",
        label: copy.paginationLabel ?? "Pagination",
        required: true,
        clearable: false,
        options: createSaveLoadPaginationModeOptions(copy),
      },
      {
        $when: 'paginationMode == "paginated"',
        name: "paginationSize",
        type: "input-number",
        label: copy.paginationNumberLabel ?? "Pagination Number",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton ?? "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: copy.saveButton ?? "Save",
        },
      ],
    },
  };
};
