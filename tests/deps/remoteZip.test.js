import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  findZipDirectory,
  openRemoteZip,
  parseZipDirectory,
  ZIP_END_SEARCH_BYTES,
} from "../../src/deps/clients/remoteZip.js";

// The central directory's location, from the end record.
const directoryOf = (bytes) => {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + i);
      return {
        directorySize: view.getUint32(12, true),
        directoryOffset: view.getUint32(16, true),
      };
    }
  }
  throw new Error("no end record");
};

// Serves `bytes` as a server does explicit byte ranges, recording each one.
const rangeReader = (bytes) => {
  const ranges = [];
  return {
    ranges,
    readRange: async (start, end) => {
      ranges.push([start, end]);
      if (!(start >= 0 && end >= start && end < bytes.length)) {
        throw new Error(`unsatisfiable range ${start}-${end}`);
      }
      return bytes.slice(start, end + 1);
    },
  };
};

const storedZip = async (files, options) => {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return zip.generateAsync({ type: "uint8array", ...options });
};

const u16 = (value) => [value & 0xff, (value >> 8) & 0xff];
const u32 = (value) => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >>> 24) & 0xff,
];

// One stored entry whose local header carries `localExtra` more bytes of
// extra field than its directory record says, which JSZip never writes.
const zipWithLongLocalExtra = (name, data, localExtra) => {
  const nameBytes = new TextEncoder().encode(name);
  const local = [
    ...u32(0x04034b50),
    ...u16(10),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u32(0),
    ...u32(data.length),
    ...u32(data.length),
    ...u16(nameBytes.length),
    ...u16(localExtra),
    ...nameBytes,
    ...new Uint8Array(localExtra),
    ...data,
  ];
  const directory = [
    ...u32(0x02014b50),
    ...u16(20),
    ...u16(10),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u32(0),
    ...u32(data.length),
    ...u32(data.length),
    ...u16(nameBytes.length),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u32(0),
    ...u32(0),
    ...nameBytes,
  ];
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(1),
    ...u16(1),
    ...u32(directory.length),
    ...u32(local.length),
    ...u16(0),
  ];
  return new Uint8Array([...local, ...directory, ...end]);
};

describe("remoteZip", () => {
  it("reads a stored ZIP's entries with one range for the directory and one per entry", async () => {
    const image = new Uint8Array(4000).map((_, i) => i % 251);
    const bytes = await storedZip({
      "asset-package.json": '{"schema":"routevn.import-pack.v1"}',
      "files/image": image,
      "files/empty": new Uint8Array(0),
    });
    const { ranges, readRange } = rangeReader(bytes);
    const zip = await openRemoteZip({ ...directoryOf(bytes), readRange });
    expect(ranges).toHaveLength(1);

    const manifest = await zip.readEntry("asset-package.json", {
      kind: "manifest",
    });
    expect(new TextDecoder().decode(manifest)).toBe(
      '{"schema":"routevn.import-pack.v1"}',
    );
    expect(await zip.readEntry("files/image")).toEqual(image);
    expect(await zip.readEntry("files/empty")).toEqual(new Uint8Array(0));
    expect(zip.sizeOf("files/image")).toBe(4000);
    // One range each, never past the directory, never the whole file.
    expect(ranges).toHaveLength(4);
    const { directoryOffset } = directoryOf(bytes);
    for (const [start, end] of ranges.slice(1)) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThan(directoryOffset);
    }
  });

  it("refuses compressed entries", async () => {
    const bytes = await storedZip(
      { "asset-package.json": "{}".repeat(500) },
      { compression: "DEFLATE" },
    );
    const { readRange } = rangeReader(bytes);
    await expect(
      openRemoteZip({ ...directoryOf(bytes), readRange }),
    ).rejects.toMatchObject({
      code: "package_invalid",
      message: "The asset package has a compressed file.",
    });
  });

  it("refuses an entry whose data would run into the directory", async () => {
    const bytes = await storedZip({ "files/a": "abc" });
    const { directoryOffset, directorySize } = directoryOf(bytes);
    const directory = bytes.slice(
      directoryOffset,
      directoryOffset + directorySize,
    );
    expect(() =>
      parseZipDirectory(directory, { directoryOffset: directoryOffset - 1 }),
    ).toThrow("could not be read");
  });

  it("reads past a local extra field longer than the directory says", async () => {
    const data = new TextEncoder().encode("payload");
    const bytes = zipWithLongLocalExtra("files/a", data, 2000);
    const { ranges, readRange } = rangeReader(bytes);
    const zip = await openRemoteZip({ ...directoryOf(bytes), readRange });
    expect(new TextDecoder().decode(await zip.readEntry("files/a"))).toBe(
      "payload",
    );
    // The first range ends inside the extra field; the second reads the data.
    expect(ranges).toHaveLength(3);
  });

  it("reports a missing entry and an entry over its size limit", async () => {
    const bytes = await storedZip({ "files/a": "abcdef" });
    const { readRange } = rangeReader(bytes);
    const zip = await openRemoteZip({ ...directoryOf(bytes), readRange });
    await expect(zip.readEntry("files/missing")).rejects.toMatchObject({
      code: "file_not_found",
    });
    await expect(
      zip.readEntry("files/a", { maxBytes: 5 }),
    ).rejects.toMatchObject({ code: "file_too_large" });
  });
});

