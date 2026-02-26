import { parseAndRender } from "jempl";
import { toFlatGroups } from "../../domain/v2/treeHelpers.js";
import { getFirstTypographyId } from "../../constants/typography.js";
import { getVariableOptions } from "../../utils/index.js";

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
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
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
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
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
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
                    },
                  ],
                },
              },
            },
            {
              $when:
                'itemType != "text" || itemType != "text-ref-character-name" || itemType != "text-revealing-ref-dialogue-content" || itemType != "text-ref-choice-item-content" || itemType != "text-ref-dialogue-line-character-name" || itemType != "text-ref-dialogue-line-content"',
              type: "clickable-value",
              svg: "h",
              name: "height",
              value: "${values.height}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          $when:
            "itemType == 'container' || itemType == 'container-ref-choice-item' || itemType == 'container-ref-dialogue-line' || itemType == 'text' || itemType == 'text-ref-choice-item-content' || itemType == 'text-ref-character-name' || itemType == 'text-revealing-ref-dialogue-content' || itemType == 'text-ref-dialogue-line-character-name' || itemType == 'text-ref-dialogue-line-content'",
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
        'itemType == "container" || itemType == "container-ref-choice-item" || itemType == "container-ref-dialogue-line"',
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
            '(itemType == "container" || itemType == "container-ref-choice-item" || itemType == "container-ref-dialogue-line") && (values.direction == "vertical" || values.direction == "horizontal") ',
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
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
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
      $when: 'itemType == "slider"',
      id: "slider-images",
      label: "Slider Bar",
      items: [
        {
          type: "list-bar",
          items: [
            {
              name: "barImageId",
              label: "Default",
              imageId: "${values.barImageId}",
            },
            {
              name: "hoverBarImageId",
              label: "Hover",
              imageId: "${values.hoverBarImageId}",
            },
          ],
        },
      ],
    },
    {
      $when: 'itemType == "slider"',
      id: "slider-thumb",
      label: "Slider Thumb",
      items: [
        {
          type: "list-bar",
          items: [
            {
              name: "thumbImageId",
              label: "Default",
              imageId: "${values.thumbImageId}",
            },
            {
              name: "hoverThumbImageId",
              label: "Hover",
              imageId: "${values.hoverThumbImageId}",
            },
          ],
        },
      ],
    },
    {
      $when: 'itemType == "slider"',
      label: "Slider Values",
      items: [
        {
          type: "group",
          fields: [
            {
              type: "clickable-value",
              label: "Min",
              name: "min",
              value: "${values.min}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
                    },
                  ],
                },
              },
            },
            {
              type: "clickable-value",
              label: "Max",
              name: "max",
              value: "${values.max}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          type: "group",
          fields: [
            {
              type: "clickable-value",
              label: "Step",
              name: "step",
              value: "${values.step}",
              popoverForm: {
                fields: [
                  {
                    name: "value",
                    type: "input-number",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          type: "select",
          label: "Update Variable",
          name: "variableId",
          value: "${values.variableId}",
          options: "${variableOptionsWithNone}",
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
                  // {
                  //   name: "contentType",
                  //   description: "Content Type",
                  //   type: "select",
                  //   options: [
                  //     { label: "Variable", value: "variable" },
                  //     { label: "Plain Text", value: "plain" },
                  //   ],
                  // },
                  // {
                  //   $when: 'popoverFormValues.contentType == "variable"',
                  //   name: "value",
                  //   description: "Variable",
                  //   type: "select",
                  //   options: [
                  //     {
                  //       label: "Dialogue Character Name",
                  //       value: "\\${dialogue.character.name}",
                  //     },
                  //     {
                  //       label: "Dialogue Content",
                  //       value: "\\${dialogue.content[0].text}",
                  //     },
                  //     {
                  //       $when: 'layoutType === "choices"',
                  //       label: "Choice content",
                  //       value: "\\${item.content}",
                  //     },
                  //   ],
                  // },
                  {
                    // $when: 'popoverFormValues.contentType == "plain"',
                    name: "value",
                    type: "input-text",
                  },
                ],
                actions: {
                  buttons: [
                    {
                      id: "submit",
                      variant: "pr",
                      label: "Submit",
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
        'itemType == "text" || itemType == "text-ref-character-name" || itemType == "text-revealing-ref-dialogue-content" || itemType == "text-ref-choice-item-content" || itemType == "text-ref-dialogue-line-character-name" || itemType == "text-ref-dialogue-line-content"',
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
        'itemType == "text" || itemType == "text-ref-character-name" || itemType == "text-revealing-ref-dialogue-content" || itemType == "text-ref-choice-item-content" || itemType == "text-ref-dialogue-line-character-name" || itemType == "text-ref-dialogue-line-content"',
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
      $when: 'itemType == "text" || itemType == "sprite" || itemType == "rect"',
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

export const updateValueProperty = ({ state }, { value, name } = {}) => {
  if (!name) {
    return;
  }
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

export const openPopoverForm = ({ state }, { x, y, name, form } = {}) => {
  if (!name) {
    return;
  }
  const value = state.values[name];

  const popoverFormValues = {
    value,
  };

  if (value && typeof value === "string" && value.startsWith("${")) {
    popoverFormValues.contentType = "variable";
  } else {
    popoverFormValues.contentType = "plain";
  }

  state.popover = {
    key: state.popover.key + 1,
    open: true,
    x,
    y,
    defaultValues: popoverFormValues,
    name,
    form,
    context: {
      popoverFormValues,
    },
  };
};

export const updatePopoverFormContext = ({ state }, { values = {} } = {}) => {
  state.popover.context = {
    popoverFormValues: values,
  };
  state.popover.defaultValues = values;
  state.popover.key = state.popover.key + 1;
};

export const closePopoverForm = ({ state }, _payload = {}) => {
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

export const openImageSelectorDialog = ({ state }, { name } = {}) => {
  state.imageSelectorDialog = {
    open: true,
    name,
  };
};

export const closeImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog = {
    open: false,
    name: undefined,
  };
  state.tempSelectedImageId = undefined;
};

export const setValues = ({ state }, { values } = {}) => {
  state.values = values ?? {};
};

export const setTypographyData = ({ state }, { typographyData } = {}) => {
  state.typographyData = typographyData;
};

export const setVariablesData = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
};

export const selectValues = ({ state }) => {
  return state.values;
};

export const setTempSelectedImageId = ({ state }, { imageId } = {}) => {
  state.tempSelectedImageId = imageId;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const selectTempSelectedImageId = ({ state }) => {
  return state.tempSelectedImageId;
};

export const selectViewData = ({ state, props: attrs }) => {
  // Transform typography data to options format
  const typographyGroups = toFlatGroups(state.typographyData);
  const typographyItems = typographyGroups.flatMap((group) =>
    group.children.map((item) => ({
      label: item.name,
      value: item.id,
    })),
  );
  const firstTypographyId = getFirstTypographyId(state.typographyData);
  const typographyItemsWithNone = [
    { label: "None", value: "" },
    ...typographyItems,
  ];

  // Transform variables data to options format (number type only for sliders)
  const variableOptions = getVariableOptions(state.variablesData, {
    type: "number",
  });
  const variableOptionsWithNone = [
    { label: "None", value: "" },
    ...variableOptions,
  ];

  const actionsLabelMap = {
    nextLine: "Next Line",
    sectionTransition: "Section Transition",
    toggleAutoMode: "Toggle Auto Mode",
    toggleSkipMode: "Toggle Skip Mode",
    pushLayeredView: "Push Layered View",
    popLayeredView: "Pop Layered View",
    updateVariable: "Update Variable",
  };

  const context = {
    itemType: attrs.itemType,
    layoutType: attrs.layoutType,
    typographyItems: typographyItems,
    typographyItemsWithNone: typographyItemsWithNone,
    variableOptionsWithNone: variableOptionsWithNone,
    values: {
      ...state.values,
      typographyId: state.values?.typographyId || firstTypographyId || "",
      hoverTypographyId: state.values?.hoverTypographyId ?? "",
      clickedTypographyId: state.values?.clickedTypographyId ?? "",
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
    actionsData: state.values?.click?.actionPayload?.actions || {},
    config: finalConfig,
    popover: state.popover,
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
  };
};
