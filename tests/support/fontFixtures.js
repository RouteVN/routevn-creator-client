const writeTag = (view, offset, tag) => {
  for (let index = 0; index < tag.length; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
};

const writeFixed = (view, offset, value) => {
  view.setInt32(offset, value * 65536, false);
};

const align4 = (value) => (value + 3) & ~3;

export const createTestFontBytes = ({
  weight = 400,
  variableRange,
  signature = "\u0000\u0001\u0000\u0000",
} = {}) => {
  const tableDefinitions = [{ tag: "OS/2", length: 78 }];
  if (variableRange) {
    tableDefinitions.push({ tag: "fvar", length: 36 });
    tableDefinitions.push({ tag: "name", length: 30 });
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
      view.setUint16(tableOffset + 34, 256, false);
    }

    if (table.tag === "name") {
      view.setUint16(tableOffset + 2, 1, false);
      view.setUint16(tableOffset + 4, 18, false);
      view.setUint16(tableOffset + 6, 3, false);
      view.setUint16(tableOffset + 8, 1, false);
      view.setUint16(tableOffset + 10, 0x0409, false);
      view.setUint16(tableOffset + 12, 256, false);
      view.setUint16(tableOffset + 14, 12, false);
      const name = "Weight";
      for (let index = 0; index < name.length; index += 1) {
        view.setUint16(
          tableOffset + 18 + index * 2,
          name.charCodeAt(index),
          false,
        );
      }
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

export const createTestWoffBytes = (fontOptions = {}) => {
  const sfntBytes = createTestFontBytes(fontOptions);
  const sfntView = new DataView(sfntBytes.buffer);
  const tableCount = sfntView.getUint16(4, false);
  const woffDirectoryLength = 44 + tableCount * 20;
  const tableRecords = [];
  let woffTableOffset = align4(woffDirectoryLength);

  for (let index = 0; index < tableCount; index += 1) {
    const sfntRecordOffset = 12 + index * 16;
    const sfntTableOffset = sfntView.getUint32(sfntRecordOffset + 8, false);
    const tableLength = sfntView.getUint32(sfntRecordOffset + 12, false);
    tableRecords.push({
      sfntRecordOffset,
      sfntTableOffset,
      tableLength,
      woffTableOffset,
    });
    woffTableOffset = align4(woffTableOffset + tableLength);
  }

  const woffBytes = new Uint8Array(woffTableOffset);
  const woffView = new DataView(woffBytes.buffer);
  writeTag(woffView, 0, "wOFF");
  woffView.setUint32(4, sfntView.getUint32(0, false), false);
  woffView.setUint32(8, woffBytes.byteLength, false);
  woffView.setUint16(12, tableCount, false);
  woffView.setUint32(
    16,
    12 +
      tableCount * 16 +
      tableRecords.reduce(
        (total, record) => total + align4(record.tableLength),
        0,
      ),
    false,
  );

  tableRecords.forEach((record, index) => {
    const woffRecordOffset = 44 + index * 20;
    woffBytes.set(
      sfntBytes.subarray(record.sfntRecordOffset, record.sfntRecordOffset + 4),
      woffRecordOffset,
    );
    woffView.setUint32(woffRecordOffset + 4, record.woffTableOffset, false);
    woffView.setUint32(woffRecordOffset + 8, record.tableLength, false);
    woffView.setUint32(woffRecordOffset + 12, record.tableLength, false);
    woffBytes.set(
      sfntBytes.subarray(
        record.sfntTableOffset,
        record.sfntTableOffset + record.tableLength,
      ),
      record.woffTableOffset,
    );
  });

  return woffBytes;
};
