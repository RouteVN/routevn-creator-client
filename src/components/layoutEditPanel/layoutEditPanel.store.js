import { parseAndRender } from "jempl";
import { toFlatGroups, toFlatItems } from "insieme";

const config = {
  sections: [
    {
      label: "Position",
      items: [
        {
          type: "group",
          fields: [
            {
              type: "clickable-value",
              svg: "x",
              name: "x",
              value: "${values.x}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
            {
              type: "clickable-value",
              svg: "y",
              name: "y",
              value: "${values.y}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    {
      label: "Layout",
      items: [
        {
          type: "group",
          fields: [
            {
              type: "clickable-value",
              svg: "w",
              name: "width",
              value: "${values.width}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
            {
              $when:
                'itemType != "text" || itemType != "text-ref-character-name" || itemType != "text-revealing-ref-dialogue-content" || itemType != "text-ref-choice-item-content"',
              type: "clickable-value",
              svg: "h",
              name: "height",
              value: "${values.height}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          $when:
            "itemType == 'container' || itemType == 'container-ref-choice-item' || itemType == 'text' | itemType == 'text-ref-choice-item-content'",
          type: "select",
          label: "Anchor",
          name: "anchor",
          value: "${values.anchor}",
          options: [
            { label: "Top Left", value: { x: 0, y: 0 } },
            { label: "Top Center", value: { x: 0.5, y: 0 } },
            { label: "Top Right", value: { x: 1, y: 0 } },
            { label: "Center Left", value: { x: 0, y: 0.5 } },
            { label: "Center", value: { x: 0.5, y: 0.5 } },
            { label: "Center Right", value: { x: 1, y: 0.5 } },
            { label: "Bottom Left", value: { x: 0, y: 1 } },
            { label: "Bottom Center", value: { x: 0.5, y: 1 } },
            { label: "Bottom Right", value: { x: 1, y: 1 } },
          ],
        },
      ],
    },
    {
      $when:
        'itemType == "container" || itemType == "container-ref-choice-item"',
      label: "Direction",
      items: [
        {
          type: "select",
          label: "Direction",
          name: "direction",
          value: "${values.direction}",
          options: [
            { label: "Absolute", value: undefined },
            { label: "Horizontal", value: "horizontal" },
            { label: "Vertical", value: "vertical" },
          ],
        },
        {
          $when:
            '(itemType == "container" || itemType == "container-ref-choice-item") && (values.direction == "vertical" || values.direction == "horizontal") ',
          type: "group",
          fields: [
            {
              type: "clickable-value",
              label: "Gap",
              name: "gap",
              value: "${values.gap}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    {
      $when: 'itemType == "sprite"',
      id: "images",
      label: "Image",
      "$if !values.imageId || !values.hoverImageId || !values.clickImageId": {
        labelAction: "plus",
      },
      items: [
        {
          type: "list-bar",
          items: [
            {
              $when: "values.imageId",
              name: "imageId",
              label: "Default",
              imageId: "${values.imageId}",
            },
            {
              $when: "values.hoverImageId",
              name: "hoverImageId",
              label: "Hover",
              imageId: "${values.hoverImageId}",
            },
            {
              name: "clickImageId",
              $when: "values.clickImageId",
              label: "Click",
              imageId: "${values.clickImageId}",
            },
          ],
        },
      ],
    },
    {
      $when: 'itemType == "text"',
      label: "Text",
      items: [
        {
          type: "group",
          fields: [
            {
              type: "clickable-value",
              name: "text",
              value: "${values.text}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-text",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    {
      $when: 'itemType == "variable"',
      label: "Variable",
      items: [
        {
          type: "select",
          label: "Variable",
          name: "variableId",
          value: "${values.variableId}",
          options: "${variableOptionsById}",
        },
        {
          type: "group",
          fields: [
            {
              type: "clickable-value",
              label: "Prefix",
              name: "prefix",
              value: "${values.prefix}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-text",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
            {
              type: "clickable-value",
              label: "Suffix",
              name: "suffix",
              value: "${values.suffix}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    inputType: "input-text",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      content: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    {
      $when:
        'itemType == "text" || itemType == "variable" || itemType == "text-ref-character-name" || itemType == "text-revealing-ref-dialogue-content" || itemType == "text-ref-choice-item-content"',
      label: "Typography",
      items: [
        {
          type: "select",
          label: "Default",
          name: "typographyId",
          value: "${values.typographyId}",
          options: "${typographyItems}",
        },
        {
          type: "select",
          label: "Hover",
          name: "hoverTypographyId",
          value: "${values.hoverTypographyId}",
          options: "${typographyItemsWithNone}",
        },
        {
          type: "select",
          label: "Clicked",
          name: "clickedTypographyId",
          value: "${values.clickedTypographyId}",
          options: "${typographyItemsWithNone}",
        },
      ],
    },
    {
      $when:
        'itemType == "text" || itemType == "variable" || itemType == "text-ref-character-name" || itemType == "text-revealing-ref-dialogue-content" || itemType == "text-ref-choice-item-content"',
      label: "Text Alignment",
      items: [
        {
          type: "select",
          label: "Alignment",
          name: "style.align",
          value: "${values.style.align}",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
        },
      ],
    },
    {
      $when:
        'itemType == "text" || itemType == "variable" || itemType == "sprite" || itemType == "rect"',
      id: "actions",
      label: "Actions",
      labelAction: "plus",
      items: [
        {
          type: "list-item",
          items: "${values.actions}",
        },
      ],
    },
  ],
};

const selectFieldPopoverFormFromConfig = (fieldName) => {
  for (const section of config.sections || []) {
    for (const item of section.items || []) {
      if (item.type !== "group") {
        continue;
      }

      const match = (item.fields || []).find(
        (field) => field.name === fieldName,
      );
      if (match) {
        return match.popoverForm;
      }
    }
  }

  return undefined;
};

export const createInitialState = () => {
  return {
    tempSelectedImageId: undefined,
    imageSelectorDialog: {
      open: false,
      name: undefined,
    },
    popover: {
      key: 0,
      x: undefined,
      y: undefined,
      open: false,
      defaultValues: {},
      name: undefined,
      form: undefined,
      context: {},
    },
    typographyData: { tree: [], items: {} },
    variablesData: { tree: [], items: {} },
    values: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      anchor: {
        x: 0,
        y: 0,
      },
      direction: undefined,
      gap: 0,
      actions: {},
    },
  };
};

export const updateValueProperty = (state, payload) => {
  const { value, name } = payload;
  const keys = name.split(".");

  if (keys.length === 1) {
    if (value === undefined) {
      delete state.values[name];
    } else {
      state.values[name] = value;
    }
    return;
  }

  // Handle nested path
  let current = state.values;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  const lastKey = keys[keys.length - 1];
  if (value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }
};

export const openPopoverForm = (state, payload) => {
  const value = state.values[payload.name];

  const popoverFormValues = {
    value,
  };

  state.popover = {
    key: state.popover.key + 1,
    open: true,
    x: payload.x,
    y: payload.y,
    defaultValues: popoverFormValues,
    name: payload.name,
    form: payload.form,
    context: {
      popoverFormValues,
    },
  };
};

export const updatePopoverFormContext = (state, payload) => {
  state.popover.context = {
    ...state.popover.context,
    popoverFormValues: payload.values,
  };
  state.popover.defaultValues = payload.values;
  state.popover.key = state.popover.key + 1;
};

export const closePopoverForm = (state) => {
  state.popover = {
    key: 0,
    open: false,
    x: undefined,
    y: undefined,
    defaultValues: {},
    name: undefined,
    form: undefined,
  };
};

export const selectFieldPopoverForm = (_deps, name) => {
  return selectFieldPopoverFormFromConfig(name);
};

export const selectPopoverForm = ({ state }) => {
  return state.popover;
};

export const openImageSelectorDialog = (state, payload) => {
  state.imageSelectorDialog = {
    open: true,
    name: payload.name,
  };
};

export const closeImageSelectorDialog = (state) => {
  state.imageSelectorDialog = {
    open: false,
    name: undefined,
  };
  state.tempSelectedImageId = undefined;
};

export const setValues = (state, payload) => {
  state.values = payload.values;
};

export const setTypographyData = (state, typographyData) => {
  state.typographyData = typographyData;
};

export const setVariablesData = (state, variablesData) => {
  state.variablesData = variablesData;
};

export const selectValues = ({ state }) => {
  return state.values;
};

export const setTempSelectedImageId = (state, payload) => {
  state.tempSelectedImageId = payload.imageId;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const selectTempSelectedImageId = ({ state }) => {
  return state.tempSelectedImageId;
};

export const selectViewData = ({ state, attrs }) => {
  // Transform typography data to options format
  const typographyGroups = toFlatGroups(state.typographyData);
  const typographyItems = typographyGroups.flatMap((group) =>
    group.children.map((item) => ({
      label: item.name,
      value: item.id,
    })),
  );
  const typographyItemsWithNone = [
    { label: "None", value: "" },
    ...typographyItems,
  ];

  // Transform variables data to options format (exclude folders)
  const variableItems = toFlatItems(state.variablesData).filter(
    (v) => v.type !== "folder",
  );
  const variableOptionsById = variableItems.map((v) => ({
    label: v.name,
    value: v.id,
  }));

  const actionsLabelMap = {
    nextLine: "Next Line",
    sectionTransition: "Section Transition",
    toggleAutoMode: "Toggle Auto Mode",
    toggleSkipMode: "Toggle Skip Mode",
    pushLayeredView: "Push Layered View",
    popLayeredView: "Pop Layered View",
  };

  const context = {
    itemType: attrs["item-type"],
    layoutType: attrs["layout-type"],
    typographyItems: typographyItems,
    typographyItemsWithNone: typographyItemsWithNone,
    variableOptionsById: variableOptionsById,
    values: {
      ...state.values,
      actions: Object.entries(
        state.values?.click?.actionPayload?.actions || {},
      ).map(([key, _value]) => ({
        id: key,
        label: actionsLabelMap[key],
        svg: `action-${key}`,
      })),
    },
  };

  const finalConfig = parseAndRender(config, context);

  return {
    actionsDialogOpen: state.actionsDialogOpen,
    values: state.values,
    config: finalConfig,
    popover: state.popover,
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
  };
};
