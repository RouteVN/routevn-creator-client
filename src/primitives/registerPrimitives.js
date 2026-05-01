import { EditableTextElement, EDITABLE_TEXT_TAG_NAME } from "./editableText.js";
import {
  LexicalSceneDocumentEditorElement,
  LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME,
} from "./lexicalSceneDocumentEditor.js";

export const registerPrimitives = () => {
  if (!customElements.get(EDITABLE_TEXT_TAG_NAME)) {
    customElements.define(EDITABLE_TEXT_TAG_NAME, EditableTextElement);
  }

  if (!customElements.get(LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME)) {
    customElements.define(
      LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME,
      LexicalSceneDocumentEditorElement,
    );
  }
};
