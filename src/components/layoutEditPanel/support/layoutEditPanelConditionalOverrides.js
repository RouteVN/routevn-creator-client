const CONDITION_OP_OPTIONS = [{ label: "Equals", value: "eq" }];
const CONDITION_BOOLEAN_OPTIONS = [
  { label: "True", value: true },
  { label: "False", value: false },
];
const VISIBILITY_OPTIONS = [
  { label: "Visible", value: true },
  { label: "Hidden", value: false },
];
const TEXT_ALIGNMENT_OPTIONS = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];
const ANCHOR_OPTIONS = [
  { label: "Top Left", value: "topLeft", x: 0, y: 0 },
  { label: "Top Center", value: "topCenter", x: 0.5, y: 0 },
  { label: "Top Right", value: "topRight", x: 1, y: 0 },
  { label: "Center Left", value: "centerLeft", x: 0, y: 0.5 },
  { label: "Center", value: "center", x: 0.5, y: 0.5 },
  { label: "Center Right", value: "centerRight", x: 1, y: 0.5 },
  { label: "Bottom Left", value: "bottomLeft", x: 0, y: 1 },
  { label: "Bottom Center", value: "bottomCenter", x: 0.5, y: 1 },
  { label: "Bottom Right", value: "bottomRight", x: 1, y: 1 },
];

const CONDITIONAL_OVERRIDE_ATTRIBUTE_OPTIONS = [
  { label: "Text Style", value: "textStyleId" },
  { label: "Hover Text Style", value: "hoverTextStyleId" },
  { label: "Click Text Style", value: "clickTextStyleId" },
  { label: "Image", value: "imageId" },
  { label: "Hover Image", value: "hoverImageId" },
  { label: "Click Image", value: "clickImageId" },
  { label: "Opacity", value: "opacity" },
  { label: "Anchor", value: "anchor" },
  { label: "Text Alignment", value: "textStyle.align" },
  { label: "Visibility", value: "visible" },
];

const TEXT_STYLE_ATTRIBUTE_FIELD_SET = new Set([
  "textStyleId",
  "hoverTextStyleId",
  "clickTextStyleId",
]);
const IMAGE_ATTRIBUTE_FIELD_SET = new Set([
  "imageId",
  "hoverImageId",
  "clickImageId",
]);

const normalizeOpacity = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, parsedValue));
};

const normalizeAnchorValue = (value) => {
  const option = ANCHOR_OPTIONS.find((item) => item.value === value);
  if (!option) {
    return undefined;
  }

  return {
    anchorX: option.x,
    anchorY: option.y,
  };
};

const findAnchorOptionByCoordinates = (anchorX, anchorY) => {
  return ANCHOR_OPTIONS.find(
    (item) => item.x === anchorX && item.y === anchorY,
  );
};

const getConditionalOverrideSetFieldNames = (set = {}) => {
  const fieldNames = [];

  for (const fieldName of TEXT_STYLE_ATTRIBUTE_FIELD_SET) {
    if (typeof set[fieldName] === "string" && set[fieldName].length > 0) {
      fieldNames.push(fieldName);
    }
  }

  for (const fieldName of IMAGE_ATTRIBUTE_FIELD_SET) {
    if (typeof set[fieldName] === "string" && set[fieldName].length > 0) {
      fieldNames.push(fieldName);
    }
  }

  if (typeof set.opacity === "number") {
    fieldNames.push("opacity");
  }

  if (typeof set.anchorX === "number" || typeof set.anchorY === "number") {
    fieldNames.push("anchor");
  }

  if (typeof set.textStyle?.align === "string") {
    fieldNames.push("textStyle.align");
  }

  if (typeof set.visible === "boolean") {
    fieldNames.push("visible");
  }

  return fieldNames;
};

