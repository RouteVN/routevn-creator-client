import { EditableTextElement, EDITABLE_TEXT_TAG_NAME } from "./editableText.js";
import {
  LexicalMentionsPocElement,
  LEXICAL_MENTIONS_POC_TAG_NAME,
} from "./lexicalMentionsPoc.js";
import {
  SegmentedTextPocElement,
  SEGMENTED_TEXT_POC_TAG_NAME,
} from "./segmentedTextPoc.js";

export const registerPrimitives = () => {
  if (!customElements.get(EDITABLE_TEXT_TAG_NAME)) {
    customElements.define(EDITABLE_TEXT_TAG_NAME, EditableTextElement);
  }

  if (!customElements.get(SEGMENTED_TEXT_POC_TAG_NAME)) {
    customElements.define(SEGMENTED_TEXT_POC_TAG_NAME, SegmentedTextPocElement);
  }

  if (!customElements.get(LEXICAL_MENTIONS_POC_TAG_NAME)) {
    customElements.define(
      LEXICAL_MENTIONS_POC_TAG_NAME,
      LexicalMentionsPocElement,
    );
  }
};
