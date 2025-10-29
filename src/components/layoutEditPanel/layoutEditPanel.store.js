import { parseAndRender } from "jempl";

const groupItemEditForm = {
  fields: [
    {
      name: "value",
      inputType: "inputText",
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
};

const config = {
  sections: [
    {
      label: "Position",
      type: "group",
      fields: [
        {
          svg: "x",
          name: "x",
          value: "${values.x}",
        },
        {
          svg: "x",
          name: "y",
          value: "${values.y}",
        },
        //   {
        //   svg: 'x',
        //   name: 'z',
        //   value: '${values.z}'
        // }
      ],
    },
    {
      $when: 'itemType == "text" || itemType == "sprite" || itemType == "rect"',
      label: "Layout",
      type: "group",
      fields: [
        {
          svg: "x",
          name: "width",
          value: "${values.width}",
        },
        {
          svg: "x",
          name: "height",
          value: "${values.height}",
        },
        //     {
        //   svg: 'x',
        //   name: 'rotation',
        //   value: '${values.rotation}'
        // }
      ],
    },
    {
      label: "Anchor",
      type: "select",
      fields: [
        {
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
      $when: 'itemType == "container"',
      label: "Direction",
      type: "select",
      fields: [
        {
          name: "direction",
          value: "${values.direction}",
          options: [
            { label: "Absolute", value: undefined },
            { label: "Horizontal", value: "horizontal" },
            { label: "Vertical", value: "vertical" },
          ],
        },
      ],
    },
    {
      $when: 'itemType == "sprite"',
      label: "Image",
      "$if !values.imageId || !values.hoverImageId || !values.clickImageId": {
        labelAction: "plus",
      },
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
    {
      $when: 'itemType == "text" || itemType == "sprite" || itemType == "rect"',
      label: "Actions",
      labelAction: "plus",
      type: "list-item",
      items: "${values.actions}",
      // items: [{
      //   svg: 'text',
      //   label: 'Text',
      // }, {
      //   svg: 'image',
      //   label: 'Background',
      // }]
    },
  ],
};

export const createInitialState = () => {
  return {
    tempSelectedImageId: undefined,
    actionsDialogOpen: false,
    imageSelectorDialog: {
      open: false,
      name: undefined,
    },
    popover: {
      x: undefined,
      y: undefined,
      open: false,
      defaultValues: {},
      name: undefined,
    },
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
      actions: {},
    },
  };
};

export const updateValueProperty = (state, payload) => {
  const { value, name } = payload;
  if (value === undefined) {
    delete state.values[name];
    return;
  }
  state.values[payload.name] = payload.value;
};

export const openPopoverForm = (state, payload) => {
  state.popover = {
    open: true,
    x: payload.x,
    y: payload.y,
    defaultValues: {
      value: state.values[payload.name],
    },
    name: payload.name,
  };
};

export const closePopoverForm = (state) => {
  state.popover = {
    open: false,
    x: undefined,
    y: undefined,
    defaultValues: {},
    name: undefined,
  };
};

export const selectPopoverForm = ({ state }) => {
  return state.popover;
};

export const openActionsDialog = (state) => {
  state.actionsDialogOpen = true;
};

export const closeActionsDialog = (state) => {
  state.actionsDialogOpen = false;
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
  const context = {
    itemType: attrs["item-type"],
    values: {
      ...state.values,
      actions: Object.entries(state.values?.actions || {}).map(
        ([key, _value]) => ({
          id: key,
          label: key,
          svg: key,
        }),
      ),
    },
  };

  const finalConfig = parseAndRender(config, context);
  return {
    actionsDialogOpen: state.actionsDialogOpen,
    values: state.values,
    config: finalConfig,
    popover: {
      ...state.popover,
      form: groupItemEditForm,
    },
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
  };
};
