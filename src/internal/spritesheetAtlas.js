import { getImageDimensions } from "../deps/clients/web/fileProcessors.js";
import {
  DEFAULT_SPRITESHEET_CLIP_FPS,
  resolveSpritesheetAnimationFps,
} from "./spritesheets.js";
import { compareFrameFileNames } from "./spritesheetFrames.js";

const normalizeAtlasFrame = (frame = {}) => {
  if (frame.frame) {
    const width = frame.frame.w ?? 0;
    const height = frame.frame.h ?? 0;
    const sourceWidth = frame.sourceSize?.w ?? width;
    const sourceHeight = frame.sourceSize?.h ?? height;

    const normalized = {
      frame: {
        x: frame.frame.x ?? 0,
        y: frame.frame.y ?? 0,
        w: width,
        h: height,
      },
      rotated: frame.rotated ?? false,
      trimmed: frame.trimmed ?? false,
      spriteSourceSize: {
        x: frame.spriteSourceSize?.x ?? 0,
        y: frame.spriteSourceSize?.y ?? 0,
        w: frame.spriteSourceSize?.w ?? width,
        h: frame.spriteSourceSize?.h ?? height,
      },
      sourceSize: {
        w: sourceWidth,
        h: sourceHeight,
      },
    };

    if (frame.anchor) {
      normalized.anchor = {
        x: frame.anchor.x ?? 0,
        y: frame.anchor.y ?? 0,
      };
    } else if (frame.pivot) {
      normalized.anchor = {
        x: frame.pivot.x ?? 0,
        y: frame.pivot.y ?? 0,
      };
    }

    if (frame.borders) {
      normalized.borders = { ...frame.borders };
    }

    return normalized;
  }

  const width = frame.width ?? frame.w ?? 0;
  const height = frame.height ?? frame.h ?? 0;
  const sourceWidth = frame.sourceWidth ?? width;
  const sourceHeight = frame.sourceHeight ?? height;

  const normalized = {
    frame: {
      x: frame.x ?? 0,
      y: frame.y ?? 0,
      w: width,
      h: height,
    },
    rotated: frame.rotated ?? false,
    trimmed: frame.trimmed ?? false,
    spriteSourceSize: {
      x: frame.offsetX ?? 0,
      y: frame.offsetY ?? 0,
      w: width,
      h: height,
    },
    sourceSize: {
      w: sourceWidth,
      h: sourceHeight,
    },
  };

  if (frame.anchor) {
    normalized.anchor = {
      x: frame.anchor.x ?? 0,
      y: frame.anchor.y ?? 0,
    };
  } else if (frame.pivot) {
    normalized.anchor = {
      x: frame.pivot.x ?? 0,
      y: frame.pivot.y ?? 0,
    };
  }

  if (frame.borders) {
    normalized.borders = { ...frame.borders };
  }

  return normalized;
};

const normalizeAtlasAnimations = (animationsInput = {}) => {
  if (!animationsInput || typeof animationsInput !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(animationsInput)
      .map(([clipName, frames]) => {
        if (typeof clipName !== "string" || clipName.length === 0) {
          return undefined;
        }

        return [
          clipName,
          Array.isArray(frames) ? frames.map((frame) => String(frame)) : [],
        ];
      })
      .filter(Boolean),
  );
};

const buildFrameTagSequence = (frameNames, tag = {}) => {
  const from = Math.max(0, Number(tag.from ?? 0));
  const to = Math.min(frameNames.length - 1, Number(tag.to ?? from));

  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return [];
  }

  const sequence = frameNames.slice(from, to + 1);
  const direction = String(tag.direction ?? "forward").toLowerCase();

  if (direction === "reverse" || direction === "backward") {
    return [...sequence].reverse();
  }

  if (direction === "pingpong") {
    return [...sequence, ...sequence.slice(1, -1).reverse()];
  }

  if (direction === "pingpong_reverse") {
    const reversed = [...sequence].reverse();
    return [...reversed, ...reversed.slice(1, -1).reverse()];
  }

  return sequence;
};

const normalizeAsepriteFrameTags = (frameTagsInput = [], frameNames = []) => {
  if (!Array.isArray(frameTagsInput) || frameNames.length === 0) {
    return {};
  }

  return Object.fromEntries(
    frameTagsInput
      .map((tag) => {
        const clipName = typeof tag?.name === "string" ? tag.name : "";
        if (!clipName) {
          return undefined;
        }

        return [clipName, buildFrameTagSequence(frameNames, tag)];
      })
      .filter(Boolean),
  );
};

