// Runs in a browser page, bundled by the spritesheet browser tests in
// tests/spritesheets/. It runs sheets through the app's own import, frame
// extraction, and save code, and compares the pictures each animation plays.
//
// runSpritesheetFormatCase draws a sheet and JSON in each format the import
// supports. Every frame is a picture the harness drew, so each check compares
// real pixels with what the frame should show: a frame cut, turned, or
// ordered wrongly fails.
//
// runSpritesheetSampleCheck takes a sheet exported by a sprite tool, and
// checks that every animation plays the same pictures after each kind of
// save as it did when imported.
import { parseSpritesheetImport } from "../../src/internal/spritesheetAtlas.js";
import {
  buildAnimationsFromSourceIndexes,
  clipsFromAnimations,
  getSpritesheetFrameCrops,
  getUnusedFrameKeys,
} from "../../src/internal/spritesheetFrames.js";
import {
  cropSpritesheetFrames,
  loadImageFromUrl,
} from "../../src/deps/clients/web/spritesheetCanvas.js";
import { createSpritesheetFramesService } from "../../src/deps/services/shared/spritesheetFramesService.js";

const SHEET_ROW_LIMIT = 256;

const createCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d") };
};

const toPngBlob = (canvas) =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

// A picture's pixels, read through an image element as the app reads them.
// On a busy machine, WebKit's createImageBitmap sometimes returned another
// picture's pixels, which failed checks the app's own pictures passed.
const readPixels = async (blob) => {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImageFromUrl(url);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const { context } = createCanvas(width, height);
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    return { width, height, context, data };
  } finally {
    URL.revokeObjectURL(url);
  }
};

// A frame picture: an opaque block in a color of its own with a dark mark in
// its top-left corner, so a frame turned the wrong way does not match.
// `margin` leaves transparent space around it, which a trimmed sheet cuts
// away.
const drawFramePicture = ({ index, width, height, margin = 0 }) => {
  const { canvas, context } = createCanvas(width, height);
  const innerWidth = width - margin * 2;
  const innerHeight = height - margin * 2;
  context.fillStyle = `hsl(${(index * 47) % 360} 80% 50%)`;
  context.fillRect(margin, margin, innerWidth, innerHeight);
  context.fillStyle = "#101010";
  context.fillRect(
    margin,
    margin,
    Math.max(2, Math.floor(innerWidth / 4)),
    Math.max(2, Math.floor(innerHeight / 3)),
  );
  return canvas;
};

// What a picture shows: its size and a hash of its pixels. Fully transparent
// pixels count as one color, whatever a canvas stored for their RGB.
const getBlobSignature = async (blob) => {
  const { width, height, data } = await readPixels(blob);
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    for (const value of alpha === 0
      ? [0, 0, 0, 0]
      : [data[index], data[index + 1], data[index + 2], alpha]) {
      hash = Math.imul(hash ^ value, 16777619);
    }
  }
  return `${width}x${height}:${(hash >>> 0).toString(16)}`;
};

// Draws frames onto sheets as TexturePacker does: rows of regions, a trimmed
// frame without its transparent margin, and a rotated frame turned 90 degrees
// clockwise. Returns the sheet and each frame's atlas entry.
const drawSheet = async (frames) => {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placed = frames.map((frame) => {
    const margin = frame.trimmed ? frame.margin : 0;
    const sourceWidth = frame.width - margin * 2;
    const sourceHeight = frame.height - margin * 2;
    const regionWidth = frame.rotated ? sourceHeight : sourceWidth;
    const regionHeight = frame.rotated ? sourceWidth : sourceHeight;
    if (x > 0 && x + regionWidth > SHEET_ROW_LIMIT) {
      x = 0;
      y += rowHeight + 1;
      rowHeight = 0;
    }
    const placement = { x, y, margin, sourceWidth, sourceHeight, regionWidth };
    x += regionWidth + 1;
    rowHeight = Math.max(rowHeight, regionHeight);
    return placement;
  });
  const sheetWidth = Math.max(
    ...placed.map((placement) => placement.x + placement.regionWidth),
  );
  const sheetHeight = y + rowHeight;
  const { canvas, context } = createCanvas(sheetWidth, sheetHeight);

  const entries = frames.map((frame, index) => {
    const {
      x: frameX,
      y: frameY,
      margin,
      sourceWidth,
      sourceHeight,
    } = placed[index];
    const picture = drawFramePicture({ ...frame, margin: frame.margin ?? 0 });
    if (frame.rotated) {
      // Turned 90 degrees clockwise: the picture's top-left corner lands at
      // the region's top-right corner.
      context.setTransform(0, 1, -1, 0, frameX + sourceHeight, frameY);
      context.drawImage(
        picture,
        margin,
        margin,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight,
      );
    } else {
      context.drawImage(
        picture,
        margin,
        margin,
        sourceWidth,
        sourceHeight,
        frameX,
        frameY,
        sourceWidth,
        sourceHeight,
      );
    }
    context.setTransform(1, 0, 0, 1, 0, 0);

    return {
      frame: { x: frameX, y: frameY, w: sourceWidth, h: sourceHeight },
      rotated: Boolean(frame.rotated),
      trimmed: Boolean(frame.trimmed),
      spriteSourceSize: {
        x: margin,
        y: margin,
        w: sourceWidth,
        h: sourceHeight,
      },
      sourceSize: { w: frame.width, h: frame.height },
    };
  });

  return {
    blob: await toPngBlob(canvas),
    size: { w: sheetWidth, h: sheetHeight },
    entries,
  };
};

