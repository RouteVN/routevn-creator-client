import { visitLayoutItemsWithFragments } from "./layoutEditorPreviewFragments.js";

const isInputFieldItem = (item) => {
  return (
    item?.type === "input" &&
    typeof item.field === "string" &&
    item.field.length > 0
  );
};

export const getLayoutPreviewInputFieldItems = ({
  currentLayoutId,
  currentLayoutData,
  currentLayoutType,
  layoutsData,
} = {}) => {
  const inputFields = [];
  const addedFields = new Set();

  visitLayoutItemsWithFragments(
    {
      currentLayoutId,
      currentLayoutData,
      currentLayoutType,
      layoutsData,
      layoutId: currentLayoutId,
    },
    ({ item }) => {
      if (!isInputFieldItem(item) || addedFields.has(item.field)) {
        return false;
      }

      addedFields.add(item.field);
      inputFields.push({
        field: item.field,
        label: item.name ?? item.field,
        defaultValue: item.value ?? "",
        placeholder: item.placeholder,
      });

      return false;
    },
  );

  return inputFields;
};

export const createPreviewInputFieldsForm = (inputFieldItems = []) => ({
  title: "Preview",
  description: "Edit input field values for the canvas",
  fields: inputFieldItems.map((item) => ({
    name: item.field,
    type: "input-text",
    label: item.label,
    placeholder: item.placeholder,
  })),
});

export const createPreviewInputFieldsDefaultValues = (
  inputFieldItems = [],
  previewInputFieldValues = {},
) => {
  const defaultValues = {};

  for (const item of inputFieldItems) {
    defaultValues[item.field] = Object.hasOwn(
      previewInputFieldValues,
      item.field,
    )
      ? previewInputFieldValues[item.field]
      : item.defaultValue;
  }

  return defaultValues;
};

export const createPreviewInputFieldValues = (
  inputFieldItems = [],
  previewInputFieldValues = {},
) => {
  return createPreviewInputFieldsDefaultValues(
    inputFieldItems,
    previewInputFieldValues,
  );
};

export const createPreviewInputFieldsViewData = ({
  currentLayoutId,
  currentLayoutData,
  currentLayoutType,
  layoutsData,
  previewInputFieldValues,
} = {}) => {
  const inputFieldItems = getLayoutPreviewInputFieldItems({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
  });
  const inputFieldsDefaultValues = createPreviewInputFieldsDefaultValues(
    inputFieldItems,
    previewInputFieldValues,
  );
  const inputFieldsFormKey =
    inputFieldItems.length > 0
      ? inputFieldItems.map((item) => item.field).join("|")
      : "empty";

  return {
    inputFieldItems,
    inputFieldsForm: createPreviewInputFieldsForm(inputFieldItems),
    inputFieldsDefaultValues,
    inputFieldsFormKey,
    hasInputFields: inputFieldItems.length > 0,
  };
};