// Phaser 3 exports list each image's frames under `textures` instead of
// `frames`. A sheet split over several images is merged into one first.
const getAtlasFramesInput = (atlas = {}) =>
  atlas.frames ?? atlas.textures?.flatMap((texture) => texture.frames ?? []);

export const normalizeSpritesheetAtlas = (atlasInput = {}) => {
  const atlas = atlasInput ?? {};
  const animations = normalizeAtlasAnimations(atlas.animations);
  const framesInput = getAtlasFramesInput(atlas);
  const frames = Array.isArray(framesInput)
    ? Object.fromEntries(
        framesInput
          .map((frame) => {
            const frameName = frame?.filename ?? frame?.name;

            if (typeof frameName !== "string" || frameName.length === 0) {
              return undefined;
            }

            return [frameName, normalizeAtlasFrame(frame)];
          })
          .filter(Boolean),
      )
    : Object.fromEntries(
        Object.entries(framesInput ?? {}).map(([frameName, frame]) => [
          frameName,
          normalizeAtlasFrame(frame),
        ]),
      );

  return {
    frames,
    ...(Object.keys(animations).length > 0 ? { animations } : {}),
    meta: {
      ...atlas.meta,
      scale: String(atlas.scale ?? atlas.meta?.scale ?? 1),
      ...(atlas.width != null || atlas.height != null
        ? {
            size: {
              w: atlas.width ?? atlas.meta?.size?.w ?? 0,
              h: atlas.height ?? atlas.meta?.size?.h ?? 0,
            },
          }
        : {}),
    },
  };
};

const FRAME_FILE_EXTENSION = /\.(png|jpe?g|webp|gif|bmp|ase|aseprite)$/i;
const NUMBERED_FRAME_NAME = /^(.*?)[\s._-]*\d+$/;

// A frame's name without its extension, its folder, and what its name is
// known by within the folder: the name before its number (`walk_02` is
// `walk`), or the whole name when it has no number.
const parseFrameName = (frameName) => {
  const name = frameName.replace(FRAME_FILE_EXTENSION, "");
  const folderEnd = name.lastIndexOf("/");
  const folder = folderEnd > 0 ? name.slice(0, folderEnd) : undefined;
  const baseName = folderEnd > 0 ? name.slice(folderEnd + 1) : name;
  const numberedPrefix = baseName.match(NUMBERED_FRAME_NAME)?.[1];

  return {
    name,
    folder,
    numberedPrefix,
    key: numberedPrefix ?? baseName,
  };
};

// The animation each frame belongs to by its name. Frames in a folder belong
// to the folder (`run/frame0003` is `run`), unless the folder holds several
// sequences (`hero/walk_01` and `hero/run_01` are `hero/walk` and
// `hero/run`). Other frames belong to their name before the number
// (`walk_02.png` is `walk`). A frame without either belongs to none.
const resolveSequenceNames = (frameNames = []) => {
  const parsedNames = frameNames.map(parseFrameName);
  const keysByFolder = new Map();
  for (const { folder, key } of parsedNames) {
    if (folder !== undefined) {
      keysByFolder.set(
        folder,
        (keysByFolder.get(folder) ?? new Set()).add(key),
      );
    }
  }

  return parsedNames.map(({ name, folder, numberedPrefix }) => {
    if (folder === undefined) {
      return numberedPrefix || undefined;
    }

    if (keysByFolder.get(folder).size === 1) {
      return folder;
    }

    return numberedPrefix === undefined
      ? name
      : numberedPrefix
        ? `${folder}/${numberedPrefix}`
        : folder;
  });
};

