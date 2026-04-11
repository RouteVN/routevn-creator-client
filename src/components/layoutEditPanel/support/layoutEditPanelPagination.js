const SAVE_LOAD_PAGINATION_MODE_OPTIONS = [
  { label: "Continuous", value: "continuous" },
  { label: "Paginated", value: "paginated" },
];

export const getSaveLoadPaginationSummary = ({ values } = {}) => {
  const paginationMode = values?.paginationMode ?? "continuous";

  if (paginationMode !== "paginated") {
    return "Continuous";
  }

  const paginationSize = Number(values?.paginationSize);
  const resolvedPaginationSize =
    Number.isFinite(paginationSize) && paginationSize > 0 ? paginationSize : 0;

  return `Paginated: runtime.saveLoadPagination • ${resolvedPaginationSize} per page`;
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

export const createSaveLoadPaginationForm = () => {
  return {
    title: "Pagination",
    fields: [
      {
        name: "paginationMode",
        type: "select",
        label: "Pagination",
        required: true,
        clearable: false,
        options: SAVE_LOAD_PAGINATION_MODE_OPTIONS,
      },
      {
        $when: 'paginationMode == "paginated"',
        name: "paginationSize",
        type: "input-number",
        label: "Pagination Number",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };
};
