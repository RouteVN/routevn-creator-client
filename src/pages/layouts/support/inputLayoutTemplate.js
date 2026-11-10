import { getFirstTextStyleId } from "../../../constants/textStyles.js";
import { generateId } from "../../../internal/id.js";
import { scaleLayoutElementsForProjectResolution } from "../../../internal/projectResolution.js";

// A new Input layout starts with a prompt, an input below it, and a submit
// button below that, centered horizontally and placed above the middle of the
// screen. Each element is what the layout editor's Add
// Element menu creates, changed only through the edit panel: the same
// defaults, names, and first text style. tests/layouts/inputLayoutTemplate
// adds the elements that way and compares, so when an editor default
// changes, change it here too, and in the Default Input layout of
// static/templates/default/repository.json.
//
// Positions are for 1920x1080 and are scaled to the project's resolution.
export const createInputLayoutElements = ({
  projectResolution,
  textStylesData,
  copy = {},
} = {}) => {
  const promptTextId = generateId();
  const inputId = generateId();
  const submitContainerId = generateId();
  const submitTextId = generateId();
  const promptText = copy.promptText ?? "Enter your name";
  const submitText = copy.submitText ?? "Submit";

  const promptTextElement = {
    id: promptTextId,
    type: "text",
    name: copy.textName ?? "Text",
    x: 960,
    y: 340,
    anchorX: 0.5,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    text: promptText,
    content: [{ text: promptText }],
    textStyle: {
      align: "center",
    },
  };
  const inputElement = {
    id: inputId,
    type: "input",
    name: copy.inputName ?? "Input",
    x: 960,
    y: 390,
    anchorX: 0.5,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    field: "field",
    width: 330,
    height: 52,
  };
  const submitContainerElement = {
    id: submitContainerId,
    type: "container",
    name: copy.submitContainerName ?? "Input Submit Container",
    x: 960,
    y: 472,
    anchorX: 0.5,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    direction: "absolute",
    gapX: 0,
    gapY: 0,
    formRole: "submit",
  };
  const submitTextElement = {
    id: submitTextId,
    type: "text",
    name: copy.textName ?? "Text",
    x: 0,
    y: 0,
    anchorX: 0,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    text: submitText,
    content: [{ text: submitText }],
    textStyle: {
      align: "left",
    },
  };

  // Like a text element added in the editor, and unlike an input, the text
  // gets the project's first text style.
  const textStyleId = getFirstTextStyleId(textStylesData);
  if (textStyleId) {
    promptTextElement.textStyleId = textStyleId;
    submitTextElement.textStyleId = textStyleId;
  }

  return scaleLayoutElementsForProjectResolution(
    {
      items: {
        [promptTextId]: promptTextElement,
        [inputId]: inputElement,
        [submitContainerId]: submitContainerElement,
        [submitTextId]: submitTextElement,
      },
      tree: [
        {
          id: promptTextId,
          children: [],
        },
        {
          id: inputId,
          children: [],
        },
        {
          id: submitContainerId,
          children: [
            {
              id: submitTextId,
              children: [],
            },
          ],
        },
      ],
    },
    projectResolution,
  );
};