const sizedFrames = (names, { width, height, start = 0, ...rest }) =>
  names.map((name, index) => ({
    name,
    width,
    height,
    index: start + index,
    ...rest,
  }));

const textureFrames = (frames, entries) =>
  frames.map((frame, index) => ({ filename: frame.name, ...entries[index] }));

const hashFrames = (frames, entries) =>
  Object.fromEntries(
    frames.map((frame, index) => [frame.name, entries[index]]),
  );

// Each case draws its sheets and JSON, and names the frames each animation
// should play, in order.
const CASES = {
  "TexturePacker hash with animations": async () => {
    const frames = [
      ...sizedFrames(["walk_0.png", "walk_1.png", "walk_2.png", "walk_3.png"], {
        width: 32,
        height: 32,
      }),
      ...sizedFrames(["idle_0.png", "idle_1.png"], {
        width: 32,
        height: 32,
        start: 4,
      }),
      // In the sheet but in no animation: saving keeps it.
      ...sizedFrames(["extra.png"], { width: 16, height: 16, start: 6 }),
    ];
    const sheet = await drawSheet(frames);
    const clips = {
      walk: ["walk_0.png", "walk_1.png", "walk_2.png", "walk_3.png"],
      idle: ["idle_0.png", "idle_1.png", "idle_0.png"],
    };
    return {
      frames,
      pngs: [{ name: "hero.png", blob: sheet.blob }],
      json: {
        frames: hashFrames(frames, sheet.entries),
        animations: clips,
        meta: { image: "hero.png", size: sheet.size, scale: "1" },
      },
      clips,
    };
  },

  "TexturePacker array, animations from frame names": async () => {
    const frames = [
      ...sizedFrames(["run_01.png", "run_02.png", "run_03.png", "run_04.png"], {
        width: 24,
        height: 40,
      }),
      ...sizedFrames(["jump_01.png", "jump_02.png"], {
        width: 24,
        height: 40,
        start: 4,
      }),
      ...sizedFrames(["pose.png"], { width: 24, height: 40, start: 6 }),
    ];
    const sheet = await drawSheet(frames);
    return {
      frames,
      pngs: [{ name: "runner.png", blob: sheet.blob }],
      json: {
        frames: textureFrames(frames, sheet.entries),
        meta: { image: "runner.png", size: sheet.size, scale: "1" },
      },
      clips: {
        run: ["run_01.png", "run_02.png", "run_03.png", "run_04.png"],
        jump: ["jump_01.png", "jump_02.png"],
        pose: ["pose.png"],
      },
    };
  },

  "Rotated frames": async () => {
    const frames = sizedFrames(["spin_0", "spin_1", "spin_2", "spin_3"], {
      width: 40,
      height: 24,
    }).map((frame, index) => ({ ...frame, rotated: index % 2 === 1 }));
    const sheet = await drawSheet(frames);
    const clips = { spin: ["spin_0", "spin_1", "spin_2", "spin_3"] };
    return {
      frames,
      pngs: [{ name: "spin.png", blob: sheet.blob }],
      json: {
        frames: hashFrames(frames, sheet.entries),
        animations: clips,
        meta: { image: "spin.png", size: sheet.size, scale: "1" },
      },
      clips,
    };
  },

  "Trimmed frames": async () => {
    const frames = sizedFrames(
      ["blink_0.png", "blink_1.png", "blink_2.png", "blink_3.png"],
      { width: 48, height: 40, margin: 6, trimmed: true },
    ).map((frame, index) => ({ ...frame, rotated: index === 2 }));
    const sheet = await drawSheet(frames);
    const clips = {
      blink: ["blink_0.png", "blink_1.png", "blink_2.png", "blink_3.png"],
    };
    return {
      frames,
      pngs: [{ name: "blink.png", blob: sheet.blob }],
      json: {
        frames: hashFrames(frames, sheet.entries),
        animations: clips,
        meta: { image: "blink.png", size: sheet.size, scale: "1" },
      },
      clips,
    };
  },

  "Aseprite tags": async () => {
    const names = [0, 1, 2, 3, 4, 5].map((index) => `hero ${index}.aseprite`);
    const frames = sizedFrames(names, { width: 32, height: 32 });
    const sheet = await drawSheet(frames);
    const json = {
      frames: Object.fromEntries(
        frames.map((frame, index) => [
          frame.name,
          { ...sheet.entries[index], duration: 100 },
        ]),
      ),
      meta: {
        app: "https://www.aseprite.org/",
        image: "hero.png",
        size: sheet.size,
        scale: "1",
        frameTags: [
          { name: "run", from: 0, to: 2, direction: "forward" },
          { name: "hit", from: 3, to: 5, direction: "pingpong" },
          { name: "back", from: 0, to: 2, direction: "reverse" },
          { name: "bounce", from: 3, to: 5, direction: "pingpong_reverse" },
        ],
      },
    };
    return {
      frames,
      pngs: [{ name: "hero.png", blob: sheet.blob }],
      json,
      clips: {
        run: [names[0], names[1], names[2]],
        hit: [names[3], names[4], names[5], names[4]],
        back: [names[2], names[1], names[0]],
        bounce: [names[5], names[4], names[3], names[4]],
      },
    };
  },

  "Phaser 3, one image": async () => {
    const frames = [
      ...sizedFrames(
        ["attack/0001", "attack/0002", "attack/0003", "attack/0004"],
        { width: 36, height: 28 },
      ),
      ...sizedFrames(["idle/0001", "idle/0002"], {
        width: 36,
        height: 28,
        start: 4,
      }),
    ];
    const sheet = await drawSheet(frames);
    return {
      frames,
      pngs: [{ name: "knight.png", blob: sheet.blob }],
      json: {
        textures: [
          {
            image: "knight.png",
            format: "RGBA8888",
            size: sheet.size,
            scale: 1,
            frames: textureFrames(frames, sheet.entries),
          },
        ],
        meta: { app: "https://www.codeandweb.com/texturepacker" },
      },
      clips: {
        attack: ["attack/0001", "attack/0002", "attack/0003", "attack/0004"],
        idle: ["idle/0001", "idle/0002"],
      },
    };
  },

  "Phaser 3, several images": async () => {
    const names = [1, 2, 3, 4, 5, 6].map((index) => `walk_0${index}.png`);
    const frames = sizedFrames(names, { width: 30, height: 30 });
    const first = await drawSheet(frames.slice(0, 3));
    const second = await drawSheet(frames.slice(3));
    return {
      frames,
      pngs: [
        { name: "walker-0.png", blob: first.blob },
        { name: "walker-1.png", blob: second.blob },
      ],
      json: {
        textures: [
          {
            image: "walker-0.png",
            size: first.size,
            scale: 1,
            frames: textureFrames(frames.slice(0, 3), first.entries),
          },
          {
            image: "walker-1.png",
            size: second.size,
            scale: 1,
            frames: textureFrames(frames.slice(3), second.entries),
          },
        ],
        meta: { app: "https://www.codeandweb.com/texturepacker" },
      },
      clips: { walk: names },
    };
  },

  // Sheet order is 10 down to 0. Bare-number frame names would be listed in
  // number order instead and play backwards.
  "Frames named with numbers": async () => {
    const names = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(
      (index) => `${index}.png`,
    );
    const frames = sizedFrames(names, { width: 20, height: 20 });
    const sheet = await drawSheet(frames);
    return {
      frames,
      pngs: [{ name: "count.png", blob: sheet.blob }],
      json: {
        frames: hashFrames(frames, sheet.entries),
        meta: { image: "count.png", size: sheet.size, scale: "1" },
      },
      clips: { default: names },
    };
  },

  "Animations of different sizes": async () => {
    const frames = [
      ...sizedFrames(["fish_0.png", "fish_1.png", "fish_2.png"], {
        width: 48,
        height: 24,
      }),
      ...sizedFrames(["crab_0.png", "crab_1.png"], {
        width: 24,
        height: 24,
        start: 3,
      }),
    ];
    const sheet = await drawSheet(frames);
    const clips = {
      fish: ["fish_0.png", "fish_1.png", "fish_2.png"],
      crab: ["crab_0.png", "crab_1.png"],
    };
    return {
      frames,
      pngs: [{ name: "sea.png", blob: sheet.blob }],
      json: {
        frames: hashFrames(frames, sheet.entries),
        animations: clips,
        meta: { image: "sea.png", size: sheet.size, scale: "1" },
      },
      clips,
    };
  },
};

