import createRouteGraphics, { textPlugin } from "route-graphics";
import { createAnimationResourcePreviewStates } from "../../../internal/animationPreview.js";
import { createParticlePreviewState } from "../../../internal/particlePreview.js";
import { createRenderableParticleData } from "../../../internal/particles.js";
import { requireProjectResolution } from "../../../internal/projectResolution.js";
import { createRouteGraphicsTextPreviewState } from "../../../internal/routeGraphicsTextPreview.js";
import {
  resolveSpritesheetAnimationFps,
  resolveSpritesheetFrameName,
} from "../../../internal/spritesheets.js";
import { createGraphicsService } from "../../services/graphicsService.js";
import { startCanvasVideoRecording } from "../canvasVideoRecorder.js";

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 360;
const STATIC_ANIMATION_PREVIEW_DURATION_MS = 1000;
const PARTICLE_PREVIEW_DURATION_MS = 3000;
const SPRITESHEET_PREVIEW_PADDING = 16;
const CHECKERBOARD_CELL_SIZE = 12;
const CHECKERBOARD_LIGHT_COLOR = "#eef2f7";
const CHECKERBOARD_DARK_COLOR = "#94a3b8";
const TRANSPARENT_COLOR_PATTERN =
  /^(?:transparent|rgba\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*0(?:\.0+)?\s*\))$/i;

const wait = (durationMs) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, durationMs));

const waitForPaint = () =>
  new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame !== "function") {
      globalThis.setTimeout(resolve, 16);
      return;
    }
    globalThis.requestAnimationFrame(() =>
      globalThis.requestAnimationFrame(resolve),
    );
  });

