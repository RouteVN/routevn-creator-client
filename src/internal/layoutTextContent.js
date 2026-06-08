import { toVariableConditionTarget } from "./layoutConditions.js";

const EDITOR_CARET_TEXT = "\u200b";

const normalizeText = (value) => {
  return String(value ?? "")
    .replaceAll(EDITOR_CARET_TEXT, "")
    .replace(/\r\n?/g, "\n");
};

const isPlainObject = (value) => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const cloneTextStyle = (textStyle) => {
  if (!isPlainObject(textStyle)) {
    return undefined;
  }

  const nextTextStyle = {};

  if (textStyle.fontWeight === "bold") {
    nextTextStyle.fontWeight = "bold";
  }
  if (textStyle.fontStyle === "italic") {
    nextTextStyle.fontStyle = "italic";
  }
  if (textStyle.textDecoration === "underline") {
    nextTextStyle.textDecoration = "underline";
  }
  if (typeof textStyle.fill === "string" && textStyle.fill.length > 0) {
    nextTextStyle.fill = textStyle.fill;
  }

  return Object.keys(nextTextStyle).length > 0 ? nextTextStyle : undefined;
};

const cloneTextStyleId = (textStyleId) => {
  return typeof textStyleId === "string" && textStyleId.length > 0
    ? textStyleId
    : undefined;
};

const cloneFurigana = (furigana) => {
  if (!isPlainObject(furigana)) {
    return undefined;
  }

  const text = normalizeText(furigana.text).replace(/\n+/g, " ").trim();
  if (!text) {
    return undefined;
  }

  const nextFurigana = { text };
  const textStyleId = cloneTextStyleId(furigana.textStyleId);
  if (textStyleId) {
    nextFurigana.textStyleId = textStyleId;
  }

  return nextFurigana;
};

const copyTextMetadata = (targetItem, sourceItem = {}) => {
  const textStyle = cloneTextStyle(sourceItem.textStyle);
  if (textStyle) {
    targetItem.textStyle = textStyle;
  }

  const textStyleId = cloneTextStyleId(sourceItem.textStyleId);
  if (textStyleId) {
    targetItem.textStyleId = textStyleId;
  }

  const furigana = cloneFurigana(sourceItem.furigana);
  if (furigana) {
    targetItem.furigana = furigana;
  }
};

const getMetadataKey = (item = {}) => {
  return JSON.stringify({
    textStyle: cloneTextStyle(item.textStyle) ?? {},
    textStyleId: cloneTextStyleId(item.textStyleId) ?? "",
    furigana: cloneFurigana(item.furigana) ?? {},
  });
};

export const getLayoutTextReferenceResourceId = (item = {}) => {
  const resourceId =
    item?.reference?.resourceId ??
    item?.variable?.variableId ??
    item?.variableId;

  return typeof resourceId === "string" && resourceId.length > 0
    ? resourceId
    : undefined;
};

const cloneReferenceItem = (item = {}) => {
  const resourceId = getLayoutTextReferenceResourceId(item);
  if (!resourceId) {
    return undefined;
  }

  const nextItem = {
    reference: {
      resourceId,
    },
  };
  copyTextMetadata(nextItem, item);
  return nextItem;
};

export const cloneLayoutTextContentItems = (items = []) => {
  const nextItems = [];

  for (const item of Array.isArray(items) ? items : []) {
    const referenceItem = cloneReferenceItem(item);
    if (referenceItem) {
      nextItems.push(referenceItem);
      continue;
    }

    const text = normalizeText(item?.text);
    if (!text) {
      continue;
    }

    const nextItem = { text };
    copyTextMetadata(nextItem, item);
    nextItems.push(nextItem);
  }

  return nextItems;
};

export const mergeLayoutTextContentItems = (items = []) => {
  const result = [];

  for (const item of cloneLayoutTextContentItems(items)) {
    if (item.reference) {
      result.push(item);
      continue;
    }

    const previousItem = result[result.length - 1];
    if (
      previousItem &&
      !previousItem.reference &&
      getMetadataKey(previousItem) === getMetadataKey(item)
    ) {
      previousItem.text += item.text;
      continue;
    }

    result.push(item);
  }

  return result;
};

export const createLayoutTextContentFromText = (text) => {
  const normalizedText = normalizeText(text);
  return normalizedText ? [{ text: normalizedText }] : [{ text: "" }];
};

export const normalizeLayoutTextContent = (content, { fallbackText } = {}) => {
  if (Array.isArray(content)) {
    const normalizedContent = mergeLayoutTextContentItems(content);
    return normalizedContent.length > 0 ? normalizedContent : [{ text: "" }];
  }

  return createLayoutTextContentFromText(fallbackText ?? content ?? "");
};

const getVariableName = (variablesData = {}, resourceId) => {
  const variable = variablesData?.items?.[resourceId];
  return variable?.name || resourceId;
};

export const getLayoutTextDisplayText = (
  content,
  { fallbackText, variablesData } = {},
) => {
  return normalizeLayoutTextContent(content, { fallbackText })
    .map((item) => {
      const resourceId = getLayoutTextReferenceResourceId(item);
      return resourceId
        ? getVariableName(variablesData, resourceId)
        : item.text;
    })
    .join("");
};

export const getLayoutTextSummary = (
  content,
  { fallbackText, variablesData } = {},
) => {
  const displayText = getLayoutTextDisplayText(content, {
    fallbackText,
    variablesData,
  }).trim();

  return displayText || "Empty";
};

const copyRouteGraphicsMetadata = (targetItem, sourceItem = {}) => {
  const textStyle = cloneTextStyle(sourceItem.textStyle);
  if (textStyle) {
    targetItem.textStyle = textStyle;
  }

  const textStyleId = cloneTextStyleId(sourceItem.textStyleId);
  if (textStyleId) {
    targetItem.textStyleId = textStyleId;
  }

  const furigana = cloneFurigana(sourceItem.furigana);
  if (furigana) {
    targetItem.furigana = furigana;
  }
};

export const toLayoutTextLegacyTemplate = (content) => {
  return normalizeLayoutTextContent(content)
    .map((item) => {
      const resourceId = getLayoutTextReferenceResourceId(item);
      if (!resourceId) {
        return item.text ?? "";
      }

      return `\${${toVariableConditionTarget(resourceId)}}`;
    })
    .join("");
};

export const toRouteGraphicsLayoutTextContent = (content) => {
  if (!Array.isArray(content)) {
    return content;
  }

  return normalizeLayoutTextContent(content).map((item) => {
    const resourceId = getLayoutTextReferenceResourceId(item);
    const nextItem = {
      text: resourceId
        ? `\${${toVariableConditionTarget(resourceId)}}`
        : (item.text ?? ""),
    };

    copyRouteGraphicsMetadata(nextItem, item);
    return nextItem;
  });
};