// For a sheet without named animations: frames of one sequence become one
// animation each, in number order. Once a sheet has a sequence, every other
// frame becomes an animation of its own, so each can still be shown. A sheet
// without sequences returns nothing.
const groupFramesBySequenceName = (frameNames = []) => {
  const sequenceNames = resolveSequenceNames(frameNames);
  const groups = new Map();
  frameNames.forEach((frameName, index) => {
    const sequenceName = sequenceNames[index];
    if (sequenceName) {
      groups.set(sequenceName, [
        ...(groups.get(sequenceName) ?? []),
        frameName,
      ]);
    }
  });

  const sequences = new Set(
    [...groups]
      .filter(([, names]) => names.length > 1)
      .map(([sequenceName]) => sequenceName),
  );
  if (sequences.size === 0) {
    return {};
  }

  const clips = {};
  const takeClipName = (name) => {
    let clipName = name;
    let suffix = 2;
    while (clips[clipName] || sequences.has(clipName)) {
      clipName = `${name}_${suffix}`;
      suffix += 1;
    }
    return clipName;
  };

  frameNames.forEach((frameName, index) => {
    const sequenceName = sequenceNames[index];
    if (sequences.has(sequenceName)) {
      if (!clips[sequenceName]) {
        clips[sequenceName] = [...groups.get(sequenceName)].sort(
          compareFrameFileNames,
        );
      }
      return;
    }

    clips[takeClipName(parseFrameName(frameName).name || frameName)] = [
      frameName,
    ];
  });

  return clips;
};

const buildClipFrameNames = (atlas = {}) => {
  const frameNames = Object.keys(atlas.frames ?? {});
  const clips = {
    ...normalizeAsepriteFrameTags(atlas.meta?.frameTags, frameNames),
    ...normalizeAtlasAnimations(atlas.animations),
  };

  if (Object.keys(clips).length > 0) {
    return clips;
  }

  if (frameNames.length === 0) {
    return {};
  }

  const sequences = groupFramesBySequenceName(frameNames);
  if (Object.keys(sequences).length > 0) {
    return sequences;
  }

  return {
    default: frameNames,
  };
};

const buildResourceAnimations = (atlas = {}, clipFrameNames = {}) => {
  const frameNames = Object.keys(atlas.frames ?? {});
  const frameIndexByName = new Map(
    frameNames.map((frameName, index) => [frameName, index]),
  );

  return Object.fromEntries(
    Object.entries(clipFrameNames)
      .map(([clipName, clipFrames]) => {
        const frames = (clipFrames ?? [])
          .map((frameName) => frameIndexByName.get(frameName))
          .filter((index) => Number.isInteger(index));

        if (frames.length === 0) {
          return undefined;
        }

        return [
          clipName,
          {
            frames,
            fps: DEFAULT_SPRITESHEET_CLIP_FPS,
            loop: true,
          },
        ];
      })
      .filter(Boolean),
  );
};

const getDefaultFrameSize = (atlas = {}, clipFrameNames = {}) => {
  const frameNames = Object.keys(atlas.frames ?? {});
  const firstClipFrames = Object.values(clipFrameNames)[0] ?? [];
  const firstFrameName = firstClipFrames[0] ?? frameNames[0];
  const frame = atlas.frames?.[firstFrameName];

  if (!frame) {
    return {
      width: 0,
      height: 0,
    };
  }

  return {
    width: frame.sourceSize?.w ?? frame.frame?.w ?? 0,
    height: frame.sourceSize?.h ?? frame.frame?.h ?? 0,
  };
};

const createClipSummaries = (resourceAnimations = {}) => {
  return Object.entries(resourceAnimations).map(([name, animation]) => ({
    name,
    frameCount: animation.frames?.length ?? 0,
    fps: resolveSpritesheetAnimationFps(animation),
    loop: animation.loop ?? true,
  }));
};

const getBaseFileName = (path = "") =>
  String(path).split(/[\\/]/).pop().toLowerCase();

// The image files a sheet's JSON draws from: several for a Phaser 3 sheet
// split over more than one image, otherwise the one it names, if any.
export const getSpritesheetAtlasImageNames = (atlas = {}) => {
  if (Array.isArray(atlas.textures) && atlas.textures.length > 0) {
    return atlas.textures.map((texture) => texture.image ?? "");
  }

  return atlas.meta?.image ? [atlas.meta.image] : [];
};

// The picked PNG file for each image the JSON names, matched by file name.
export const matchSpritesheetImageFiles = ({
  imageNames = [],
  pngFiles = [],
} = {}) =>
  imageNames.map((imageName) =>
    pngFiles.find(
      (file) => getBaseFileName(file.name) === getBaseFileName(imageName),
    ),
  );

