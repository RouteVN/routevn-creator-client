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

export const getFrameNameFromFileName = (fileName = "") =>
  String(fileName)
    .replace(/\.[^.]+$/, "")
    .trim();

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

export const normalizeFrameSizeValue = (value) => {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size) || size < 1) {
    return undefined;
  }

  return size;
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

// The smallest cell that holds every frame without scaling.
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

// Centers a frame in its cell. A frame larger than the cell is scaled down to
// fit, keeping its proportions.
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

export const layoutSpritesheetGrid = ({
  frameCount,
  cellWidth,
  cellHeight,
  padding = SPRITESHEET_FRAME_PADDING,
} = {}) => {
  const count = Math.max(1, frameCount);
  const columns =
    count <= 1
      ? 1
      : Math.min(
          count,
          Math.max(1, Math.ceil(Math.sqrt((count * cellHeight) / cellWidth))),
        );
  const rows = Math.ceil(count / columns);
  const cells = Array.from({ length: frameCount }, (_, index) => ({
    x: (index % columns) * (cellWidth + padding),
    y: Math.floor(index / columns) * (cellHeight + padding),
  }));

  return {
    columns,
    rows,
    sheetWidth: columns * cellWidth + (columns - 1) * padding,
    sheetHeight: rows * cellHeight + (rows - 1) * padding,
    cells,
  };
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

// Builds everything a spritesheet needs from a frames draft: which frames go
// in the sheet and where, the atlas JSON, and the resource animations.
export const buildSpritesheetFramesOutput = ({
  frames = [],
  clips = [],
  keepFrameKeys = [],
  frameWidth,
  frameHeight,
  imageName = "spritesheet.png",
} = {}) => {
  const outputFrames = selectOutputFrames({ frames, clips, keepFrameKeys });
  const autoSize = resolveAutoFrameSize(outputFrames);
  const cellWidth = normalizeFrameSizeValue(frameWidth) ?? autoSize?.width ?? 1;
  const cellHeight =
    normalizeFrameSizeValue(frameHeight) ?? autoSize?.height ?? 1;
  const layout = layoutSpritesheetGrid({
    frameCount: outputFrames.length,
    cellWidth,
    cellHeight,
  });
  const frameNames = createUniqueFrameNames(
    outputFrames.map((frame) => frame.name),
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
      cellWidth,
      cellHeight,
    });

    atlasFrames[frameNames[index]] = {
      frame: { x: cell.x, y: cell.y, w: cellWidth, h: cellHeight },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cellWidth, h: cellHeight },
      sourceSize: { w: cellWidth, h: cellHeight },
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
    frameWidth: cellWidth,
    frameHeight: cellHeight,
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
    fps: animation?.fps ?? missingClipFps,
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