const normalizeConditionalOverrideSet = (value) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextValue = {};
  for (const fieldName of TEXT_STYLE_ATTRIBUTE_FIELD_SET) {
    if (typeof value[fieldName] === "string" && value[fieldName].length > 0) {
      nextValue[fieldName] = value[fieldName];
    }
  }

  for (const fieldName of IMAGE_ATTRIBUTE_FIELD_SET) {
    if (typeof value[fieldName] === "string" && value[fieldName].length > 0) {
      nextValue[fieldName] = value[fieldName];
    }
  }

  const opacity = normalizeOpacity(value.opacity);
  if (opacity !== undefined) {
    nextValue.opacity = opacity;
  }

  if (Number.isFinite(value.anchorX)) {
    nextValue.anchorX = value.anchorX;
  }
  if (Number.isFinite(value.anchorY)) {
    nextValue.anchorY = value.anchorY;
  }

  if (typeof value.textStyle?.align === "string") {
    nextValue.textStyle = {
      align: value.textStyle.align,
    };
  }

  if (typeof value.visible === "boolean") {
    nextValue.visible = value.visible;
  }

  return nextValue;
};

export const normalizeConditionalOverrideRules = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (rule) =>
        rule &&
        typeof rule === "object" &&
        rule.when &&
        typeof rule.when === "object" &&
        typeof rule.when.target === "string" &&
        rule.when.target.length > 0 &&
        rule.when.op === "eq",
    )
    .map((rule) => ({
      when: {
        target: rule.when.target,
        op: rule.when.op,
        value: rule.when.value,
      },
      set: normalizeConditionalOverrideSet(rule.set),
    }));
};

export const getConditionalOverrideSummary = (
  rule,
  variablesData = {},
  options = {},
  getVisibilityConditionSummary,
) => {
  return getVisibilityConditionSummary(rule?.when, variablesData, options);
};

export const getConditionalOverrideAttributeLabel = (fieldName) => {
  return (
    CONDITIONAL_OVERRIDE_ATTRIBUTE_OPTIONS.find(
      (item) => item.value === fieldName,
    )?.label ?? fieldName
  );
};

export const createConditionalOverrideConditionDefaults = (
  rule,
  targetTypeByTarget,
) => {
  const target = rule?.when?.target ?? "";
  const selectedVariableType = target
    ? (targetTypeByTarget[target] ?? "string")
    : undefined;
  const rawValue = rule?.when?.value;
  const parsedNumberValue = Number(rawValue);

  return {
    target,
    op: rule?.when?.op ?? "eq",
    booleanValue: rawValue === true,
    numberValue: Number.isFinite(parsedNumberValue) ? parsedNumberValue : 0,
    stringValue: typeof rawValue === "string" ? rawValue : "",
    selectedVariableType,
  };
};

export const createConditionalOverrideConditionForm = ({
  targetOptions,
  submitLabel = "Save",
} = {}) => {
  return {
    title: "Condition",
    fields: [
      {
        name: "target",
        type: "select",
        label: "Target",
        required: true,
        clearable: false,
        options: targetOptions,
      },
      {
        $when: "target",
        name: "op",
        type: "segmented-control",
        label: "Operation",
        required: true,
        clearable: false,
        options: CONDITION_OP_OPTIONS,
      },
      {
        $when: "target && selectedVariableType == 'boolean'",
        name: "booleanValue",
        type: "segmented-control",
        label: "Value",
        required: true,
        clearable: false,
        options: CONDITION_BOOLEAN_OPTIONS,
      },
      {
        $when: "target && selectedVariableType == 'number'",
        name: "numberValue",
        type: "input-number",
        label: "Value",
        required: true,
      },
      {
        $when: "target && selectedVariableType == 'string'",
        name: "stringValue",
        type: "input-text",
        label: "Value",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: submitLabel,
        },
      ],
    },
  };
};