const dataUrlToBlob = (value) => {
  const [header, body] = value.split(",", 2);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const decodeImage = async (blob) => {
  if (typeof globalThis.createImageBitmap === "function") {
    return globalThis.createImageBitmap(blob);
  }

  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("Could not decode preview image."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const drawCheckerboard = (context, width, height) => {
  context.fillStyle = CHECKERBOARD_LIGHT_COLOR;
  context.fillRect(0, 0, width, height);
  context.fillStyle = CHECKERBOARD_DARK_COLOR;
  for (let y = 0; y < height; y += CHECKERBOARD_CELL_SIZE) {
    const row = Math.floor(y / CHECKERBOARD_CELL_SIZE);
    for (let x = 0; x < width; x += CHECKERBOARD_CELL_SIZE) {
      const column = Math.floor(x / CHECKERBOARD_CELL_SIZE);
      if ((row + column) % 2 === 0) {
        context.fillRect(x, y, CHECKERBOARD_CELL_SIZE, CHECKERBOARD_CELL_SIZE);
      }
    }
  }
};

const drawSpritesheetFrame = ({
  canvas,
  sourceImage,
  atlas,
  animation,
  frameOffset,
}) => {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawCheckerboard(context, canvas.width, canvas.height);

  const frameNames = Object.keys(atlas?.frames ?? {});
  const frameRef =
    animation.frames?.[frameOffset] ?? animation.frames?.[0] ?? 0;
  const resolvedFrameName = resolveSpritesheetFrameName(frameNames, frameRef);
  const frameName =
    typeof resolvedFrameName === "string" && atlas.frames?.[resolvedFrameName]
      ? resolvedFrameName
      : frameNames[0];
  const frame = atlas.frames?.[frameName];
  if (!frame) {
    return;
  }

  const sourceFrame = frame.frame;
  const sourceSize = frame.sourceSize;
  const spriteSourceSize = frame.spriteSourceSize;
  const sourceImageWidth = sourceImage.width ?? sourceImage.naturalWidth;
  const sourceImageHeight = sourceImage.height ?? sourceImage.naturalHeight;
  const outputWidth = sourceSize?.w ?? sourceFrame?.w ?? sourceImageWidth;
  const outputHeight = sourceSize?.h ?? sourceFrame?.h ?? sourceImageHeight;
  const availableWidth = canvas.width - SPRITESHEET_PREVIEW_PADDING * 2;
  const availableHeight = canvas.height - SPRITESHEET_PREVIEW_PADDING * 2;
  const scale = Math.min(
    availableWidth / Math.max(1, outputWidth),
    availableHeight / Math.max(1, outputHeight),
  );
  const scaledOutputWidth = outputWidth * scale;
  const scaledOutputHeight = outputHeight * scale;
  const outputX = (canvas.width - scaledOutputWidth) / 2;
  const outputY = (canvas.height - scaledOutputHeight) / 2;

  if (!sourceFrame) {
    context.drawImage(
      sourceImage,
      outputX,
      outputY,
      scaledOutputWidth,
      scaledOutputHeight,
    );
    return;
  }

  context.drawImage(
    sourceImage,
    sourceFrame.x,
    sourceFrame.y,
    sourceFrame.w,
    sourceFrame.h,
    outputX + (spriteSourceSize?.x ?? 0) * scale,
    outputY + (spriteSourceSize?.y ?? 0) * scale,
    (spriteSourceSize?.w ?? sourceFrame.w) * scale,
    (spriteSourceSize?.h ?? sourceFrame.h) * scale,
  );
};

export const renderSpritesheetPreviewVideo = async ({
  spritesheet,
  imageBytes,
  imageMimeType,
}) => {
  const animation = Object.values(spritesheet.animations ?? {})[0];
  const frameCount = animation?.frames?.length ?? 0;
  if (!animation || frameCount === 0) {
    throw new Error("A spritesheet preview animation is unavailable.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  const sourceImage = await decodeImage(
    new Blob([imageBytes], { type: imageMimeType }),
  );
  let recording = startCanvasVideoRecording({ canvas, frameRate: 60 });
  const frameDurationMs = 1000 / resolveSpritesheetAnimationFps(animation);

  try {
    for (let frameOffset = 0; frameOffset < frameCount; frameOffset += 1) {
      drawSpritesheetFrame({
        canvas,
        sourceImage,
        atlas: spritesheet.jsonData,
        animation,
        frameOffset,
      });
      await wait(Math.max(16, frameDurationMs));
    }
    const video = await recording.stop();
    recording = undefined;
    return video;
  } finally {
    await recording?.stop().catch(() => undefined);
    sourceImage.close?.();
    canvas.remove();
  }
};

const isTransparentColor = (value) =>
  !value || TRANSPARENT_COLOR_PATTERN.test(String(value).trim());

const clampColorChannel = (value) => Math.min(1, Math.max(0, value));

const linearSrgbToSrgb = (value) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

const formatHexColor = (red, green, blue) =>
  `#${[red, green, blue]
    .map((value) =>
      Math.round(clampColorChannel(linearSrgbToSrgb(value)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const parseOklchLightness = (value) =>
  value.endsWith("%")
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value);

const parseOklchChroma = (value) =>
  value.endsWith("%")
    ? (Number.parseFloat(value) / 100) * 0.4
    : Number.parseFloat(value);

const parseOklchHue = (value) => {
  const hue = Number.parseFloat(value);
  if (value.endsWith("grad")) {
    return hue * 0.9;
  }
  if (value.endsWith("rad")) {
    return (hue * 180) / Math.PI;
  }
  if (value.endsWith("turn")) {
    return hue * 360;
  }
  return hue;
};

const convertOklchToHex = (value) => {
  const match = String(value ?? "")
    .trim()
    .match(/^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)\s*\)$/i);
  if (!match) {
    return value;
  }

  const lightness = parseOklchLightness(match[1]);
  const chroma = parseOklchChroma(match[2]);
  const hueRadians = (parseOklchHue(match[3]) * Math.PI) / 180;
  if (![lightness, chroma, hueRadians].every(Number.isFinite)) {
    return value;
  }

  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return formatHexColor(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );
};

const resolvePageColors = () => {
  const style = getComputedStyle(document.body);
  return {
    backgroundColor: isTransparentColor(style.backgroundColor)
      ? "#1a1a1a"
      : convertOklchToHex(style.backgroundColor),
    color: convertOklchToHex(style.color || "#f5f5f5"),
  };
};

const getContrastBackground = (color) => {
  const match = String(color ?? "").match(/^#([a-f\d]{3}|[a-f\d]{6})$/i);
  if (!match) {
    return resolvePageColors().backgroundColor;
  }

  const hex = match[1];
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => character + character)
          .join("")
      : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return brightness < 0.5 ? "#a0a0a0" : "#606060";
};

const loadFontFaces = async (fontAssets = []) => {
  const loaded = [];
  for (const asset of fontAssets) {
    const url = URL.createObjectURL(
      new Blob([asset.bytes], { type: asset.mimeType }),
    );
    try {
      const descriptors = {};
      if (asset.weightDescriptor) {
        descriptors.weight = asset.weightDescriptor;
      }
      const face = new FontFace(asset.fileId, `url(${url})`, descriptors);
      await face.load();
      document.fonts.add(face);
      loaded.push(face);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return loaded;
};

let textPreviewRouteGraphics;
let textPreviewRenderQueue = Promise.resolve();

const getTextPreviewRenderer = async (backgroundColor) => {
  if (textPreviewRouteGraphics) {
    textPreviewRouteGraphics.updatedBackgroundColor(backgroundColor);
    return textPreviewRouteGraphics;
  }

  const routeGraphics = createRouteGraphics();
  await routeGraphics.init({
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    backgroundColor,
    debug: true,
    animationPlaybackMode: "manual",
    plugins: { elements: [textPlugin] },
  });
  textPreviewRouteGraphics = routeGraphics;
  return routeGraphics;
};

const renderTextPreviewImage = ({ preview, fontAssets }) => {
  const renderJob = textPreviewRenderQueue.then(async () => {
    const loadedFontFaces = await loadFontFaces(fontAssets);
    try {
      const routeGraphics = await getTextPreviewRenderer(
        preview.backgroundColor,
      );
      routeGraphics.render(
        createRouteGraphicsTextPreviewState({
          preview,
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
        }),
      );
      return dataUrlToBlob(await routeGraphics.extractBase64());
    } finally {
      for (const face of loadedFontFaces) {
        document.fonts.delete(face);
      }
    }
  });

  textPreviewRenderQueue = renderJob.catch(() => undefined);
  return renderJob;
};

export const renderFontPreviewImage = async ({ font, fontAsset }) => {
  const { backgroundColor, color } = resolvePageColors();
  return renderTextPreviewImage({
    fontAssets: [fontAsset],
    preview: {
      mode: "thumbnail",
      content: "Aa",
      padding: 8,
      backgroundColor,
      horizontalAlignment: "center",
      verticalAlignment: "center",
      textStyle: {
        align: "left",
        fill: color,
        fontFamily: [font.fileId],
        fontSize: 60,
        fontWeight: font.defaultWeight ?? "normal",
        lineHeight: 1.5,
        strokeColor: "transparent",
        strokeWidth: 0,
      },
    },
  });
};

export const renderTextStylePreviewImage = async ({
  textStyle,
  fontAssets,
  fontFamilies,
  color,
  strokeColor,
  shadowColor,
}) => {
  const textStyleData = {
    align: "left",
    fill: color,
    fontFamily:
      fontAssets.length > 0
        ? fontAssets.map(({ fileId }) => fileId)
        : fontFamilies.length > 0
          ? fontFamilies
          : ["sans-serif"],
    fontSize: textStyle.fontSize ?? 16,
    fontWeight: textStyle.fontWeight ?? "400",
    lineHeight: textStyle.lineHeight ?? 1.5,
    strokeColor: strokeColor ?? "transparent",
    strokeWidth: strokeColor ? (textStyle.strokeWidth ?? 0) : 0,
  };
  if (shadowColor) {
    textStyleData.shadow = {
      color: shadowColor,
      alpha: textStyle.shadow?.alpha ?? 1,
      blur: textStyle.shadow?.blur ?? 0,
      offsetX: textStyle.shadow?.offsetX ?? 2,
      offsetY: textStyle.shadow?.offsetY ?? 2,
    };
  }

  return renderTextPreviewImage({
    fontAssets,
    preview: {
      mode: "thumbnail",
      content: textStyle.previewText?.trim() || textStyle.name,
      padding: 8,
      backgroundColor: getContrastBackground(color),
      textStyle: textStyleData,
    },
  });
};

const loadGraphicsImageAssets = async ({
  graphicsService,
  imageAssets,
  objectUrls,
}) => {
  const assets = {};
  for (const asset of imageAssets) {
    const url = URL.createObjectURL(
      new Blob([asset.bytes], { type: asset.mimeType }),
    );
    objectUrls.push(url);
    assets[asset.fileId] = { url, type: asset.mimeType };
  }
  if (Object.keys(assets).length > 0) {
    await graphicsService.loadAssets(assets);
  }
};

const recordAnimationPreviewVideo = async ({
  animation,
  imagesData,
  graphicsService,
  projectResolution,
}) => {
  const { resetState, renderState, durationMs } =
    createAnimationResourcePreviewStates({
      animationItem: animation,
      imagesData,
      projectResolution,
    });
  const recordingDurationMs =
    durationMs > 0 ? durationMs : STATIC_ANIMATION_PREVIEW_DURATION_MS;

  let recording;

  try {
    graphicsService.setAnimationTime(0);
    const preparationPassCount =
      animation.animation?.type === "transition" ? 2 : 1;
    for (let pass = 0; pass < preparationPassCount; pass += 1) {
      await graphicsService.render(resetState);
      await waitForPaint();
      await graphicsService.render(renderState);
      graphicsService.setAnimationTime(0);
      await waitForPaint();
    }

    recording = graphicsService.startCanvasVideoRecording({ frameRate: 60 });
    const startedAtMs = performance.now();
    let elapsedMs = 0;
    while (elapsedMs < recordingDurationMs) {
      graphicsService.setAnimationTime(elapsedMs);
      await wait(Math.min(16, recordingDurationMs - elapsedMs));
      elapsedMs = Math.max(0, performance.now() - startedAtMs);
    }
    graphicsService.setAnimationTime(recordingDurationMs);
    await waitForPaint();

    const video = await recording.stop();
    recording = undefined;
    return video;
  } finally {
    await recording?.stop().catch(() => undefined);
  }
};

export const renderAnimationPreviewVideos = async ({
  animations,
  imagesData,
  projectResolution,
}) => {
  if (animations.length === 0) {
    return [];
  }

  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  const imageAssets = Array.from(
    new Map(
      animations.flatMap(({ imageAssets: assets }) =>
        assets.map((asset) => [asset.fileId, asset]),
      ),
    ).values(),
  );
  const host = document.createElement("div");
  const graphicsService = await createGraphicsService();
  const objectUrls = [];

  try {
    await graphicsService.init({ canvas: host, width, height });
    await loadGraphicsImageAssets({
      graphicsService,
      imageAssets,
      objectUrls,
    });
    graphicsService.setAnimationPlaybackMode("manual");

    const previews = [];
    for (const { animationId, animation } of animations) {
      try {
        previews.push({
          animationId,
          blob: await recordAnimationPreviewVideo({
            animation,
            imagesData,
            graphicsService,
            projectResolution,
          }),
        });
      } catch (error) {
        throw new Error(
          `Could not generate preview for animation '${animation.name}' (${animationId}): ${error.message ?? "Unknown error"}`,
          { cause: error },
        );
      }
    }
    return previews;
  } finally {
    await graphicsService.destroy();
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    host.remove();
  }
};

export const renderAnimationPreviewVideo = async (options) => {
  const [preview] = await renderAnimationPreviewVideos({
    animations: [
      {
        animationId: options.animation.id,
        animation: options.animation,
        imageAssets: options.imageAssets,
      },
    ],
    imagesData: options.imagesData,
    projectResolution: options.projectResolution,
  });
  return preview.blob;
};

export const renderParticlePreviewVideo = async ({
  particle,
  imageItems,
  imageAssets,
}) => {
  const renderableParticle = createRenderableParticleData(particle, imageItems);
  const width = Math.max(1, Math.round(Number(renderableParticle.width) || 1));
  const height = Math.max(
    1,
    Math.round(Number(renderableParticle.height) || 1),
  );
  const host = document.createElement("div");
  const graphicsService = await createGraphicsService();
  const objectUrls = [];
  let recording;

  try {
    await graphicsService.init({ canvas: host, width, height });
    await loadGraphicsImageAssets({
      graphicsService,
      imageAssets,
      objectUrls,
    });

    recording = graphicsService.startCanvasVideoRecording({ frameRate: 60 });
    graphicsService.render(createParticlePreviewState(renderableParticle));
    await waitForPaint();
    await wait(PARTICLE_PREVIEW_DURATION_MS);
    const video = await recording.stop();
    recording = undefined;
    return video;
  } finally {
    await recording?.stop().catch(() => undefined);
    await graphicsService.destroy();
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    host.remove();
  }
};
