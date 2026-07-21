export const NEW_FONT_FILE_ACCEPT = ".ttf,.otf";
export const NEW_FONT_FILE_TYPES = [".ttf", ".otf"];

const NEW_FONT_FILE_PATTERN = /\.(ttf|otf)$/i;
const STRICT_FONT_MIME_TYPES = new Set(["font/ttf", "font/otf"]);
const MIN_FONT_WEIGHT = 1;
const MAX_FONT_WEIGHT = 1000;

const createFontInspectionError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const toDataView = (fontData) => {
  if (fontData instanceof ArrayBuffer) {
    return new DataView(fontData);
  }

  if (ArrayBuffer.isView(fontData)) {
    return new DataView(
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

const readTag = (view, offset) => {
  if (offset < 0 || offset + 4 > view.byteLength) {
    return "";
  }

  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
};

const isSupportedSfntSignature = (view) => {
  if (view.byteLength < 12) {
    return false;
  }

  return (
    view.getUint32(0, false) === 0x00010000 ||
    readTag(view, 0) === "OTTO" ||
    readTag(view, 0) === "true"
  );
};

const readSfntTables = (view) => {
  if (!isSupportedSfntSignature(view)) {
    throw createFontInspectionError(
      "unsupported_font_format",
      "The file is not a supported TTF or OTF font.",
    );
  }

  const tableCount = view.getUint16(4, false);
  const directoryEnd = 12 + tableCount * 16;
  if (tableCount === 0 || directoryEnd > view.byteLength) {
    throw createFontInspectionError(
      "invalid_font_data",
      "The font table directory is invalid.",
    );
  }

  const tables = new Map();
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16;
    const tag = readTag(view, recordOffset);
    const offset = view.getUint32(recordOffset + 8, false);
    const length = view.getUint32(recordOffset + 12, false);
    if (offset + length > view.byteLength) {
      throw createFontInspectionError(
        "invalid_font_data",
        `The ${tag || "unknown"} font table is out of bounds.`,
      );
    }

    tables.set(tag, { offset, length });
  }

  return tables;
};

const readStaticWeight = (view, tables) => {
  const table = tables.get("OS/2");
  if (!table || table.length < 6) {
    throw createFontInspectionError(
      "missing_font_weight",
      "The font does not contain a valid OS/2 weight class.",
    );
  }

  const weight = view.getUint16(table.offset + 4, false);
  if (weight < MIN_FONT_WEIGHT || weight > MAX_FONT_WEIGHT) {
    throw createFontInspectionError(
      "invalid_font_weight",
      "The font weight class must be between 1 and 1000.",
    );
  }

  return weight;
};

const readFixed = (view, offset) => view.getInt32(offset, false) / 65536;

const readVariableWeightAxis = (view, tables) => {
  const table = tables.get("fvar");
  if (!table) {
    return undefined;
  }

  if (table.length < 16) {
    throw createFontInspectionError(
      "invalid_font_data",
      "The font variations table is invalid.",
    );
  }

  const axesOffset = view.getUint16(table.offset + 4, false);
  const axisCount = view.getUint16(table.offset + 8, false);
  const axisSize = view.getUint16(table.offset + 10, false);
  if (axisSize < 20 || axesOffset + axisCount * axisSize > table.length) {
    throw createFontInspectionError(
      "invalid_font_data",
      "The font variation axes are invalid.",
    );
  }

  for (let index = 0; index < axisCount; index += 1) {
    const axisOffset = table.offset + axesOffset + index * axisSize;
    if (readTag(view, axisOffset) !== "wght") {
      continue;
    }

    const minWeight = readFixed(view, axisOffset + 4);
    const defaultWeight = readFixed(view, axisOffset + 8);
    const maxWeight = readFixed(view, axisOffset + 12);
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
  const view = toDataView(fontData);
  const tables = readSfntTables(view);
  const staticWeight = readStaticWeight(view, tables);
  const variableWeightAxis = readVariableWeightAxis(view, tables);

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
      "Only TTF and OTF font files are supported for new uploads.",
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
