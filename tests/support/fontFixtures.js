const writeTag = (view, offset, tag) => {
  for (let index = 0; index < tag.length; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
};

const writeFixed = (view, offset, value) => {
  view.setInt32(offset, value * 65536, false);
};

export const createTestFontBytes = ({
  weight = 400,
  variableRange,
  signature = "\u0000\u0001\u0000\u0000",
} = {}) => {
  const tableDefinitions = [{ tag: "OS/2", length: 6 }];
  if (variableRange) {
    tableDefinitions.push({ tag: "fvar", length: 36 });
  }

  const directoryLength = 12 + tableDefinitions.length * 16;
  const byteLength =
    directoryLength +
    tableDefinitions.reduce((total, table) => total + table.length, 0);
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);

  writeTag(view, 0, signature);
  view.setUint16(4, tableDefinitions.length, false);

  let tableOffset = directoryLength;
  tableDefinitions.forEach((table, index) => {
    const recordOffset = 12 + index * 16;
    writeTag(view, recordOffset, table.tag);
    view.setUint32(recordOffset + 8, tableOffset, false);
    view.setUint32(recordOffset + 12, table.length, false);

    if (table.tag === "OS/2") {
      view.setUint16(tableOffset + 4, weight, false);
    }

    if (table.tag === "fvar") {
      view.setUint16(tableOffset, 1, false);
      view.setUint16(tableOffset + 4, 16, false);
      view.setUint16(tableOffset + 8, 1, false);
      view.setUint16(tableOffset + 10, 20, false);
      writeTag(view, tableOffset + 16, "wght");
      writeFixed(view, tableOffset + 20, variableRange.minWeight);
      writeFixed(view, tableOffset + 24, variableRange.defaultWeight);
      writeFixed(view, tableOffset + 28, variableRange.maxWeight);
    }

    tableOffset += table.length;
  });

  return bytes;
};

export const createTestFontFile = ({
  name = "test-font.ttf",
  type = "font/ttf",
  ...fontOptions
} = {}) =>
  new File([createTestFontBytes(fontOptions)], name, {
    type,
  });
