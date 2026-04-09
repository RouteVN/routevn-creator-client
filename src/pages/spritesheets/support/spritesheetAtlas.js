import { getImageDimensions } from "../../../deps/clients/web/fileProcessors.js";

const DEFAULT_PLAYBACK_FPS = 30;
const DEFAULT_ANIMATION_SPEED = DEFAULT_PLAYBACK_FPS / 60;

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

export const normalizeSpritesheetAtlas = (atlasInput = {}) => {
  const atlas = atlasInput ?? {};
  const animations = normalizeAtlasAnimations(atlas.animations);
  const frames = Array.isArray(atlas.frames)
    ? Object.fromEntries(
        atlas.frames
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
        Object.entries(atlas.frames ?? {}).map(([frameName, frame]) => [
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
            animationSpeed: DEFAULT_ANIMATION_SPEED,
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
    fps: Math.round((animation.animationSpeed ?? DEFAULT_ANIMATION_SPEED) * 60),
    loop: animation.loop ?? true,
  }));
};

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
    throw new Error("An atlas JSON file is required.");
  }

  const atlasText = await atlasFile.text();

  let atlasInput;
  try {
    atlasInput = JSON.parse(atlasText);
  } catch {
    throw new Error("Atlas JSON is invalid.");
  }

  const jsonData = normalizeSpritesheetAtlas(atlasInput);
  const frameNames = Object.keys(jsonData.frames ?? {});

  if (frameNames.length === 0) {
    throw new Error("Atlas JSON does not contain any frames.");
  }

  const clipFrameNames = buildClipFrameNames(jsonData);
  const animations = buildResourceAnimations(jsonData, clipFrameNames);

  if (Object.keys(animations).length === 0) {
    throw new Error("Atlas JSON did not produce any usable animations.");
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
