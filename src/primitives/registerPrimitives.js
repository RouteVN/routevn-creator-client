import {
  LexicalSceneDocumentEditorElement,
  LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME,
} from "./lexicalSceneDocumentEditor.js";

export const registerPrimitives = () => {
  if (!customElements.get(LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME)) {
    customElements.define(
      LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME,
      LexicalSceneDocumentEditorElement,
    );
  }
};
