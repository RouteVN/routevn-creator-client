// Plays a generated story in the built player and checks that the next
// picture is loaded before the player taps to it. Run `bun run build:bundle`
// first. Uses isolated browser profiles and a local fixture; no user projects
// change.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import { chromium, webkit } from "playwright";
import {
  createBundle,
  createBundleInstructions,
} from "../../src/deps/services/shared/projectExportService.js";

const WIDTH = 2560;
const HEIGHT = 1440;
// Each picture decodes to 14 MB, so the story holds more than the player
// keeps loaded and has to free pictures it has passed.
const PICTURE_COUNT = 14;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
const pngChunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
};
const createPng = ([red, green, blue]) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + WIDTH * 3);
  for (let x = 0; x < WIDTH; x++) {
    row.set([red, green, blue], 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(Array(HEIGHT).fill(row)))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const pictures = Array.from({ length: PICTURE_COUNT }, (_, index) => ({
  imageId: `image-${index + 1}`,
  fileId: `file-${index + 1}`,
  // Far enough apart to tell the pictures apart in a screenshot.
  color: [40 + index * 15, 250 - index * 15, (index % 3) * 100],
}));
const assets = {};
const images = {};
for (const { imageId, fileId, color } of pictures) {
  assets[fileId] = { mime: "image/png", buffer: createPng(color) };
  images[imageId] = {
    fileId,
    fileType: "image/png",
    width: WIDTH,
    height: HEIGHT,
  };
}

// One section that shows a new picture on every line and jumps back to its
// own start, so the story never ends.
const projectData = {
  screen: { width: WIDTH, height: HEIGHT, backgroundColor: "#000000" },
  resources: {
    images,
    controls: {
      "control-1": {
        id: "control-1",
        name: "Control",
        keyboard: { ctrl: { actions: { startSkipMode: {} } } },
        keyup: { ctrl: { actions: { stopSkipMode: {} } } },
        elements: [
          {
            id: "tap-area",
            type: "rect",
            x: 0,
            y: 0,
            width: WIDTH,
            height: HEIGHT,
            click: { payload: { actions: { nextLine: {} } } },
          },
        ],
      },
    },
  },
  story: {
    initialSceneId: "scene-1",
    scenes: {
      "scene-1": {
        name: "Scene One",
        initialSectionId: "section-1",
        sections: {
          "section-1": {
            name: "Section One",
            lines: [
              ...pictures.map(({ imageId }, index) => {
                const actions = {
                  background: { resourceId: imageId, resourceType: "image" },
                };
                if (index === 0) {
                  actions.control = {
                    resourceId: "control-1",
                    resourceType: "control",
                  };
                }
                return { id: `line-${index + 1}`, actions };
              }),
              {
                id: "line-jump",
                actions: {
                  sectionTransition: {
                    sceneId: "scene-1",
                    sectionId: "section-1",
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
};

const bundle = await createBundle(
  createBundleInstructions({
    projectData,
    bundler: { appVersion: "test" },
    project: { namespace: "project-one", title: "Project One" },
  }),
  assets,
);
const manifestLength = new DataView(bundle.buffer).getUint32(1, false);
const manifest = JSON.parse(
  new TextDecoder().decode(bundle.subarray(16, 16 + manifestLength)),
);
const fileIdByRangeStart = new Map(
  pictures.map(({ fileId }) => [
    16 +
      manifestLength +
      manifest.chunks[manifest.assets[fileId].chunks[0]].start,
    fileId,
  ]),
);

const playerDir = new URL(
  process.env.PLAYER_DIR ?? "../../static/bundle/",
  import.meta.url,
);
const indexHtml = await readFile(new URL("index.html", playerDir));
const mainJs = await readFile(new URL("main.js", playerDir));

// Counts how often each picture is read, and can stop answering reads.
let readCounts = new Map();
let holdReads = false;
let heldReads = [];
const server = createServer((request, response) => {
  if (request.url === "/main.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(mainJs);
    return;
  }
  if (request.url === "/package.bin") {
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range);
    const fileId = fileIdByRangeStart.get(Number(start));
    const send = () => {
      response.writeHead(206, {
        "cache-control": "no-store",
        "content-range": `bytes ${start}-${end}/${bundle.length}`,
      });
      response.end(bundle.subarray(Number(start), Number(end) + 1));
      if (fileId) {
        readCounts.set(fileId, (readCounts.get(fileId) ?? 0) + 1);
      }
    };
    if (holdReads) heldReads.push(send);
    else send();
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(indexHtml);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const totalReads = () =>
  Array.from(readCounts.values()).reduce((sum, count) => sum + count, 0);

const until = async (description, check, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out waiting for ${description}; last saw ${last}`);
};

try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BROWSER && process.env.BROWSER !== name) continue;
    readCounts = new Map();
    holdReads = false;
    heldReads = [];
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 640, height: 360 },
      });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const readShownColor = async () => {
        const screenshot = await page.screenshot({
          clip: { x: 318, y: 178, width: 4, height: 4 },
        });
        return page.evaluate(async (base64) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes]));
          const canvas = new OffscreenCanvas(4, 4);
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0);
          return Array.from(context.getImageData(1, 1, 1, 1).data.slice(0, 3));
        }, screenshot.toString("base64"));
      };
      const showsPicture = async (index) => {
        const shown = await readShownColor();
        const { color } = pictures[index];
        return (
          color.every((value, i) => Math.abs(value - shown[i]) <= 6) ||
          `color ${shown}, expected ${color}`
        );
      };
      const tap = () => page.mouse.click(320, 180);
      const assertPlayerRunning = async () => {
        assert.deepEqual(pageErrors, []);
        assert.equal(await page.locator("#loading.error").count(), 0);
      };

      await page.goto(origin);
      await page.locator("#loading.ready").waitFor();
      await tap();
      await until("the first picture", () => showsPicture(0));

      // The pictures after the first load without a tap. Half of the limit
      // of 160 MB is planned ahead: the shown picture and the next four.
      await until("the next pictures to be read", () =>
        [1, 2, 3, 4].every((i) => readCounts.has(pictures[i].fileId)),
      );
      assert.equal(readCounts.has(pictures[5].fileId), false);

      // With package reads unanswered, a tap can only show a picture that is
      // already loaded.
      holdReads = true;
      for (const index of [1, 2, 3, 4]) {
        await tap();
        await until(`picture ${index + 1} with reads on hold`, () =>
          showsPicture(index),
        );
      }
      holdReads = false;
      heldReads.splice(0).forEach((send) => send());

      // Tapping faster than pictures load still leaves a working player.
      for (let count = 0; count < 12; count++) {
        await tap();
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(1500);
      await assertPlayerRunning();
      const shown = await readShownColor();
      let position = pictures.findIndex(({ color }) =>
        color.every((value, i) => Math.abs(value - shown[i]) <= 6),
      );
      assert.notEqual(position, -1, `Unknown picture color ${shown}`);

      // Two more rounds of the story. More pictures pass than stay loaded,
      // so each one is freed, read again, and still shown correctly.
      for (let count = 0; count < PICTURE_COUNT * 2; count++) {
        position = (position + 1) % PICTURE_COUNT;
        await tap();
        await until(`picture ${position + 1} after it was freed`, () =>
          showsPicture(position),
        );
      }
      await assertPlayerRunning();
      for (const { fileId } of pictures) {
        assert.ok(
          readCounts.get(fileId) >= 2,
          `${fileId} was read ${readCounts.get(fileId)} time(s), so it was never freed`,
        );
      }

      // Skip mode runs through the lines already read, faster than pictures
      // load, and passes the memory limit several times.
      const readsBeforeSkip = totalReads();
      await page.keyboard.down("Control");
      await page.waitForTimeout(8000);
      await page.keyboard.up("Control");
      // Screens that waited for their pictures are still drawn in order
      // after skip mode stops, so wait for the picture to stop changing.
      let lastColor = "";
      let unchangedSince = Date.now();
      await until(
        "the screen to settle after skip mode",
        async () => {
          const color = (await readShownColor()).join();
          if (color !== lastColor) {
            lastColor = color;
            unchangedSince = Date.now();
          }
          return Date.now() - unchangedSince > 2000 || color;
        },
        60_000,
      );
      await assertPlayerRunning();
      assert.ok(
        totalReads() > readsBeforeSkip,
        "Skip mode did not move past the pictures that were loaded",
      );

      // The story continues in order from wherever skip mode stopped.
      const shownAfterSkip = await readShownColor();
      position = pictures.findIndex(({ color }) =>
        color.every((value, i) => Math.abs(value - shownAfterSkip[i]) <= 6),
      );
      assert.notEqual(position, -1, `Unknown picture color ${shownAfterSkip}`);
      for (let count = 0; count < 3; count++) {
        position = (position + 1) % PICTURE_COUNT;
        await tap();
        await until(`picture ${position + 1} after skip mode`, () =>
          showsPicture(position),
        );
      }
      await assertPlayerRunning();
      console.log(
        `${name}: preload, fast taps, freeing pictures, and skip mode passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
