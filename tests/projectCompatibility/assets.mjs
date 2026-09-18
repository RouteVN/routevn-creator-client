import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { sha256 } from "./records.mjs";
import { baselineRoot } from "./baselines.mjs";
import { join } from "node:path";
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
function png() {
  const chunk = (name, data) => {
    const type = Buffer.from(name),
      header = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([header, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(32, 0);
  header.writeUInt32BE(16, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(16 * (1 + 32 * 3));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++)
      pixels[y * 97 + 1 + x * 3 + (x < 16 ? 0 : 1)] = 255;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function wav() {
  const bytes = Buffer.alloc(844);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(836, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(800, 40);
  return bytes;
}
export function fixtureAssets() {
  const font = readFileSync(
    join(baselineRoot(14), "static/templates/default/files/Rp37wKfpY5os"),
  );
  return [
    [
      "file-one",
      "image/png",
      png(),
      "CC0; generated 32x16 red/green two-frame image",
    ],
    [
      "sound-file-one",
      "audio/wav",
      wav(),
      "CC0; generated 50ms mono PCM silence at 8kHz",
    ],
    [
      "font-file-one",
      "font/woff2",
      font,
      "SIL Open Font License; Noto Sans from pinned schema-14 template static/templates/default/files/Rp37wKfpY5os",
    ],
  ].map(([id, mimeType, bytes, provenance]) => ({
    id,
    mimeType,
    size: bytes.length,
    sha256: sha256(bytes),
    base64: bytes.toString("base64"),
    provenance,
  }));
}