// Lays the images of a sheet split over several images out on one sheet, in
// rows, and moves each frame to where its image lands. `pageSizes[i]` is the
// size of the image of `atlas.textures[i]`.
export const mergeSpritesheetAtlasPages = ({
  atlas,
  pageSizes = [],
  imageName,
  padding = 0,
} = {}) => {
  const columns = Math.ceil(Math.sqrt(pageSizes.length));
  const placements = [];
  let sheetWidth = 0;
  let rowY = 0;

  for (let rowStart = 0; rowStart < pageSizes.length; rowStart += columns) {
    const rowSizes = pageSizes.slice(rowStart, rowStart + columns);
    let x = 0;
    for (const size of rowSizes) {
      placements.push({ x, y: rowY, width: size.width, height: size.height });
      x += size.width + padding;
    }
    sheetWidth = Math.max(sheetWidth, x - padding);
    rowY += Math.max(...rowSizes.map((size) => size.height)) + padding;
  }

  const frames = atlas.textures.flatMap((texture, index) =>
    (texture.frames ?? []).map((frame) => {
      const movedFrame = structuredClone(frame);
      movedFrame.frame.x = (frame.frame.x ?? 0) + placements[index].x;
      movedFrame.frame.y = (frame.frame.y ?? 0) + placements[index].y;
      return movedFrame;
    }),
  );
  const sheetHeight = Math.max(0, rowY - padding);
  const meta = structuredClone(atlas.meta ?? {});
  meta.image = imageName;
  meta.size = { w: sheetWidth, h: sheetHeight };
  meta.scale = atlas.textures[0].scale ?? meta.scale ?? 1;

  return { sheetWidth, sheetHeight, placements, atlas: { frames, meta } };
};

// A frame's name without its picture's file extension. Other dots stay, so
// `hero.idle.v2.png` is `hero.idle.v2` and `walk.001` keeps its number.
export const getSpritesheetFrameDisplayName = (frameName = "") =>
  String(frameName || "")
    .replace(FRAME_FILE_EXTENSION, "")
    .trim();

export const getSpritesheetDisplayName = (fileName = "") => {
  return String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .trim();
};

export const normalizeSizeInput = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return Math.round(numericValue);
};

export const parseSpritesheetAtlasFile = async ({ atlasFile } = {}) => {
  if (!atlasFile) {
    throw new Error("A spritesheet JSON file is required.");
  }

  const atlasText = await atlasFile.text();

  let atlasInput;
  try {
    atlasInput = JSON.parse(atlasText);
  } catch {
    throw new Error("Spritesheet JSON is invalid.");
  }

  // A sheet split over several images needs its PNG files, which merge its
  // images into one sheet first.
  const imageNames = getSpritesheetAtlasImageNames(atlasInput);
  if (imageNames.length > 1) {
    const error = new Error(
      `The JSON needs these images: ${imageNames.join(", ")}`,
    );
    error.code = "spritesheet_images_missing";
    error.missingImages = imageNames;
    throw error;
  }

  const jsonData = normalizeSpritesheetAtlas(atlasInput);
  const frameNames = Object.keys(jsonData.frames ?? {});

  if (frameNames.length === 0) {
    throw new Error("Spritesheet JSON does not contain any frames.");
  }

  const clipFrameNames = buildClipFrameNames(jsonData);
  const animations = buildResourceAnimations(jsonData, clipFrameNames);

  if (Object.keys(animations).length === 0) {
    throw new Error("Spritesheet JSON did not produce any usable animations.");
  }

  const defaultFrameSize = getDefaultFrameSize(jsonData, clipFrameNames);

  return {
    atlasFileName: atlasFile.name,
    jsonData,
    animations,
    clipSummaries: createClipSummaries(animations),
    frameCount: frameNames.length,
    defaultWidth: defaultFrameSize.width,
    defaultHeight: defaultFrameSize.height,
  };
};

export const parseSpritesheetImport = async ({ pngFile, atlasFile } = {}) => {
  if (!pngFile) {
    throw new Error("A PNG spritesheet is required.");
  }

  const [atlasData, imageDimensions] = await Promise.all([
    parseSpritesheetAtlasFile({ atlasFile }),
    getImageDimensions(pngFile),
  ]);

  if (!imageDimensions) {
    throw new Error("Failed to read spritesheet dimensions.");
  }

  return {
    ...atlasData,
    sheetWidth: imageDimensions.width,
    sheetHeight: imageDimensions.height,
    defaultWidth: atlasData.defaultWidth || imageDimensions.width,
    defaultHeight: atlasData.defaultHeight || imageDimensions.height,
    suggestedName: getSpritesheetDisplayName(pngFile.name) || "Spritesheet",
  };
};