// The last bytes of a ZIP, as much as an end record search reads.
const tailOf = (bytes) =>
  bytes.subarray(Math.max(0, bytes.length - ZIP_END_SEARCH_BYTES));

describe("findZipDirectory", () => {
  it("finds the central directory from the end record", async () => {
    const bytes = await storedZip({
      "asset-package.json": "{}",
      "files/a": "abc",
    });

    const place = findZipDirectory(tailOf(bytes), { size: bytes.length });

    expect(place).toEqual(directoryOf(bytes));
    const { readRange } = rangeReader(bytes);
    const zip = await openRemoteZip({ ...place, readRange });
    expect(new TextDecoder().decode(await zip.readEntry("files/a"))).toBe(
      "abc",
    );
  });

  it("finds it behind a trailing comment, even one that holds an end signature", async () => {
    const plain = await storedZip({ "files/a": "abc" });
    const commented = await storedZip(
      { "files/a": "abc" },
      { comment: "PK\u0005\u0006 is not the end record ".repeat(40) },
    );
    expect(commented.length).toBeGreaterThan(plain.length);

    expect(
      findZipDirectory(tailOf(commented), { size: commented.length }),
    ).toEqual(directoryOf(plain));
  });

  it("finds it in a ZIP longer than the search reads", async () => {
    const bytes = await storedZip({
      "files/large": new Uint8Array(ZIP_END_SEARCH_BYTES * 2),
    });
    const tail = tailOf(bytes);
    expect(tail.length).toBe(ZIP_END_SEARCH_BYTES);

    expect(findZipDirectory(tail, { size: bytes.length })).toEqual(
      directoryOf(bytes),
    );
  });

  it("refuses what is not a ZIP", () => {
    const text = new TextEncoder().encode("<!doctype html>".repeat(20));
    expect(() => findZipDirectory(text, { size: text.length })).toThrow(
      expect.objectContaining({ code: "package_invalid" }),
    );
    expect(() => findZipDirectory(new Uint8Array(0), { size: 0 })).toThrow(
      expect.objectContaining({ code: "package_invalid" }),
    );
  });

  it("refuses a truncated ZIP", async () => {
    const bytes = await storedZip({ "files/a": "abcdef" });
    // Cut inside the end record, and cut so the directory is short.
    for (const cut of [5, 30]) {
      const truncated = bytes.subarray(0, bytes.length - cut);
      expect(() =>
        findZipDirectory(tailOf(truncated), { size: truncated.length }),
      ).toThrow(expect.objectContaining({ code: "package_invalid" }));
    }
    // A middle part lost, so the directory is not where the end record says.
    const shortened = new Uint8Array([
      ...bytes.subarray(0, 10),
      ...bytes.subarray(14),
    ]);
    expect(() =>
      findZipDirectory(tailOf(shortened), { size: shortened.length }),
    ).toThrow(expect.objectContaining({ code: "package_invalid" }));
  });

  it("refuses a ZIP64 archive", async () => {
    const bytes = await storedZip({ "files/a": "abc" });
    const end = bytes.length - 22;
    // An end record that sends the reader to a ZIP64 record for the offset.
    const marked = bytes.slice();
    marked.set([0xff, 0xff, 0xff, 0xff], end + 16);
    expect(() =>
      findZipDirectory(tailOf(marked), { size: marked.length }),
    ).toThrow("ZIP64");
    // A ZIP64 locator in front of the end record.
    const locator = new Uint8Array(20);
    locator.set([0x50, 0x4b, 0x06, 0x07]);
    const located = new Uint8Array([
      ...bytes.subarray(0, end),
      ...locator,
      ...bytes.subarray(end),
    ]);
    expect(() =>
      findZipDirectory(tailOf(located), { size: located.length }),
    ).toThrow(expect.objectContaining({ code: "package_invalid" }));
  });
});