// Project files kept in memory, as the service reads and uploads them.
const createFileStore = () => {
  const files = new Map();
  let nextId = 1;
  const add = (blob) => {
    const fileId = `file-${nextId}`;
    nextId += 1;
    files.set(fileId, blob);
    return fileId;
  };
  return {
    files,
    add,
    getFileContent: async (fileId) => {
      const url = URL.createObjectURL(files.get(fileId));
      return { url, revoke: () => URL.revokeObjectURL(url) };
    },
    uploadFiles: async (uploads) =>
      uploads.map((file) => {
        const fileId = add(file);
        return { file, fileId, fileRecords: [{ id: fileId }] };
      }),
  };
};

// The picture the engine shows at each step of each animation: animation
// frame `i` is the atlas frame at position `i` among the frame names.
const getPlayedSignatures = async ({ item, fileStore }) => {
  const url = URL.createObjectURL(fileStore.files.get(item.fileId));
  try {
    const crops = getSpritesheetFrameCrops(item.jsonData);
    const blobs = await cropSpritesheetFrames({ url, crops });
    const signatures = await Promise.all(blobs.map(getBlobSignature));
    return Object.fromEntries(
      Object.entries(item.animations).map(([clipName, animation]) => [
        clipName,
        animation.frames.map((index) => signatures[index]),
      ]),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

const compareSequences = (label, actual, expected, problems) => {
  for (const [clipName, expectedSignatures] of Object.entries(expected)) {
    const actualSignatures = actual[clipName] ?? [];
    if (actualSignatures.length !== expectedSignatures.length) {
      problems.push(
        `${label}: ${clipName} plays ${actualSignatures.length} frames, expected ${expectedSignatures.length}`,
      );
      continue;
    }
    const wrongStep = expectedSignatures.findIndex(
      (signature, step) => actualSignatures[step] !== signature,
    );
    if (wrongStep >= 0) {
      problems.push(
        `${label}: ${clipName} step ${wrongStep} shows ${actualSignatures[wrongStep]}, expected ${expectedSignatures[wrongStep]}`,
      );
    }
  }
};

export const SPRITESHEET_FORMAT_CASES = Object.keys(CASES);

// Imports a case and edits it as the spritesheet editor does. Returns the
// animations the import made, `{ name: frameCount }`, and any problems found.
export const runSpritesheetFormatCase = async (caseName) => {
  const fixture = await CASES[caseName]();
  const problems = [];
  const fileStore = createFileStore();
  const service = createSpritesheetFramesService({
    getFileContent: fileStore.getFileContent,
    uploadFiles: fileStore.uploadFiles,
  });

  const pictureSignatures = new Map();
  for (const frame of fixture.frames) {
    pictureSignatures.set(
      frame.name,
      await getBlobSignature(
        await toPngBlob(drawFramePicture({ ...frame, margin: frame.margin })),
      ),
    );
  }
  const expectedPlayed = Object.fromEntries(
    Object.entries(fixture.clips).map(([clipName, names]) => [
      clipName,
      names.map((name) => pictureSignatures.get(name)),
    ]),
  );

  // Import, merging a sheet split over several images first.
  const combined = await service.combineSpritesheetSourceFiles({
    pngFiles: fixture.pngs.map(
      ({ name, blob }) => new File([blob], name, { type: "image/png" }),
    ),
    atlasFile: new File([JSON.stringify(fixture.json)], "sheet.json", {
      type: "application/json",
    }),
  });
  const imported = await parseSpritesheetImport(combined);
  const item = {
    fileId: fileStore.add(combined.pngFile),
    jsonData: imported.jsonData,
    animations: imported.animations,
  };
  const animations = Object.fromEntries(
    Object.entries(imported.animations).map(([clipName, animation]) => [
      clipName,
      animation.frames.length,
    ]),
  );
  const clipNames = Object.keys(animations).sort().join(", ");
  const expectedClipNames = Object.keys(fixture.clips).sort().join(", ");
  if (clipNames !== expectedClipNames) {
    problems.push(
      `imported: animations are ${clipNames}, expected ${expectedClipNames}`,
    );
  }
  compareSequences(
    "imported",
    await getPlayedSignatures({ item, fileStore }),
    expectedPlayed,
    problems,
  );

  // Open it in the editor: the sheet is cut into one picture per frame.
  const extracted = await service.extractSpritesheetFrames({
    fileId: item.fileId,
    jsonData: item.jsonData,
  });
  const atlasNames = Object.keys(item.jsonData.frames);
  for (const [index, frame] of extracted.entries()) {
    const signature = await getBlobSignature(frame.file);
    const expected = pictureSignatures.get(atlasNames[index]);
    if (signature !== expected) {
      problems.push(
        `opened: frame ${atlasNames[index]} is ${signature}, expected ${expected}`,
      );
    }
  }
  let nextKey = 0;
  const createKey = (prefix) => {
    nextKey += 1;
    return `${prefix}${nextKey}`;
  };
  const frames = extracted.map((frame, index) => ({
    ...frame,
    key: createKey("frame"),
    sourceIndex: index,
  }));
  const clips = clipsFromAnimations({
    animations: item.animations,
    frameKeys: frames.map((frame) => frame.key),
    createEntryKey: () => createKey("entry"),
    missingClipFps: 24,
  });
  const keepFrameKeys = getUnusedFrameKeys({ frames, clips });
  const [firstClip] = clips;
  const firstClipNames = fixture.clips[firstClip.name];

  // Swapping two frames only changes the animation, so the sheet stays.
  const swappedClips = clips.map((clip) =>
    clip === firstClip
      ? {
          ...clip,
          entries: [clip.entries[1], clip.entries[0], ...clip.entries.slice(2)],
        }
      : clip,
  );
  const swappedAnimations = buildAnimationsFromSourceIndexes({
    frames,
    clips: swappedClips,
  });
  if (!swappedAnimations) {
    problems.push("reordered: needed a new sheet");
  } else {
    const expectedSwapped = structuredClone(expectedPlayed);
    expectedSwapped[firstClip.name] = expandHolds(
      swappedClips[0],
      frames,
      pictureSignatures,
      atlasNames,
    );
    compareSequences(
      "reordered",
      await getPlayedSignatures({
        item: { ...item, animations: swappedAnimations },
        fileStore,
      }),
      expectedSwapped,
      problems,
    );
  }

  // Adding a picture makes a new sheet from the frames.
  const firstFrame = fixture.frames.find(
    (frame) => frame.name === firstClipNames[0],
  );
  const addedPicture = await toPngBlob(
    drawFramePicture({
      index: 99,
      width: firstFrame.width,
      height: firstFrame.height,
    }),
  );
  const addedFrame = {
    key: createKey("frame"),
    name: "added",
    file: new File([addedPicture], "added.png", { type: "image/png" }),
    url: URL.createObjectURL(addedPicture),
    width: firstFrame.width,
    height: firstFrame.height,
  };
  const editedClips = clips.map((clip) =>
    clip === firstClip
      ? {
          ...clip,
          entries: [
            ...clip.entries,
            { key: createKey("entry"), frameKey: addedFrame.key, hold: 1 },
          ],
        }
      : clip,
  );
  const built = await service.buildSpritesheetFromFrames({
    frames: [...frames, addedFrame],
    clips: editedClips,
    keepFrameKeys,
    name: "Saved",
  });
  const saved = {
    fileId: built.data.fileId,
    jsonData: built.data.jsonData,
    animations: built.data.animations,
  };
  const expectedSaved = structuredClone(expectedPlayed);
  expectedSaved[firstClip.name].push(await getBlobSignature(addedPicture));
  compareSequences(
    "saved",
    await getPlayedSignatures({ item: saved, fileStore }),
    expectedSaved,
    problems,
  );
  const savedFrameCount = Object.keys(saved.jsonData.frames).length;
  if (savedFrameCount !== atlasNames.length + 1) {
    problems.push(
      `saved: the sheet has ${savedFrameCount} frames, expected ${atlasNames.length + 1}`,
    );
  }

  // Opening the saved spritesheet again loads its frame pictures.
  const reopened = await service.loadSpritesheetFrameFileIds({
    fileIds: built.data.frameSource.frames.map((frame) => frame.fileId),
  });
  const savedCrops = await cropSpritesheetFrames({
    url: URL.createObjectURL(fileStore.files.get(saved.fileId)),
    crops: getSpritesheetFrameCrops(saved.jsonData),
  });
  for (const [index, frame] of reopened.entries()) {
    const signature = await getBlobSignature(fileStore.files.get(frame.fileId));
    const expected = await getBlobSignature(savedCrops[index]);
    if (signature !== expected) {
      problems.push(
        `reopened: frame ${index} is ${signature}, the saved sheet has ${expected}`,
      );
    }
  }

  return { animations, problems };
};

// The pictures a clip plays, with each frame repeated for its hold.
function expandHolds(clip, frames, pictureSignatures, atlasNames) {
  const sourceIndexByKey = new Map(
    frames.map((frame) => [frame.key, frame.sourceIndex]),
  );
  return clip.entries.flatMap((entry) =>
    Array.from({ length: entry.hold }, () =>
      pictureSignatures.get(atlasNames[sourceIndexByKey.get(entry.frameKey)]),
    ),
  );
}

// A picture's pixels. With `content`, only the box around its visible
// pixels, so a picture centered in a larger cell still matches.
const readPicture = async (blob, { content = false } = {}) => {
  const { width, height, context, data } = await readPixels(blob);
  if (!content) {
    return { width, height, data };
  }

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) {
    return { width: 0, height: 0, data: new Uint8ClampedArray() };
  }
  return {
    width: right - left + 1,
    height: bottom - top + 1,
    data: context.getImageData(left, top, right - left + 1, bottom - top + 1)
      .data,
  };
};

// How far apart two pictures are: the largest difference in any pixel's
// alpha or premultiplied color, or Infinity when their sizes differ. A canvas
// stores premultiplied pixels, so a partly transparent pixel can shift
// slightly each time a picture is drawn and saved.
const getPictureDifference = (left, right) => {
  if (
    !left ||
    !right ||
    left.width !== right.width ||
    left.height !== right.height
  ) {
    return Infinity;
  }
  let difference = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    const leftAlpha = left.data[index + 3];
    const rightAlpha = right.data[index + 3];
    difference = Math.max(difference, Math.abs(leftAlpha - rightAlpha));
    for (let channel = 0; channel < 3; channel += 1) {
      const leftValue = (left.data[index + channel] * leftAlpha) / 255;
      const rightValue = (right.data[index + channel] * rightAlpha) / 255;
      difference = Math.max(difference, Math.abs(leftValue - rightValue));
    }
  }
  return difference;
};

// WebKit drifts by up to about 2 steps on soft edges; a wrong frame differs
// by far more.
const PICTURE_TOLERANCE = 3;

const samePicture = (left, right) =>
  getPictureDifference(left, right) <= PICTURE_TOLERANCE;

const describePicture = (picture) =>
  picture ? `${picture.width}x${picture.height}` : "nothing";

// Every atlas frame of a sheet, as the engine cuts it.
const readFramePictures = async ({ item, fileStore, content = false }) => {
  const url = URL.createObjectURL(fileStore.files.get(item.fileId));
  try {
    const blobs = await cropSpritesheetFrames({
      url,
      crops: getSpritesheetFrameCrops(item.jsonData),
    });
    return Promise.all(blobs.map((blob) => readPicture(blob, { content })));
  } finally {
    URL.revokeObjectURL(url);
  }
};

const playPictures = (animations, pictures) =>
  Object.fromEntries(
    Object.entries(animations).map(([clipName, animation]) => [
      clipName,
      animation.frames.map((index) => pictures[index]),
    ]),
  );

const comparePlayed = (label, actual, expected, problems) => {
  for (const [clipName, expectedPictures] of Object.entries(expected)) {
    const actualPictures = actual[clipName] ?? [];
    if (actualPictures.length !== expectedPictures.length) {
      problems.push(
        `${label}: ${clipName} plays ${actualPictures.length} frames, expected ${expectedPictures.length}`,
      );
      continue;
    }
    const wrongStep = expectedPictures.findIndex(
      (picture, step) => !samePicture(actualPictures[step], picture),
    );
    if (wrongStep >= 0) {
      const difference = getPictureDifference(
        actualPictures[wrongStep],
        expectedPictures[wrongStep],
      );
      problems.push(
        `${label}: ${clipName} step ${wrongStep} shows a different picture (${describePicture(actualPictures[wrongStep])}, expected ${describePicture(expectedPictures[wrongStep])}, off by ${difference.toFixed(1)})`,
      );
    }
  }
};

const fetchFile = async ({ name, url }, type) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read ${name}`);
  }
  return new File([await response.blob()], name, { type });
};

// Imports a sheet exported by a sprite tool, then saves it as the
// spritesheet editor does, checking the pictures each animation plays after
// every step. `pngs` and `json` are `{ name, url }`.
export const runSpritesheetSampleCheck = async ({ pngs, json }) => {
  const problems = [];
  const fileStore = createFileStore();
  const service = createSpritesheetFramesService({
    getFileContent: fileStore.getFileContent,
    uploadFiles: fileStore.uploadFiles,
  });

  // Import, merging a sheet split over several images first.
  const combined = await service.combineSpritesheetSourceFiles({
    pngFiles: await Promise.all(pngs.map((png) => fetchFile(png, "image/png"))),
    atlasFile: await fetchFile(json, "application/json"),
  });
  const imported = await parseSpritesheetImport(combined);
  const item = {
    fileId: fileStore.add(combined.pngFile),
    jsonData: imported.jsonData,
    animations: imported.animations,
  };
  const atlasNames = Object.keys(item.jsonData.frames);
  const pictures = await readFramePictures({ item, fileStore });
  const contents = await readFramePictures({
    item,
    fileStore,
    content: true,
  });
  const playedContents = playPictures(item.animations, contents);

  // Open it in the editor: one picture per atlas frame, at its own size.
  const extracted = await service.extractSpritesheetFrames({
    fileId: item.fileId,
    jsonData: item.jsonData,
  });
  if (extracted.length !== atlasNames.length) {
    problems.push(
      `opened: ${extracted.length} frames, expected ${atlasNames.length}`,
    );
  }
  for (const [index, frame] of extracted.entries()) {
    if (
      frame.width !== pictures[index].width ||
      frame.height !== pictures[index].height
    ) {
      problems.push(
        `opened: frame ${atlasNames[index]} is ${frame.width}x${frame.height}, expected ${describePicture(pictures[index])}`,
      );
    }
  }
  let nextKey = 0;
  const createKey = (prefix) => {
    nextKey += 1;
    return `${prefix}${nextKey}`;
  };
  const frames = extracted.map((frame, index) => ({
    ...frame,
    key: createKey("frame"),
    sourceIndex: index,
  }));
  const clips = clipsFromAnimations({
    animations: item.animations,
    frameKeys: frames.map((frame) => frame.key),
    createEntryKey: () => createKey("entry"),
    missingClipFps: 24,
  });
  const keepFrameKeys = getUnusedFrameKeys({ frames, clips });
  const pictureByFrameKey = new Map(
    frames.map((frame) => [frame.key, pictures[frame.sourceIndex]]),
  );

  // Swapping two frames saves just the animations, on the same sheet.
  const swapClip = clips.find((clip) => clip.entries.length > 1) ?? clips[0];
  const swappedClips = clips.map((clip) =>
    clip === swapClip && clip.entries.length > 1
      ? {
          ...clip,
          entries: [clip.entries[1], clip.entries[0], ...clip.entries.slice(2)],
        }
      : clip,
  );
  const swappedAnimations = buildAnimationsFromSourceIndexes({
    frames,
    clips: swappedClips,
  });
  if (!swappedAnimations) {
    problems.push("reordered: needed a new sheet");
  } else {
    const expected = Object.fromEntries(
      swappedClips.map((clip) => [
        clip.name,
        clip.entries.flatMap((entry) =>
          Array.from({ length: entry.hold }, () =>
            pictureByFrameKey.get(entry.frameKey),
          ),
        ),
      ]),
    );
    comparePlayed(
      "reordered",
      playPictures(swappedAnimations, pictures),
      expected,
      problems,
    );
  }

  // Adding a picture to the first animation makes a new sheet.
  const [firstClip] = clips;
  const firstPicture = pictureByFrameKey.get(firstClip.entries[0].frameKey);
  const addedBlob = await toPngBlob(
    drawFramePicture({
      index: 99,
      width: firstPicture.width,
      height: firstPicture.height,
    }),
  );
  const addedFrame = {
    key: createKey("frame"),
    name: "added",
    file: new File([addedBlob], "added.png", { type: "image/png" }),
    url: URL.createObjectURL(addedBlob),
    width: firstPicture.width,
    height: firstPicture.height,
  };
  const built = await service.buildSpritesheetFromFrames({
    frames: [...frames, addedFrame],
    clips: clips.map((clip) =>
      clip === firstClip
        ? {
            ...clip,
            entries: [
              ...clip.entries,
              { key: createKey("entry"), frameKey: addedFrame.key, hold: 1 },
            ],
          }
        : clip,
    ),
    keepFrameKeys,
    name: "Saved",
  });
  const saved = {
    fileId: built.data.fileId,
    jsonData: built.data.jsonData,
    animations: built.data.animations,
  };
  const savedPictures = await readFramePictures({ item: saved, fileStore });
  const expectedSaved = { ...playedContents };
  expectedSaved[firstClip.name] = [
    ...playedContents[firstClip.name],
    await readPicture(addedBlob, { content: true }),
  ];
  comparePlayed(
    "saved",
    playPictures(
      saved.animations,
      await readFramePictures({ item: saved, fileStore, content: true }),
    ),
    expectedSaved,
    problems,
  );
  const savedFrameCount = Object.keys(saved.jsonData.frames).length;
  if (savedFrameCount !== atlasNames.length + 1) {
    problems.push(
      `saved: the sheet has ${savedFrameCount} frames, expected ${atlasNames.length + 1}`,
    );
  }
  // An animation whose pictures share one size keeps that size.
  for (const [clipName, animation] of Object.entries(item.animations)) {
    const sizes = new Set(
      animation.frames.map((index) => describePicture(pictures[index])),
    );
    const savedSizes = new Set(
      saved.animations[clipName].frames.map((index) =>
        describePicture(savedPictures[index]),
      ),
    );
    if (sizes.size === 1 && [...savedSizes].join() !== [...sizes].join()) {
      problems.push(
        `saved: ${clipName} frames are ${[...savedSizes].join(", ")}, expected ${[...sizes].join(", ")}`,
      );
    }
  }

  // Opening the saved spritesheet again loads its frame pictures.
  const reopened = await service.loadSpritesheetFrameFileIds({
    fileIds: built.data.frameSource.frames.map((frame) => frame.fileId),
  });
  // A picture smaller than its cell sits centered in it, so compare what
  // each shows.
  const savedContents = await readFramePictures({
    item: saved,
    fileStore,
    content: true,
  });
  for (const [index, frame] of reopened.entries()) {
    const picture = await readPicture(fileStore.files.get(frame.fileId), {
      content: true,
    });
    const difference = getPictureDifference(picture, savedContents[index]);
    if (difference > PICTURE_TOLERANCE) {
      problems.push(
        `reopened: frame ${index} does not match the saved sheet (${describePicture(picture)}, expected ${describePicture(savedContents[index])}, off by ${difference.toFixed(1)})`,
      );
    }
  }

  return {
    animations: Object.fromEntries(
      Object.entries(item.animations).map(([clipName, animation]) => [
        clipName,
        animation.frames.length,
      ]),
    ),
    frameCount: atlasNames.length,
    sheetSize: `${built.data.sheetWidth}x${built.data.sheetHeight}`,
    problems,
  };
};
