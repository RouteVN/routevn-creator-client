import { EditableTextElement, EDITABLE_TEXT_TAG_NAME } from "./editableText.js";

export const registerPrimitives = () => {
  if (!customElements.get(EDITABLE_TEXT_TAG_NAME)) {
    customElements.define(EDITABLE_TEXT_TAG_NAME, EditableTextElement);
  }
};
