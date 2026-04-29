export const ACCENT_FILL = "#b45309";
export const EDITOR_CARET_TEXT = "\u200b";

export const MENTION_SUGGESTIONS = [
  { id: "user-alice", label: "alice" },
  { id: "user-allen", label: "allen" },
  { id: "user-amina", label: "amina" },
  { id: "user-brook", label: "brook" },
  { id: "user-kai", label: "kai" },
  { id: "user-route-dev", label: "route-dev" },
  { id: "user-scene-editor", label: "scene-editor" },
];

export const normalizeSingleLineText = (value) => {
  return String(value ?? "")
    .replaceAll(EDITOR_CARET_TEXT, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n+/g, " ");
};

export const normalizeMentionLabel = (value) => {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "");
};

export const createMentionText = (label) => {
  return `@${normalizeMentionLabel(label)}`;
};

export const cloneTextStyle = (textStyle) => {
  if (!textStyle || typeof textStyle !== "object" || Array.isArray(textStyle)) {
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

export const cloneTextStyleId = (textStyleId) => {
  return typeof textStyleId === "string" && textStyleId.length > 0
    ? textStyleId
    : undefined;
};

export const cloneFurigana = (furigana) => {
  if (!furigana || typeof furigana !== "object" || Array.isArray(furigana)) {
    return undefined;
  }

  const text = normalizeSingleLineText(furigana.text);
  if (text.length === 0) {
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
  const nextTextStyle = cloneTextStyle(sourceItem.textStyle);
  if (nextTextStyle) {
    targetItem.textStyle = nextTextStyle;
  }

  const nextTextStyleId = cloneTextStyleId(sourceItem.textStyleId);
  if (nextTextStyleId) {
    targetItem.textStyleId = nextTextStyleId;
  }

  const furigana = cloneFurigana(sourceItem.furigana);
  if (furigana) {
    targetItem.furigana = furigana;
  }
};

const getTextStyleKey = (item = {}) => {
  return JSON.stringify({
    textStyle: cloneTextStyle(item.textStyle) ?? {},
    textStyleId: cloneTextStyleId(item.textStyleId) ?? "",
    furigana: cloneFurigana(item.furigana) ?? {},
  });
};

export const cloneMentionItem = (mention) => {
  const label = normalizeMentionLabel(mention?.label);
  if (!label) {
    return undefined;
  }

  return {
    mention: {
      id: String(mention?.id ?? label),
      label,
    },
  };
};

export const cloneContentItems = (items = []) => {
  const nextItems = [];

  for (const item of Array.isArray(items) ? items : []) {
    const mentionItem = cloneMentionItem(item?.mention);
    if (mentionItem) {
      nextItems.push(mentionItem);
      continue;
    }

    const text = normalizeSingleLineText(item?.text);
    if (text.length === 0) {
      continue;
    }

    const nextItem = { text };
    copyTextMetadata(nextItem, item);
    nextItems.push(nextItem);
  }

  return nextItems;
};

export const mergeAdjacentContentItems = (items = []) => {
  const result = [];

  for (const item of cloneContentItems(items)) {
    if (item?.mention) {
      result.push(item);
      continue;
    }

    const previousItem = result[result.length - 1];
    if (
      previousItem &&
      !previousItem.mention &&
      getTextStyleKey(previousItem) === getTextStyleKey(item)
    ) {
      previousItem.text += item.text;
      continue;
    }

    result.push(item);
  }

  return result;
};

export const createEmptyContent = () => [{ text: "" }];

export const ensureContentArray = (items = []) => {
  const normalizedItems = mergeAdjacentContentItems(items);
  return normalizedItems.length > 0 ? normalizedItems : createEmptyContent();
};

export const getItemPlainText = (item) => {
  if (item?.mention) {
    return createMentionText(item.mention.label);
  }

  return String(item?.text ?? "");
};

export const getPlainTextFromContent = (items = []) => {
  const normalizedItems = mergeAdjacentContentItems(items);
  if (normalizedItems.length === 0) {
    return "";
  }

  return normalizedItems.map(getItemPlainText).join("");
};

export const getContentLength = (items = []) => {
  return getPlainTextFromContent(items).length;
};

export const createContentFromPlainText = (text) => {
  const normalizedText = normalizeSingleLineText(text);
  return normalizedText.length > 0
    ? [{ text: normalizedText }]
    : createEmptyContent();
};

export const appendContentArrays = (...parts) => {
  return ensureContentArray(parts.flatMap((part) => cloneContentItems(part)));
};

export const areContentsEqual = (left, right) => {
  return (
    JSON.stringify(ensureContentArray(left)) ===
    JSON.stringify(ensureContentArray(right))
  );
};

export const splitContentAtOffset = (items = [], offset = 0) => {
  const normalizedItems = mergeAdjacentContentItems(items);
  const targetOffset = Math.max(0, Number(offset) || 0);
  const leftItems = [];
  const rightItems = [];
  let consumed = 0;

  for (const item of normalizedItems) {
    const itemLength = getItemPlainText(item).length;
    const nextConsumed = consumed + itemLength;

    if (targetOffset <= consumed) {
      rightItems.push(item);
      consumed = nextConsumed;
      continue;
    }

    if (targetOffset >= nextConsumed) {
      leftItems.push(item);
      consumed = nextConsumed;
      continue;
    }

    if (item?.mention) {
      leftItems.push(item);
      consumed = nextConsumed;
      continue;
    }

    const splitOffset = targetOffset - consumed;
    const leftText = item.text.slice(0, splitOffset);
    const rightText = item.text.slice(splitOffset);

    if (leftText.length > 0) {
      const nextLeftItem = { text: leftText };
      copyTextMetadata(nextLeftItem, item);
      leftItems.push(nextLeftItem);
    }

    if (rightText.length > 0) {
      const nextRightItem = { text: rightText };
      copyTextMetadata(nextRightItem, item);
      rightItems.push(nextRightItem);
    }

    consumed = nextConsumed;
  }

  return {
    left: ensureContentArray(leftItems),
    right: ensureContentArray(rightItems),
  };
};

export const splitContentRange = (items = [], start = 0, end = start) => {
  const normalizedStart = Math.max(0, Number(start) || 0);
  const normalizedEnd = Math.max(normalizedStart, Number(end) || 0);
  const { left, right: afterStart } = splitContentAtOffset(
    items,
    normalizedStart,
  );
  const { left: middle, right } = splitContentAtOffset(
    afterStart,
    normalizedEnd - normalizedStart,
  );

  return {
    before: left,
    middle,
    after: right,
  };
};

export const replaceContentRange = (
  items = [],
  { start = 0, end = start, replacement = [] } = {},
) => {
  const { before, after } = splitContentRange(items, start, end);
  return appendContentArrays(before, replacement, after);
};

export const getLineDialogueContent = (line) => {
  return ensureContentArray(line?.actions?.dialogue?.content);
};

export const setLineDialogueContent = (line, content) => {
  const nextLine = line;
  if (!nextLine.actions || typeof nextLine.actions !== "object") {
    nextLine.actions = {};
  }

  if (
    !nextLine.actions.dialogue ||
    typeof nextLine.actions.dialogue !== "object"
  ) {
    nextLine.actions.dialogue = {};
  }

  nextLine.actions.dialogue.content = ensureContentArray(content);
  return nextLine;
};
