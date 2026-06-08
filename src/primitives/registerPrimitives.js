import {
  LexicalSceneDocumentEditorElement,
  LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME,
} from "./lexicalSceneDocumentEditor.js";
import {
  LexicalLayoutTextEditorElement,
  LEXICAL_LAYOUT_TEXT_EDITOR_TAG_NAME,
} from "./lexicalLayoutTextEditor.js";

export const registerPrimitives = () => {
  if (!customElements.get(LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME)) {
    customElements.define(
      LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME,
      LexicalSceneDocumentEditorElement,
    );
  }
  if (!customElements.get(LEXICAL_LAYOUT_TEXT_EDITOR_TAG_NAME)) {
    customElements.define(
      LEXICAL_LAYOUT_TEXT_EDITOR_TAG_NAME,
      LexicalLayoutTextEditorElement,
    );
  }
};
