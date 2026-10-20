import { formatI18nCopy } from "../../../internal/ui/i18nCopy.js";

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

  const perPageLabel = formatI18nCopy(
    copy.perPageCountLabel ?? "{count} per page",
    { count: resolvedPaginationSize },
  );

  // The page shown comes from the Save/Load Pagination runtime value.
  return formatI18nCopy(copy.labelValue ?? "{label}: {value}", {
    label: copy.paginatedOption ?? "Paginated",
    value: `${copy.runtimeSaveLoadPaginationLabel ?? "Save/Load Pagination"} • ${perPageLabel}`,
  });
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
