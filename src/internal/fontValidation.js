// Bounded container checks before fontkit or the browser sees a new upload.
// OpenType: https://learn.microsoft.com/en-us/typography/opentype/spec/otff
// WOFF2: https://www.w3.org/TR/WOFF2/
const MAX_DECOMPRESSED_FONT_BYTES = 128 * 1024 * 1024;
const SFNT_SIGNATURES = new Set([0x00010000, 0x4f54544f, 0x74727565]);
const WOFF2_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

const invalid = (message, code = "invalid_font_data") => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const readTag = (bytes, offset) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));

const validateSfnt = (bytes, view) => {
  if (bytes.length < 12) invalid("The font header is truncated.");
  const count = view.getUint16(4);
  const directoryEnd = 12 + count * 16;
  if (!count || directoryEnd > bytes.length) {
    invalid("The font table directory is truncated.");
  }
  const tags = new Set();
  const tables = [];
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    const tag = readTag(bytes, record);
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (tags.has(tag)) invalid(`Duplicate font table: ${tag}.`);
    tags.add(tag);
    if (offset < directoryEnd || offset % 4 || offset + length > bytes.length) {
      invalid(`The font table ${tag} is outside the file or misaligned.`);
    }
    tables.push({ tag, offset, length, checksum: view.getUint32(record + 4) });
  }
  tables.sort((a, b) => a.offset - b.offset);
  let previousEnd = directoryEnd;
  for (const { tag, offset, length, checksum } of tables) {
    if (length && offset < previousEnd) invalid("Font tables overlap.");
    previousEnd = Math.max(previousEnd, offset + length);
    let sum = 0;
    for (let index = 0; index < length; index += 4) {
      // The head checksum excludes checkSumAdjustment. Pad the final word
      // logically, without reading beyond the table or modifying the input.
      if (tag === "head" && index === 8) continue;
      let word = 0;
      for (let byte = 0; byte < 4; byte += 1) {
        word =
          word * 256 +
          (index + byte < length ? bytes[offset + index + byte] : 0);
      }
      sum = (sum + word) >>> 0;
    }
    if (sum !== checksum)
      invalid(`The font table ${tag} has a damaged checksum.`);
  }
};

const validateWoff2 = (bytes, view) => {
  if (bytes.length < 48) invalid("The WOFF2 header is truncated.");
  if (!SFNT_SIGNATURES.has(view.getUint32(4))) {
    invalid(
      "WOFF2 font collections are not supported.",
      "unsupported_font_format",
    );
  }
  if (view.getUint32(8) !== bytes.length)
    invalid("The WOFF2 file is truncated.");
  const count = view.getUint16(12);
  if (!count) invalid("The WOFF2 table directory is empty.");
  let cursor = 48;
  const readByte = () => {
    if (cursor >= bytes.length) invalid("The WOFF2 directory is truncated.");
    return bytes[cursor++];
  };
  const readBase128 = () => {
    let result = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = readByte();
      if ((!index && byte === 0x80) || result > 0x01ffffff) {
        invalid("Invalid WOFF2 table length.");
      }
      result = result * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return result;
    }
    invalid("Invalid WOFF2 table length.");
  };
  const tags = new Set();
  let decodedLength = 0;
  for (let index = 0; index < count; index += 1) {
    const flags = readByte();
    const tagIndex = flags & 0x3f;
    const tag =
      tagIndex === 63
        ? String.fromCharCode(readByte(), readByte(), readByte(), readByte())
        : WOFF2_TAGS[tagIndex];
    if (tags.has(tag)) invalid(`Duplicate font table: ${tag}.`);
    tags.add(tag);
    const originalLength = readBase128();
    const transform = flags >>> 6;
    const isOutline = tag === "glyf" || tag === "loca";
    if (
      isOutline
        ? transform !== 0 && transform !== 3
        : transform !== 0 && !(tag === "hmtx" && transform === 1)
    ) {
      invalid("Unsupported WOFF2 table transform.", "unsupported_font_format");
    }
    const transformed = isOutline ? transform === 0 : transform !== 0;
    const length = transformed ? readBase128() : originalLength;
    if (tag === "loca" && transformed && length !== 0) {
      invalid("Invalid transformed WOFF2 loca table.");
    }
    decodedLength += length;
    if (decodedLength > MAX_DECOMPRESSED_FONT_BYTES) {
      invalid("The decompressed font exceeds the 128 MB import limit.");
    }
  }
  const compressedLength = view.getUint32(20);
  if (!compressedLength || cursor + compressedLength > bytes.length) {
    invalid("The WOFF2 compressed data is truncated.");
  }
  // Metadata and private blocks are optional; never decompress them here.
  for (const offsetField of [28, 40]) {
    const offset = view.getUint32(offsetField);
    const length = view.getUint32(offsetField + 4);
    if (
      offset === 0
        ? length !== 0
        : offset < cursor + compressedLength || offset + length > bytes.length
    ) {
      invalid("The WOFF2 optional data block is outside the file.");
    }
  }
};

export const validateNewFontData = (data) => {
  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.length < 4)
    invalid("The file is not a font.", "unsupported_font_format");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0);
  if (SFNT_SIGNATURES.has(signature)) {
    validateSfnt(bytes, view);
  } else if (signature === 0x774f4632) {
    validateWoff2(bytes, view);
  } else {
    invalid(
      "Only TTF, OTF, and WOFF2 fonts are supported.",
      "unsupported_font_format",
    );
  }
};
