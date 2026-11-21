import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const resDir = fileURLToPath(
  new URL("../android/player/app/src/main/res/", import.meta.url),
);
const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
};

const createPng = (size) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6; // 8-bit RGBA, no palette.
  const stride = size * 4 + 1;
  const pixels = Buffer.alloc(stride * size);
  const half = size * 0.25;
  const radius = size * 0.06;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(Math.abs(x + 0.5 - size / 2) - half + radius, 0);
      const dy = Math.max(Math.abs(y + 0.5 - size / 2) - half + radius, 0);
      if (dx * dx + dy * dy > radius * radius) continue;
      const offset = y * stride + 1 + x * 4;
      pixels.set([144, 144, 144, 255], offset);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

for (const [index, density] of densities.entries()) {
  const slots = [
    [`mipmap-${density}`, "ic_launcher.png", [48, 72, 96, 144, 192][index]],
    [
      `mipmap-${density}`,
      "ic_launcher_foreground.png",
      [108, 162, 216, 324, 432][index],
    ],
    [
      `drawable-${density}`,
      "splash_icon.png",
      [288, 432, 576, 864, 1152][index],
    ],
  ];
  for (const [folder, file, size] of slots) {
    const directory = path.join(resDir, folder);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, file), createPng(size));
  }
}
console.log("Generated 15 Android player placeholder PNGs.");
