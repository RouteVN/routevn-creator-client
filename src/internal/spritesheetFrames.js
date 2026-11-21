import { resolveSpritesheetAnimationFps } from "./spritesheets.js";

// Pure helpers for building a spritesheet from separate frame pictures and for
// turning an existing spritesheet back into frames.
//
// A draft frame is `{ key, name, width, height }` plus where its picture comes
// from. A clip is `{ name, entries, fps, loop }`, where each entry is
// `{ key, frameKey, hold }` and `hold` repeats the frame on consecutive ticks.

export const SPRITESHEET_FRAMES_CLIP_NAME = "default";
export const SPRITESHEET_FRAME_PADDING = 2;
export const MAX_SPRITESHEET_FRAME_HOLD = 99;
// iOS WebKit refuses canvases above this many pixels.
export const MAX_SPRITESHEET_CANVAS_AREA = 16_777_216;

const FRAME_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export const compareFrameFileNames = (left = "", right = "") =>
  FRAME_NAME_COLLATOR.compare(left, right);

export const sortFrameFilesByName = (files = []) =>
  [...files].sort((left, right) =>
    compareFrameFileNames(left?.name ?? "", right?.name ?? ""),
  );

export const createUniqueFrameNames = (names = []) => {
  const usedNames = new Set();

  return names.map((name, index) => {
    const baseName = String(name ?? "").trim() || `frame_${index + 1}`;
    let uniqueName = baseName;
    let suffix = 2;
    while (usedNames.has(uniqueName)) {
      uniqueName = `${baseName}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(uniqueName);
    return uniqueName;
  });
};

export const normalizeFrameHold = (value) => {
  const hold = Math.round(Number(value));
  if (!Number.isFinite(hold) || hold < 1) {
    return 1;
  }

  return Math.min(hold, MAX_SPRITESHEET_FRAME_HOLD);
};

export const getUsedFrameKeys = (clips = []) =>
  new Set(
    clips.flatMap((clip) =>
      (clip.entries ?? []).map((entry) => entry.frameKey),
    ),
  );

// The frames that end up in the sheet: every frame a clip uses, plus frames
// that no clip used when the draft was loaded, so editing never drops them.
export const selectOutputFrames = ({
  frames = [],
  clips = [],
  keepFrameKeys = [],
} = {}) => {
  const usedFrameKeys = getUsedFrameKeys(clips);
  const keptFrameKeys = new Set(keepFrameKeys);

  return frames.filter(
    (frame) => usedFrameKeys.has(frame.key) || keptFrameKeys.has(frame.key),
  );
};

// The smallest size that holds every frame without scaling.
export const resolveAutoFrameSize = (frames = []) => {
  let width = 0;
  let height = 0;

  for (const frame of frames) {
    width = Math.max(width, Math.round(frame.width ?? 0));
    height = Math.max(height, Math.round(frame.height ?? 0));
  }

  if (width < 1 || height < 1) {
    return undefined;
  }

  return { width, height };
};

// The frames a clip uses, in the order they first appear.
export const selectClipFrames = ({ frames = [], clip } = {}) => {
  const framesByKey = new Map(frames.map((frame) => [frame.key, frame]));
  const clipFrameKeys = new Set(
    (clip?.entries ?? []).map((entry) => entry.frameKey),
  );
  return [...clipFrameKeys]
    .map((frameKey) => framesByKey.get(frameKey))
    .filter(Boolean);
};

// The size of each frame in the sheet. A clip's frames share one size, its
// largest picture, so the clip plays without changing size. Each clip keeps
// its own size, so a sheet whose animations differ in size plays as it did.
// A frame used by clips of different sizes takes the largest, and a frame no
// clip uses keeps its own size.
export const resolveFrameCellSizes = ({ frames = [], clips = [] } = {}) => {
  const cellByKey = new Map();

  for (const clip of clips) {
    const clipFrames = selectClipFrames({ frames, clip });
    const size = resolveAutoFrameSize(clipFrames);
    if (!size) {
      continue;
    }

    for (const frame of clipFrames) {
      const cell = cellByKey.get(frame.key);
      cellByKey.set(frame.key, {
        width: Math.max(cell?.width ?? 0, size.width),
        height: Math.max(cell?.height ?? 0, size.height),
      });
    }
  }

  for (const frame of frames) {
    if (!cellByKey.has(frame.key)) {
      cellByKey.set(frame.key, {
        width: Math.max(1, Math.round(frame.width ?? 1)),
        height: Math.max(1, Math.round(frame.height ?? 1)),
      });
    }
  }

  return cellByKey;
};

// Centers a picture in its cell. A picture larger than the cell is scaled
// down to fit, keeping its proportions.
export const fitFrameInCell = ({
  width,
  height,
  cellWidth,
  cellHeight,
} = {}) => {
  const sourceWidth = Math.max(1, width ?? cellWidth);
  const sourceHeight = Math.max(1, height ?? cellHeight);
  const scale = Math.min(1, cellWidth / sourceWidth, cellHeight / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));

  return {
    x: Math.floor((cellWidth - drawWidth) / 2),
    y: Math.floor((cellHeight - drawHeight) / 2),
    width: drawWidth,
    height: drawHeight,
  };
};

// Shelf packing: places cells in rows, tallest first, starting a new row
// before one gets wider than `rowLimit`. Cells of one height keep their
// order, so cells of one size make an even grid in frame order.
const packCellsInRows = ({ sizes, order, rowLimit, padding }) => {
  const cells = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let sheetWidth = 0;

  for (const index of order) {
    const size = sizes[index];
    if (x > 0 && x + size.width > rowLimit) {
      y += rowHeight + padding;
      x = 0;
      rowHeight = 0;
    }

    cells[index] = { x, y, width: size.width, height: size.height };
    sheetWidth = Math.max(sheetWidth, x + size.width);
    rowHeight = Math.max(rowHeight, size.height);
    x += size.width + padding;
  }

  return {
    sheetWidth: Math.max(1, sheetWidth),
    sheetHeight: Math.max(1, y + rowHeight),
    cells,
  };
};

// Row widths to try, around the side of a square holding every cell.
const ROW_LIMIT_FACTORS = Array.from(
  { length: 25 },
  (_value, index) => 0.8 + index * 0.05,
);

// Lays cells out on as small a sheet as rows allow. A sheet is refused when
// its longer side is past the device limit, so the layout with the shortest
// longer side wins, then the smallest one. Where each cell goes does not
// change frame order: `cells[i]` is the cell of `sizes[i]`.
export const layoutSpritesheetCells = ({
  sizes = [],
  padding = SPRITESHEET_FRAME_PADDING,
} = {}) => {
  const order = sizes
    .map((_size, index) => index)
    .sort((left, right) => sizes[right].height - sizes[left].height);
  const widestCell = Math.max(1, ...sizes.map((size) => size.width));
  const squareSide = Math.sqrt(
    sizes.reduce(
      (total, size) => total + (size.width + padding) * (size.height + padding),
      0,
    ),
  );

  let best;
  for (const factor of ROW_LIMIT_FACTORS) {
    const layout = packCellsInRows({
      sizes,
      order,
      rowLimit: Math.max(widestCell, squareSide * factor),
      padding,
    });
    const longerSide = Math.max(layout.sheetWidth, layout.sheetHeight);
    const area = layout.sheetWidth * layout.sheetHeight;
    if (
      !best ||
      longerSide < best.longerSide ||
      (longerSide === best.longerSide && area < best.area)
    ) {
      best = { layout, longerSide, area };
    }
  }

  return best.layout;
};

export const getSpritesheetSizeLimitError = ({
  sheetWidth,
  sheetHeight,
  maxTextureSize,
} = {}) => {
  const limit = Math.floor(
    Math.min(
      maxTextureSize ?? Infinity,
      Math.sqrt(MAX_SPRITESHEET_CANVAS_AREA),
    ),
  );
  const fitsTexture =
    !(maxTextureSize > 0) ||
    (sheetWidth <= maxTextureSize && sheetHeight <= maxTextureSize);
  const fitsCanvas = sheetWidth * sheetHeight <= MAX_SPRITESHEET_CANVAS_AREA;

  if (fitsTexture && fitsCanvas) {
    return undefined;
  }

  return {
    code: "spritesheet_too_large",
    sheetWidth,
    sheetHeight,
    limit,
  };
};

export const entriesFromAnimationFrames = ({
  frames = [],
  frameKeys = [],
  createEntryKey,
} = {}) => {
  const entries = [];

  for (const frameIndex of frames) {
    const frameKey = frameKeys[frameIndex];
    if (frameKey === undefined) {
      continue;
    }

    const previousEntry = entries.at(-1);
    if (
      previousEntry?.frameKey === frameKey &&
      previousEntry.hold < MAX_SPRITESHEET_FRAME_HOLD
    ) {
      previousEntry.hold += 1;
      continue;
    }

    entries.push({
      key: createEntryKey(),
      frameKey,
      hold: 1,
    });
  }

  return entries;
};

export const animationFramesFromEntries = ({
  entries = [],
  frameIndexByKey,
} = {}) =>
  entries.flatMap((entry) => {
    const frameIndex = frameIndexByKey.get(entry.frameKey);
    if (frameIndex === undefined) {
      return [];
    }

    return Array.from({ length: normalizeFrameHold(entry.hold) }, () => {
      return frameIndex;
    });
  });

export const getSpritesheetFramesDraftError = ({
  frames = [],
  clips = [],
} = {}) => {
  if (frames.length === 0 || getUsedFrameKeys(clips).size === 0) {
    return "noFrames";
  }

  if (clips.some((clip) => (clip.entries ?? []).length === 0)) {
    return "emptyClip";
  }

  return undefined;
};

// The engine finds an animation frame by its position among the atlas frame
// names, and JavaScript lists names that look like whole numbers first, in
// number order. A frame name is never a bare number, so the names stay in
// sheet order.
const INTEGER_LIKE_NAME = /^(?:0|[1-9]\d*)$/;

const toAtlasFrameName = (name = "") => {
  const trimmedName = String(name).trim();
  return INTEGER_LIKE_NAME.test(trimmedName)
    ? `${trimmedName}.png`
    : trimmedName;
};

// Builds everything a spritesheet needs from a frames draft: which frames go
// in the sheet and where, the atlas JSON, and the resource animations.
export const buildSpritesheetFramesOutput = ({
  frames = [],
  clips = [],
  keepFrameKeys = [],
  imageName = "spritesheet.png",
} = {}) => {
  const outputFrames = selectOutputFrames({ frames, clips, keepFrameKeys });
  const cellByKey = resolveFrameCellSizes({ frames: outputFrames, clips });
  const cellSizes = outputFrames.map((frame) => cellByKey.get(frame.key));
  const layout = layoutSpritesheetCells({ sizes: cellSizes });
  const frameSize = resolveAutoFrameSize(cellSizes);
  const frameNames = createUniqueFrameNames(
    outputFrames.map((frame) => toAtlasFrameName(frame.name)),
  );
  const frameIndexByKey = new Map(
    outputFrames.map((frame, index) => [frame.key, index]),
  );

  const atlasFrames = {};
  const placements = outputFrames.map((frame, index) => {
    const cell = layout.cells[index];
    const fit = fitFrameInCell({
      width: frame.width,
      height: frame.height,
      cellWidth: cell.width,
      cellHeight: cell.height,
    });

    atlasFrames[frameNames[index]] = {
      frame: { x: cell.x, y: cell.y, w: cell.width, h: cell.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cell.width, h: cell.height },
      sourceSize: { w: cell.width, h: cell.height },
    };

    return {
      frameKey: frame.key,
      x: cell.x + fit.x,
      y: cell.y + fit.y,
      width: fit.width,
      height: fit.height,
    };
  });

  const atlasAnimations = {};
  const animations = {};
  for (const clip of clips) {
    const animationFrames = animationFramesFromEntries({
      entries: clip.entries,
      frameIndexByKey,
    });
    atlasAnimations[clip.name] = animationFrames.map(
      (frameIndex) => frameNames[frameIndex],
    );
    animations[clip.name] = {
      frames: animationFrames,
      fps: clip.fps,
      loop: clip.loop ?? true,
    };
  }

  return {
    frames: outputFrames,
    placements,
    frameWidth: frameSize?.width ?? 1,
    frameHeight: frameSize?.height ?? 1,
    sheetWidth: layout.sheetWidth,
    sheetHeight: layout.sheetHeight,
    frameCount: outputFrames.length,
    jsonData: {
      frames: atlasFrames,
      animations: atlasAnimations,
      meta: {
        image: imageName,
        size: { w: layout.sheetWidth, h: layout.sheetHeight },
        scale: "1",
      },
    },
    animations,
  };
};

// The resource animations for clips that only use frames already in the
// saved sheet, where `frame.sourceIndex` is a frame's index. Reordering,
// holds, removing frames, and FPS can then be saved without a new sheet
// image. Undefined when a clip uses a frame the sheet does not have, such as
// a picture added since.
export const buildAnimationsFromSourceIndexes = ({
  frames = [],
  clips = [],
} = {}) => {
  const frameIndexByKey = new Map(
    frames
      .filter((frame) => Number.isInteger(frame.sourceIndex))
      .map((frame) => [frame.key, frame.sourceIndex]),
  );
  const usedFrameKeys = getUsedFrameKeys(clips);
  if ([...usedFrameKeys].some((frameKey) => !frameIndexByKey.has(frameKey))) {
    return undefined;
  }

  return Object.fromEntries(
    clips.map((clip) => [
      clip.name,
      {
        frames: animationFramesFromEntries({
          entries: clip.entries,
          frameIndexByKey,
        }),
        fps: clip.fps,
        loop: clip.loop ?? true,
      },
    ]),
  );
};

// Where each atlas frame sits in a sheet and how to draw it back at its
// original size. Rotated frames are stored 90 degrees clockwise, as PixiJS
// reads them, so the region in the sheet is `h` wide and `w` tall.
export const getSpritesheetFrameCrops = (jsonData = {}) =>
  Object.entries(jsonData?.frames ?? {}).map(([name, atlasFrame]) => {
    const frame = atlasFrame?.frame ?? {};
    const width = Math.max(1, Math.floor(frame.w ?? 0));
    const height = Math.max(1, Math.floor(frame.h ?? 0));
    const rotated = atlasFrame?.rotated === true;
    const trimmed = atlasFrame?.trimmed !== false;
    const sourceSize = trimmed ? atlasFrame?.sourceSize : undefined;
    const spriteSourceSize = trimmed ? atlasFrame?.spriteSourceSize : undefined;

    return {
      name,
      sourceX: Math.floor(frame.x ?? 0),
      sourceY: Math.floor(frame.y ?? 0),
      sourceWidth: rotated ? height : width,
      sourceHeight: rotated ? width : height,
      rotated,
      outputWidth: Math.max(1, Math.floor(sourceSize?.w ?? width)),
      outputHeight: Math.max(1, Math.floor(sourceSize?.h ?? height)),
      drawX: Math.floor(spriteSourceSize?.x ?? 0),
      drawY: Math.floor(spriteSourceSize?.y ?? 0),
      drawWidth: width,
      drawHeight: height,
    };
  });

// Saved animations keep their speed: `fps`, or the older `animationSpeed`,
// or `missingClipFps` when they have neither.
export const clipsFromAnimations = ({
  animations = {},
  frameKeys = [],
  createEntryKey,
  missingClipFps,
} = {}) =>
  Object.entries(animations ?? {}).map(([name, animation]) => ({
    name,
    entries: entriesFromAnimationFrames({
      frames: animation?.frames ?? [],
      frameKeys,
      createEntryKey,
    }),
    fps: resolveSpritesheetAnimationFps(animation, missingClipFps),
    loop: animation?.loop ?? true,
  }));

// Frames that no clip uses, which saving must keep.
export const getUnusedFrameKeys = ({ frames = [], clips = [] } = {}) => {
  const usedFrameKeys = getUsedFrameKeys(clips);
  return frames
    .filter((frame) => !usedFrameKeys.has(frame.key))
    .map((frame) => frame.key);
};

export const moveArrayItem = (items = [], fromIndex, toIndex) => {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
};
