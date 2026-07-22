import { create as createFont } from "fontkit";

export const NEW_FONT_FILE_ACCEPT = ".ttf,.otf,.woff,.woff2";
export const NEW_FONT_FILE_TYPES = [".ttf", ".otf", ".woff", ".woff2"];

const NEW_FONT_FILE_PATTERN = /\.(ttf|otf|woff|woff2)$/i;
const STRICT_FONT_MIME_TYPES = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
]);
const MIN_FONT_WEIGHT = 1;
const MAX_FONT_WEIGHT = 1000;

const createFontInspectionError = (code, message, cause) => {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
};

const toUint8Array = (fontData) => {
  if (fontData instanceof ArrayBuffer) {
    return new Uint8Array(fontData);
  }

  if (ArrayBuffer.isView(fontData)) {
    return new Uint8Array(
      fontData.buffer,
      fontData.byteOffset,
      fontData.byteLength,
    );
  }

  throw createFontInspectionError(
    "invalid_font_data",
    "Font data must be an ArrayBuffer or typed array.",
  );
};

const readStaticWeight = (font) => {
  const weight = font["OS/2"]?.usWeightClass;
  if (!Number.isFinite(weight)) {
    throw createFontInspectionError(
      "missing_font_weight",
      "The font does not contain a valid OS/2 weight class.",
    );
  }

  if (weight < MIN_FONT_WEIGHT || weight > MAX_FONT_WEIGHT) {
    throw createFontInspectionError(
      "invalid_font_weight",
      "The font weight class must be between 1 and 1000.",
    );
  }

  return weight;
};

const readVariableWeightAxis = (font) => {
  const axes = font.fvar?.axis;
  if (!Array.isArray(axes)) {
    return undefined;
  }

  for (const axis of axes) {
    if (axis.axisTag?.trim() !== "wght") {
      continue;
    }

    const minWeight = axis.minValue;
    const defaultWeight = axis.defaultValue;
    const maxWeight = axis.maxValue;
    if (
      !Number.isFinite(minWeight) ||
      !Number.isFinite(defaultWeight) ||
      !Number.isFinite(maxWeight) ||
      minWeight < MIN_FONT_WEIGHT ||
      maxWeight > MAX_FONT_WEIGHT ||
      minWeight > defaultWeight ||
      defaultWeight > maxWeight
    ) {
      throw createFontInspectionError(
        "invalid_font_weight",
        "The variable font weight axis is invalid.",
      );
    }

    return {
      defaultWeight,
      minWeight,
      maxWeight,
    };
  }

  return undefined;
};

export const extractFontWeightCapabilities = (fontData) => {
  const bytes = toUint8Array(fontData);
  let font;
  try {
    font = createFont(bytes);
  } catch (error) {
    throw createFontInspectionError(
      "unsupported_font_format",
      "The file is not a supported TTF, OTF, WOFF, or WOFF2 font.",
      error,
    );
  }

  const staticWeight = readStaticWeight(font);
  const variableWeightAxis = readVariableWeightAxis(font);

  if (!variableWeightAxis) {
    return {
      kind: "static",
      defaultWeight: staticWeight,
      minWeight: staticWeight,
      maxWeight: staticWeight,
    };
  }

  return {
    kind: "variable",
    defaultWeight: variableWeightAxis.defaultWeight,
    minWeight: variableWeightAxis.minWeight,
    maxWeight: variableWeightAxis.maxWeight,
  };
};

export const isNewFontFileSupported = (file) =>
  NEW_FONT_FILE_PATTERN.test(file?.name ?? "");

export const inspectNewFontFile = async (file) => {
  if (!isNewFontFileSupported(file)) {
    throw createFontInspectionError(
      "unsupported_font_format",
      "Only TTF, OTF, WOFF, and WOFF2 font files are supported for new uploads.",
    );
  }

  return extractFontWeightCapabilities(await file.arrayBuffer());
};

export const isStrictFontMimeType = (mimeType) =>
  STRICT_FONT_MIME_TYPES.has(mimeType?.trim().toLowerCase());

export const isFontWeightSupported = (capabilities, fontWeight) => {
  const weight = Number(fontWeight);
  if (!Number.isFinite(weight)) {
    return false;
  }

  if (!capabilities || capabilities.kind === "unrestricted") {
    return true;
  }

  if (capabilities?.kind === "static") {
    return weight === capabilities.defaultWeight;
  }

  if (capabilities?.kind === "variable") {
    return weight >= capabilities.minWeight && weight <= capabilities.maxWeight;
  }

  return false;
};