export const getConditionalOverrideAttributeOptions = ({
  rule,
  includeFieldName,
  capabilities = {},
} = {}) => {
  const selectedFields = new Set(
    getConditionalOverrideSetFieldNames(rule?.set),
  );
  const allowedFields = new Set(["opacity", "visible"]);

  if (capabilities.supportsTextStyles) {
    allowedFields.add("textStyleId");
    allowedFields.add("hoverTextStyleId");
    allowedFields.add("clickTextStyleId");
  }

  if (capabilities.supportsSpriteImages) {
    allowedFields.add("imageId");
    allowedFields.add("hoverImageId");
    allowedFields.add("clickImageId");
  }

  if (capabilities.supportsAnchor) {
    allowedFields.add("anchor");
  }

  if (capabilities.supportsTextAlignment) {
    allowedFields.add("textStyle.align");
  }

  return CONDITIONAL_OVERRIDE_ATTRIBUTE_OPTIONS.filter(
    (item) =>
      allowedFields.has(item.value) &&
      (item.value === includeFieldName || !selectedFields.has(item.value)),
  );
};

export const createConditionalOverrideAttributeDefaults = (
  rule,
  fieldName,
  attributeOptions = [],
) => {
  const defaultFieldName =
    fieldName ??
    (attributeOptions.length === 1 ? attributeOptions[0].value : "") ??
    "";

  return {
    fieldName: defaultFieldName,
    textStyleId:
      typeof rule?.set?.[defaultFieldName] === "string"
        ? rule.set[defaultFieldName]
        : "",
    selectedImageId:
      typeof rule?.set?.[defaultFieldName] === "string"
        ? rule.set[defaultFieldName]
        : "",
    opacity: normalizeOpacity(rule?.set?.opacity) ?? 1,
    anchor:
      findAnchorOptionByCoordinates(rule?.set?.anchorX, rule?.set?.anchorY)
        ?.value ?? "",
    align:
      typeof rule?.set?.textStyle?.align === "string"
        ? rule.set.textStyle.align
        : "left",
    visible: typeof rule?.set?.visible === "boolean" ? rule.set.visible : true,
  };
};

export const createConditionalOverrideAttributeForm = ({
  attributeOptions,
  textStyleOptions,
  imageOptions,
  submitLabel = "Save",
} = {}) => {
  return {
    title: "Condition Attribute",
    fields: [
      {
        name: "fieldName",
        type: "select",
        label: "Attribute",
        required: true,
        clearable: false,
        options: attributeOptions,
      },
      {
        $when:
          "fieldName == 'textStyleId' || fieldName == 'hoverTextStyleId' || fieldName == 'clickTextStyleId'",
        name: "textStyleId",
        type: "select",
        label: "Text Style",
        required: true,
        clearable: false,
        options: textStyleOptions,
      },
      {
        $when:
          "fieldName == 'imageId' || fieldName == 'hoverImageId' || fieldName == 'clickImageId'",
        name: "selectedImageId",
        type: "select",
        label: "Image",
        required: true,
        clearable: false,
        options: imageOptions,
      },
      {
        $when: "fieldName == 'opacity'",
        name: "opacity",
        type: "input-number",
        label: "Opacity",
        required: true,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        $when: "fieldName == 'anchor'",
        name: "anchor",
        type: "select",
        label: "Anchor",
        required: true,
        clearable: false,
        options: ANCHOR_OPTIONS.map(({ label, value }) => ({
          label,
          value,
        })),
      },
      {
        $when: "fieldName == 'textStyle.align'",
        name: "align",
        type: "segmented-control",
        label: "Alignment",
        required: true,
        clearable: false,
        options: TEXT_ALIGNMENT_OPTIONS,
      },
      {
        $when: "fieldName == 'visible'",
        name: "visible",
        type: "segmented-control",
        label: "Visibility",
        required: true,
        clearable: false,
        options: VISIBILITY_OPTIONS,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: submitLabel,
        },
      ],
    },
  };
};

