import { ImportPackageClientError } from "./importPackageErrors.js";

// Reads entries straight out of a ZIP on a server, without downloading it:
// one byte range for its central directory (the table of contents, at a
// location the caller already knows or reads from the ZIP's end record with
// `findZipDirectory`), then one range per entry. Every range
// names both ends, so a cross-origin read never needs a CORS preflight. Only
// stored (uncompressed) entries are read; see docs/import-packages.md.

const DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const DIRECTORY_RECORD_BYTES = 46;
const LOCAL_HEADER_BYTES = 30;
// Fetched past an entry's expected end, so a local header whose extra field
// is longer than the directory's still arrives in one request.
const LOCAL_HEADER_SLACK = 512;
const ZIP64_MARKER = 0xffffffff;

const invalid = (message) =>
  new ImportPackageClientError(
    "package_invalid",
    message ?? "The asset package could not be read.",
  );

const u16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes, offset) =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>>
  0;

const decodeName = (bytes) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalid();
  }
};

const END_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const END_RECORD_BYTES = 22;
const ZIP64_LOCATOR_BYTES = 20;
const ZIP64_COUNT_MARKER = 0xffff;

// The most bytes at a ZIP's end that can hold its end record: the record
// and the longest comment it can carry.
export const ZIP_END_SEARCH_BYTES = END_RECORD_BYTES + 0xffff;

/**
 * Where a ZIP's central directory is, read from the end record in `tail`,
 * the last bytes of a ZIP that is `size` bytes long: at least its last
 * `ZIP_END_SEARCH_BYTES`, or all of a shorter one. The end record is the last
 * one whose comment runs exactly to the end of the file. A ZIP64 archive, one
 * split over several disks, and one with bytes before its first entry are
 * refused, as is anything that is not a ZIP.
 */
export const findZipDirectory = (tail, { size }) => {
  if (tail.length > size) throw invalid();
  for (
    let position = tail.length - END_RECORD_BYTES;
    position >= 0;
    position -= 1
  ) {
    if (
      u32(tail, position) !== END_SIGNATURE ||
      position + END_RECORD_BYTES + u16(tail, position + 20) !== tail.length
    ) {
      continue;
    }
    const endOffset = size - tail.length + position;
    const diskEntries = u16(tail, position + 8);
    const entries = u16(tail, position + 10);
    const directorySize = u32(tail, position + 12);
    const directoryOffset = u32(tail, position + 16);
    if (
      entries === ZIP64_COUNT_MARKER ||
      directorySize === ZIP64_MARKER ||
      directoryOffset === ZIP64_MARKER ||
      (position >= ZIP64_LOCATOR_BYTES &&
        u32(tail, position - ZIP64_LOCATOR_BYTES) === ZIP64_LOCATOR_SIGNATURE)
    ) {
      throw invalid("The asset package uses ZIP64, which is not supported.");
    }
    if (
      u16(tail, position + 4) !== 0 ||
      u16(tail, position + 6) !== 0 ||
      diskEntries !== entries ||
      entries === 0 ||
      directorySize === 0 ||
      directoryOffset + directorySize !== endOffset
    ) {
      throw invalid();
    }
    return { directoryOffset, directorySize };
  }
  throw invalid();
};

// The directory's entries by name: each one's data size and the offset of
// its local header. Stored entries only; an entry must end before the
// directory starts.
export const parseZipDirectory = (directory, { directoryOffset }) => {
  const entries = new Map();
  let position = 0;
  while (position < directory.length) {
    if (
      position + DIRECTORY_RECORD_BYTES > directory.length ||
      u32(directory, position) !== DIRECTORY_SIGNATURE
    ) {
      throw invalid();
    }
    const flags = u16(directory, position + 8);
    const method = u16(directory, position + 10);
    const compressedSize = u32(directory, position + 20);
    const size = u32(directory, position + 24);
    const nameLength = u16(directory, position + 28);
    const extraLength = u16(directory, position + 30);
    const commentLength = u16(directory, position + 32);
    const offset = u32(directory, position + 42);
    const nameStart = position + DIRECTORY_RECORD_BYTES;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > directory.length) throw invalid();
    const name = decodeName(
      directory.subarray(nameStart, nameStart + nameLength),
    );
    if ((flags & 1) !== 0) {
      throw invalid("The asset package has an encrypted file.");
    }
    if (method !== 0 || compressedSize !== size) {
      throw invalid("The asset package has a compressed file.");
    }
    if (size === ZIP64_MARKER || offset === ZIP64_MARKER) throw invalid();
    if (
      offset + LOCAL_HEADER_BYTES + nameLength + size > directoryOffset ||
      entries.has(name)
    ) {
      throw invalid();
    }
    entries.set(name, { name, size, offset, nameLength, extraLength });
    position = next;
  }
  return entries;
};

/**
 * Opens a stored ZIP whose central directory spans `directorySize` bytes from
 * `directoryOffset`. `readRange(start, end, { signal, kind })` returns exactly
 * the bytes `start` through `end`, inclusive; `kind` is "manifest" for the
 * directory and passes through from `readEntry`.
 */
export const openRemoteZip = async ({
  directoryOffset,
  directorySize,
  readRange,
  signal,
}) => {
  const directory = await readRange(
    directoryOffset,
    directoryOffset + directorySize - 1,
    { signal, kind: "manifest" },
  );
  const entries = parseZipDirectory(directory, { directoryOffset });

  return {
    has: (name) => entries.has(name),
    sizeOf: (name) => entries.get(name)?.size,

    // The entry's bytes: its local header and data in one range, and a
    // second range only when the header is longer than expected.
    async readEntry(
      name,
      { signal: entrySignal, maxBytes, kind = "file" } = {},
    ) {
      const entry = entries.get(name);
      if (!entry) {
        throw new ImportPackageClientError(
          kind === "manifest" ? "manifest_not_found" : "file_not_found",
          kind === "manifest"
            ? "The import package was not found."
            : "A package file was not found.",
        );
      }
      if (maxBytes !== undefined && entry.size > maxBytes) {
        throw new ImportPackageClientError(
          kind === "manifest" ? "manifest_too_large" : "file_too_large",
          "Import data exceeds the allowed size.",
        );
      }
      const end = Math.min(
        entry.offset +
          LOCAL_HEADER_BYTES +
          entry.nameLength +
          entry.extraLength +
          entry.size -
          1 +
          LOCAL_HEADER_SLACK,
        directoryOffset - 1,
      );
      const head = await readRange(entry.offset, end, {
        signal: entrySignal,
        kind,
      });
      if (u32(head, 0) !== LOCAL_SIGNATURE || u16(head, 8) !== 0) {
        throw invalid();
      }
      const localNameLength = u16(head, 26);
      const dataStart = LOCAL_HEADER_BYTES + localNameLength + u16(head, 28);
      const dataEnd = dataStart + entry.size;
      if (
        entry.offset + dataEnd > directoryOffset ||
        decodeName(
          head.subarray(
            LOCAL_HEADER_BYTES,
            LOCAL_HEADER_BYTES + localNameLength,
          ),
        ) !== name
      ) {
        throw invalid();
      }
      if (dataEnd <= head.length) {
        return head.slice(dataStart, dataEnd);
      }
      const restStart = Math.max(head.length, dataStart);
      const rest = await readRange(
        entry.offset + restStart,
        entry.offset + dataEnd - 1,
        { signal: entrySignal, kind },
      );
      const bytes = new Uint8Array(entry.size);
      const fromHead =
        dataStart < head.length ? head.subarray(dataStart) : new Uint8Array(0);
      bytes.set(fromHead, 0);
      bytes.set(rest, fromHead.length);
      return bytes;
    },
  };
};