const formatConditionalOverrideAttributeValue = (
  fieldName,
  set,
  textStylesData = {},
  imagesData = {},
) => {
  if (TEXT_STYLE_ATTRIBUTE_FIELD_SET.has(fieldName)) {
    const textStyleId = set?.[fieldName];
    return textStylesData?.items?.[textStyleId]?.name ?? textStyleId ?? "";
  }

  if (IMAGE_ATTRIBUTE_FIELD_SET.has(fieldName)) {
    const imageId = set?.[fieldName];
    return imagesData?.items?.[imageId]?.name ?? imageId ?? "";
  }

  if (fieldName === "opacity") {
    return String(set?.opacity ?? "");
  }

  if (fieldName === "anchor") {
    const option = findAnchorOptionByCoordinates(set?.anchorX, set?.anchorY);
    if (option) {
      return option.label;
    }

    const x = Number.isFinite(set?.anchorX) ? set.anchorX : "?";
    const y = Number.isFinite(set?.anchorY) ? set.anchorY : "?";
    return `${x}, ${y}`;
  }

  if (fieldName === "textStyle.align") {
    const value = set?.textStyle?.align;
    return (
      TEXT_ALIGNMENT_OPTIONS.find((item) => item.value === value)?.label ??
      value ??
      ""
    );
  }

  if (fieldName === "visible") {
    return set?.visible === false ? "Hidden" : "Visible";
  }

  return String(set?.[fieldName] ?? "");
};

export const toConditionalOverrideAttributeItems = (
  rule,
  textStylesData = {},
  imagesData = {},
) => {
  return getConditionalOverrideSetFieldNames(rule?.set).map((fieldName) => {
    const value = formatConditionalOverrideAttributeValue(
      fieldName,
      rule?.set,
      textStylesData,
      imagesData,
    );

    return {
      fieldName,
      label: getConditionalOverrideAttributeLabel(fieldName),
      value,
      summary: `${getConditionalOverrideAttributeLabel(fieldName)}: ${value}`,
    };
  });
};

export const buildConditionalOverrideSetUpdate = (
  previousSet = {},
  {
    fieldName,
    textStyleId,
    selectedImageId,
    opacity,
    anchor,
    align,
    visible,
  } = {},
) => {
  const nextSet = normalizeConditionalOverrideSet(previousSet);

  if (TEXT_STYLE_ATTRIBUTE_FIELD_SET.has(fieldName) && textStyleId) {
    nextSet[fieldName] = textStyleId;
    return nextSet;
  }

  if (IMAGE_ATTRIBUTE_FIELD_SET.has(fieldName) && selectedImageId) {
    nextSet[fieldName] = selectedImageId;
    return nextSet;
  }

  if (fieldName === "opacity") {
    nextSet.opacity = normalizeOpacity(opacity) ?? 1;
    return nextSet;
  }

  if (fieldName === "anchor") {
    const anchorValue = normalizeAnchorValue(anchor);
    if (!anchorValue) {
      return nextSet;
    }

    nextSet.anchorX = anchorValue.anchorX;
    nextSet.anchorY = anchorValue.anchorY;
    return nextSet;
  }

  if (fieldName === "textStyle.align" && typeof align === "string") {
    nextSet.textStyle = {
      ...nextSet.textStyle,
      align,
    };
    return nextSet;
  }

  if (fieldName === "visible" && typeof visible === "boolean") {
    nextSet.visible = visible;
    return nextSet;
  }

  return nextSet;
};

export const deleteConditionalOverrideSetField = (
  previousSet = {},
  fieldName,
) => {
  const nextSet = normalizeConditionalOverrideSet(previousSet);

  if (fieldName === "anchor") {
    delete nextSet.anchorX;
    delete nextSet.anchorY;
    return nextSet;
  }

  if (fieldName === "textStyle.align") {
    if (nextSet.textStyle) {
      delete nextSet.textStyle.align;
      if (Object.keys(nextSet.textStyle).length === 0) {
        delete nextSet.textStyle;
      }
    }
    return nextSet;
  }

  delete nextSet[fieldName];
  return nextSet;
};
