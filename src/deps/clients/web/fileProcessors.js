// Shared file processing utilities that are storage-agnostic

// Image processing utilities
export const getImageDimensions = (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url); // Clean up memory
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url); // Clean up memory
      resolve(null);
    };

    img.src = url;
  });
};

const loadImageElement = (file) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load image"));
    };

    image.src = url;
  });
};

const canvasToBlob = (canvas, type, quality) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Failed to create ${type} thumbnail blob`));
          return;
        }

        resolve(blob);
      },
      type,
      quality,
    );
  });
};

const getFileNameWithExtension = (name, extension) => {
  const normalizedName =
    String(name || "cropped-image").trim() || "cropped-image";
  const baseName = normalizedName.replace(/\.[^/.]+$/, "");
  return `${baseName}${extension}`;
};

const getScaledThumbnailDimensions = ({
  sourceWidth,
  sourceHeight,
  maxWidth = 320,
  maxHeight = 320,
} = {}) => {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error("Unable to read source dimensions");
  }

  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
};

export const extractImageThumbnail = async (imageFile, options = {}) => {
  const {
    maxWidth = 320,
    maxHeight = 320,
    preferredFormat = "image/webp",
    quality = 0.85,
  } = options;

  const image = await loadImageElement(imageFile);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error("Unable to read image dimensions");
  }

  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create thumbnail canvas context");
  }

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let blob;
  let format = preferredFormat;

  try {
    blob = await canvasToBlob(canvas, preferredFormat, quality);
  } catch {
    format = "image/png";
    blob = await canvasToBlob(canvas, format);
  }

  const dataUrl = canvas.toDataURL(format, quality);
  canvas.remove();

  return {
    blob,
    dataUrl,
    width,
    height,
    format,
  };
};

export const getVideoDimensions = (file) => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url); // Clean up memory
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url); // Clean up memory
      resolve(null);
    };

    video.src = url;
  });
};

export const validateIconDimensions = async (file) => {
  const dimensions = await getImageDimensions(file);

  if (!dimensions) {
    return {
      isValid: false,
      message: "Unable to read image dimensions",
    };
  }

  // Check if image is square
  if (dimensions.width !== dimensions.height) {
    return {
      isValid: false,
      message: `Image must be square. Current size: ${dimensions.width}x${dimensions.height}`,
    };
  }

  // Check minimum size
  if (dimensions.width < 64 || dimensions.height < 64) {
    return {
      isValid: false,
      message: `Image size must be at least 64x64 pixels. Current size: ${dimensions.width}x${dimensions.height}`,
    };
  }

  return {
    isValid: true,
    message: null,
  };
};

export const validateImageMinimumDimensions = async (
  file,
  { minWidth = 1, minHeight = 1 } = {},
) => {
  const dimensions = await getImageDimensions(file);

  if (!dimensions) {
    return {
      isValid: false,
      message: "Unable to read image dimensions",
    };
  }

  if (dimensions.width < minWidth || dimensions.height < minHeight) {
    return {
      isValid: false,
      message: `Image size must be at least ${minWidth}x${minHeight} pixels. Current size: ${dimensions.width}x${dimensions.height}`,
    };
  }

  return {
    isValid: true,
    message: null,
  };
};

export const createSquareCroppedImageFile = async ({
  file,
  sourceX = 0,
  sourceY = 0,
  sourceSize,
  outputSize,
  preferredFormat = "image/png",
  quality = 0.92,
} = {}) => {
  if (!file) {
    throw new Error("Image file is required.");
  }

  const image = await loadImageElement(file);
  const cropSize = Math.max(
    1,
    Math.min(
      image.naturalWidth,
      image.naturalHeight,
      Number(sourceSize) || Math.min(image.naturalWidth, image.naturalHeight),
    ),
  );
  const resolvedOutputSize = Math.max(
    1,
    Math.round(Number(outputSize) || cropSize),
  );
  const maxSourceX = Math.max(0, image.naturalWidth - cropSize);
  const maxSourceY = Math.max(0, image.naturalHeight - cropSize);
  const safeSourceX = Math.min(Math.max(0, Number(sourceX) || 0), maxSourceX);
  const safeSourceY = Math.min(Math.max(0, Number(sourceY) || 0), maxSourceY);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create crop canvas context");
  }

  canvas.width = resolvedOutputSize;
  canvas.height = resolvedOutputSize;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, resolvedOutputSize, resolvedOutputSize);
  context.drawImage(
    image,
    safeSourceX,
    safeSourceY,
    cropSize,
    cropSize,
    0,
    0,
    resolvedOutputSize,
    resolvedOutputSize,
  );

  const blob = await canvasToBlob(canvas, preferredFormat, quality);
  canvas.remove();

  const fileName = getFileNameWithExtension(file.name, ".png");
  if (typeof File === "function") {
    return new File([blob], fileName, {
      type: preferredFormat,
      lastModified: Date.now(),
    });
  }

  blob.name = fileName;
  blob.lastModified = Date.now();
  return blob;
};

// Audio waveform extraction and processing utilities
export const extractWaveformDataFromArrayBuffer = async (
  arrayBuffer,
  samples = 1000,
) => {
  let audioContext;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(
      arrayBuffer.slice(0),
    );

    const channelData = audioBuffer.getChannelData(0);
    const sampleCount = Math.max(
      1,
      Math.min(samples, channelData.length || samples),
    );
    const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));
    const waveformData = [];

    for (let i = 0; i < sampleCount; i++) {
      const start = i * blockSize;
      const end = start + blockSize;
      let sum = 0;

      for (let j = start; j < end && j < channelData.length; j++) {
        sum += Math.abs(channelData[j]);
      }

      const average = sum / blockSize;
      waveformData.push(average);
    }

    const maxAmplitude = Math.max(...waveformData);
    const normalizedData =
      maxAmplitude > 0
        ? waveformData.map((value) => value / maxAmplitude)
        : waveformData.map(() => 0);

    // Return waveform data structure
    // amplitudes: normalized amplitude values (0-1) for visualization
    // duration: audio duration in seconds (rounded to 2 decimal places)
    return {
      amplitudes: normalizedData,
      duration: Math.round(audioBuffer.duration * 100) / 100,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    };
  } catch (error) {
    throw new Error(
      `Failed to decode audio file: ${error.message || "Unsupported format"}`,
    );
  } finally {
    try {
      await audioContext?.close();
    } catch {
      // Ignore close errors from partially initialized contexts.
    }
  }
};

export const extractWaveformData = async (audioFile, samples = 1000) => {
  const arrayBuffer = await audioFile.arrayBuffer();
  return extractWaveformDataFromArrayBuffer(arrayBuffer, samples);
};

const VIDEO_THUMBNAIL_EVENT_TIMEOUT_MS = 1000;
const VIDEO_THUMBNAIL_ACTIVITY_TIMEOUT_MS = 2000;

const clampNumber = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
};

const drawVideoFrameToCanvas = ({ ctx, video, width, height } = {}) => {
  const videoAspectRatio = video.videoWidth / video.videoHeight;
  const canvasAspectRatio = width / height;

  let drawWidth;
  let drawHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (videoAspectRatio > canvasAspectRatio) {
    drawHeight = height;
    drawWidth = height * videoAspectRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / videoAspectRatio;
    offsetY = (height - drawHeight) / 2;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
};

const buildVideoThumbnailSampleTimes = ({
  duration,
  timeOffset = 0,
  sampleCount = 7,
} = {}) => {
  const safeDuration = Number.isFinite(duration) ? Math.max(duration, 0) : 0;
  const maxSeekTime = Math.max(0, safeDuration - 0.1);

  if (maxSeekTime === 0) {
    return [0];
  }

  const preferredOffset = clampNumber(
    Math.min(timeOffset, maxSeekTime * 0.5),
    0,
    maxSeekTime,
  );
  const leadingSkip = Math.min(
    Math.max(safeDuration * 0.1, 0.2),
    maxSeekTime * 0.5,
  );
  const trailingSkip = Math.min(
    Math.max(safeDuration * 0.1, 0.2),
    maxSeekTime * 0.5,
  );
  const rangeStart = clampNumber(
    Math.max(preferredOffset, leadingSkip),
    0,
    maxSeekTime,
  );
  const rangeEnd = clampNumber(
    maxSeekTime - trailingSkip,
    rangeStart,
    maxSeekTime,
  );
  const normalizedSampleCount = Math.max(1, Math.round(sampleCount));

  if (normalizedSampleCount === 1 || rangeStart === rangeEnd) {
    return [rangeStart];
  }

  const step = (rangeEnd - rangeStart) / (normalizedSampleCount - 1);
  const sampleTimes = [];

  for (let index = 0; index < normalizedSampleCount; index += 1) {
    sampleTimes.push(Number((rangeStart + step * index).toFixed(3)));
  }

  return [...new Set(sampleTimes)];
};

const analyzeVideoFrame = ({ ctx, width, height } = {}) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const brightnessByColumn = new Float32Array(width);

  let brightnessSum = 0;
  let brightnessSquaredSum = 0;
  let colorfulnessSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let pixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    let leftBrightness;

    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const brightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const rg = red - green;
      const yb = (red + green) * 0.5 - blue;
      const colorfulness = Math.sqrt(rg * rg + yb * yb);

      brightnessSum += brightness;
      brightnessSquaredSum += brightness * brightness;
      colorfulnessSum += colorfulness;
      pixelCount += 1;

      if (x > 0) {
        edgeSum += Math.abs(brightness - leftBrightness);
        edgeCount += 1;
      }

      if (y > 0) {
        edgeSum += Math.abs(brightness - brightnessByColumn[x]);
        edgeCount += 1;
      }

      leftBrightness = brightness;
      brightnessByColumn[x] = brightness;
    }
  }

  const brightnessMean = pixelCount > 0 ? brightnessSum / pixelCount : 0;
  const brightnessVariance =
    pixelCount > 0
      ? Math.max(
          0,
          brightnessSquaredSum / pixelCount - brightnessMean * brightnessMean,
        )
      : 0;
  const brightnessStdDev = Math.sqrt(brightnessVariance);
  const colorfulnessMean = pixelCount > 0 ? colorfulnessSum / pixelCount : 0;
  const edgeStrength = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const isTooDark = brightnessMean < 35 && edgeStrength < 24;
  const isTooFlat =
    brightnessStdDev < 18 && edgeStrength < 20 && colorfulnessMean < 18;
  const isLowValueFrame = isTooDark || isTooFlat;
  const exposureScore = Math.max(0, 255 - Math.abs(brightnessMean - 128) * 1.5);
  const score =
    brightnessStdDev * 3 +
    edgeStrength * 4 +
    colorfulnessMean * 0.25 +
    exposureScore;

  return {
    score,
    isLowValueFrame,
  };
};

const waitForVideoFrame = async (
  video,
  { timeoutMs = VIDEO_THUMBNAIL_EVENT_TIMEOUT_MS } = {},
) => {
  if (typeof video.requestVideoFrameCallback === "function") {
    await new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      }, timeoutMs);

      video.requestVideoFrameCallback(() => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        resolve();
      });
    });
    return;
  }

  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
};

const waitForVideoLoadedData = async (
  video,
  { timeoutMs = VIDEO_THUMBNAIL_EVENT_TIMEOUT_MS } = {},
) => {
  if (video.readyState >= 2) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for video frame data"));
    }, timeoutMs);
    const handleLoadedData = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to load video frame data"));
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("error", handleError);
  });
};

const seekVideoToTime = async (
  video,
  targetTime,
  { timeoutMs = VIDEO_THUMBNAIL_EVENT_TIMEOUT_MS } = {},
) => {
  const maxSeekTime = Math.max(0, (video.duration || 0) - 0.1);
  const normalizedTime = clampNumber(targetTime, 0, maxSeekTime);

  await waitForVideoLoadedData(video, { timeoutMs });

  if (Math.abs(video.currentTime - normalizedTime) < 0.001) {
    await waitForVideoFrame(video, { timeoutMs });
    return normalizedTime;
  }

  await new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out seeking video while generating thumbnail (${normalizedTime}s)`,
        ),
      );
    }, timeoutMs);
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to seek video while generating thumbnail"));
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    video.currentTime = normalizedTime;
  });

  await waitForVideoFrame(video, { timeoutMs });
  return normalizedTime;
};

const captureVideoFrameAtTime = async ({
  video,
  ctx,
  width,
  height,
  time,
  timeoutMs = VIDEO_THUMBNAIL_EVENT_TIMEOUT_MS,
} = {}) => {
  if (time !== undefined) {
    await seekVideoToTime(video, time, { timeoutMs });
  } else {
    await waitForVideoLoadedData(video, { timeoutMs });
    await waitForVideoFrame(video, { timeoutMs });
  }

  drawVideoFrameToCanvas({
    ctx,
    video,
    width,
    height,
  });
};

// Video thumbnail extraction
const extractScoredVideoThumbnail = async (videoFile, options = {}) => {
  const {
    timeOffset = 2,
    maxWidth = 320,
    maxHeight = 320,
    format = "image/jpeg",
    quality = 0.8,
    sampleCount = 7,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const bestCanvas = document.createElement("canvas");
    const bestCtx = bestCanvas.getContext("2d");
    const fallbackCanvas = document.createElement("canvas");
    const fallbackCtx = fallbackCanvas.getContext("2d");
    const analysisCanvas = document.createElement("canvas");
    const analysisCtx = analysisCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    analysisCanvas.width = 48;
    analysisCanvas.height = 27;

    if (!bestCtx || !fallbackCtx || !analysisCtx) {
      reject(new Error("Unable to create video thumbnail canvas context"));
      return;
    }

    let objectUrl;
    let settled = false;
    let activityTimeoutId;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignore cleanup errors from partially initialized media elements.
      }

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      if (activityTimeoutId) {
        window.clearTimeout(activityTimeoutId);
      }

      video.remove();
      bestCanvas.remove();
      fallbackCanvas.remove();
      analysisCanvas.remove();
    };

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const resolveOnce = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    const logContext = {
      fileName: videoFile?.name ?? "",
      fileSize: videoFile?.size ?? 0,
      sampleCount,
    };

    const refreshActivityTimeout = (stage = "unknown") => {
      if (settled) {
        return;
      }

      if (activityTimeoutId) {
        window.clearTimeout(activityTimeoutId);
      }

      activityTimeoutId = window.setTimeout(() => {
        console.warn("[videoThumbnail] extract.stalled", {
          ...logContext,
          stage,
        });
        rejectOnce(new Error("Timed out while generating video thumbnail"));
      }, VIDEO_THUMBNAIL_ACTIVITY_TIMEOUT_MS);
    };

    video.onerror = (error) => {
      console.warn("[videoThumbnail] load.failed", {
        ...logContext,
        error: error?.message || "Unknown error",
      });
      rejectOnce(
        new Error(`Video load error: ${error.message || "Unknown error"}`),
      );
    };

    video.onloadedmetadata = async () => {
      try {
        refreshActivityTimeout("metadata-loaded");
        const outputDimensions = getScaledThumbnailDimensions({
          sourceWidth: video.videoWidth,
          sourceHeight: video.videoHeight,
          maxWidth,
          maxHeight,
        });
        const { width, height } = outputDimensions;
        bestCanvas.width = width;
        bestCanvas.height = height;
        fallbackCanvas.width = width;
        fallbackCanvas.height = height;
        const sampleTimes = buildVideoThumbnailSampleTimes({
          duration: video.duration,
          timeOffset,
          sampleCount,
        });
        console.info("[videoThumbnail] metadata.loaded", {
          ...logContext,
          duration: video.duration,
          sampleTimes,
        });

        let bestCandidate;
        let bestFallbackCandidate;
        let sampledFrameCount = 0;

        for (const sampleTime of sampleTimes) {
          if (settled) {
            return;
          }

          refreshActivityTimeout(`sampling-${sampleTime}`);

          try {
            await captureVideoFrameAtTime({
              video,
              ctx: analysisCtx,
              width: analysisCanvas.width,
              height: analysisCanvas.height,
              time: sampleTime,
            });
          } catch (error) {
            console.warn("[videoThumbnail] sample.failed", {
              ...logContext,
              sampleTime,
              error: error?.message ?? "Unknown error",
            });
            continue;
          }

          if (settled) {
            return;
          }

          refreshActivityTimeout(`sampled-${sampleTime}`);
          sampledFrameCount += 1;

          const frameAnalysis = analyzeVideoFrame({
            ctx: analysisCtx,
            width: analysisCanvas.width,
            height: analysisCanvas.height,
          });
          const candidate = {
            time: sampleTime,
            score: frameAnalysis.score,
            isLowValueFrame: frameAnalysis.isLowValueFrame,
          };

          if (
            !bestFallbackCandidate ||
            candidate.score > bestFallbackCandidate.score
          ) {
            bestFallbackCandidate = candidate;
            drawVideoFrameToCanvas({
              ctx: fallbackCtx,
              video,
              width,
              height,
            });
          }

          if (candidate.isLowValueFrame) {
            continue;
          }

          if (!bestCandidate || candidate.score > bestCandidate.score) {
            bestCandidate = candidate;
            drawVideoFrameToCanvas({
              ctx: bestCtx,
              video,
              width,
              height,
            });
          }
        }

        const chosenCandidate = bestCandidate ?? bestFallbackCandidate;
        if (!chosenCandidate) {
          console.warn("[videoThumbnail] sampling.empty", {
            ...logContext,
            sampleTimes,
          });
          refreshActivityTimeout("capturing-fallback-frame");
          await captureVideoFrameAtTime({
            video,
            ctx: fallbackCtx,
            width,
            height,
          });
        } else {
          console.info("[videoThumbnail] frame.selected", {
            ...logContext,
            sampledFrameCount,
            selectedTime: chosenCandidate.time,
            score: Number(chosenCandidate.score.toFixed(2)),
            usedFallbackFrame: !bestCandidate,
          });
        }

        refreshActivityTimeout("encoding-thumbnail");
        const selectedCanvas = bestCandidate ? bestCanvas : fallbackCanvas;
        const blob = await canvasToBlob(selectedCanvas, format, quality);
        const dataUrl = selectedCanvas.toDataURL(format, quality);

        resolveOnce({
          blob,
          dataUrl,
          width,
          height,
          format,
          selectedTime: chosenCandidate?.time ?? 0,
        });
      } catch (error) {
        if (settled) {
          return;
        }

        console.warn("[videoThumbnail] extract.failed", {
          ...logContext,
          error: error?.message ?? "Unknown error",
        });
        rejectOnce(new Error(`Thumbnail extraction error: ${error.message}`));
      }
    };

    refreshActivityTimeout("waiting-for-metadata");
    objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;
  });
};

const extractInitialVideoThumbnail = async (videoFile, options = {}) => {
  const {
    timeOffset = 1,
    maxWidth = 320,
    maxHeight = 320,
    format = "image/jpeg",
    quality = 0.8,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Unable to create fallback video thumbnail canvas"));
      return;
    }

    let objectUrl;
    let settled = false;
    let activityTimeoutId;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignore cleanup errors from partially initialized media elements.
      }

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      if (activityTimeoutId) {
        window.clearTimeout(activityTimeoutId);
      }

      video.remove();
      canvas.remove();
    };

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };

    const resolveOnce = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    const logContext = {
      fileName: videoFile?.name ?? "",
      fileSize: videoFile?.size ?? 0,
    };

    const refreshActivityTimeout = (stage = "unknown") => {
      if (settled) {
        return;
      }

      if (activityTimeoutId) {
        window.clearTimeout(activityTimeoutId);
      }

      activityTimeoutId = window.setTimeout(() => {
        console.warn("[videoThumbnail] fallback.stalled", {
          ...logContext,
          stage,
        });
        rejectOnce(
          new Error("Timed out while generating fallback video thumbnail"),
        );
      }, VIDEO_THUMBNAIL_ACTIVITY_TIMEOUT_MS);
    };

    video.onerror = (error) => {
      rejectOnce(
        new Error(
          `Fallback video load error: ${error?.message || "Unknown error"}`,
        ),
      );
    };

    video.onloadedmetadata = async () => {
      try {
        refreshActivityTimeout("fallback-metadata-loaded");
        const outputDimensions = getScaledThumbnailDimensions({
          sourceWidth: video.videoWidth,
          sourceHeight: video.videoHeight,
          maxWidth,
          maxHeight,
        });
        const { width, height } = outputDimensions;
        canvas.width = width;
        canvas.height = height;
        const maxSeekTime = Math.max(0, (video.duration || 0) - 0.1);
        const fallbackTime = clampNumber(
          Math.min(timeOffset, maxSeekTime),
          0,
          maxSeekTime,
        );

        try {
          await captureVideoFrameAtTime({
            video,
            ctx,
            width,
            height,
            time: fallbackTime > 0 ? fallbackTime : undefined,
          });
        } catch (seekError) {
          console.warn("[videoThumbnail] fallback.seek-failed", {
            ...logContext,
            fallbackTime,
            error: seekError?.message ?? "Unknown error",
          });
          refreshActivityTimeout("fallback-current-frame");
          await captureVideoFrameAtTime({
            video,
            ctx,
            width,
            height,
          });
        }

        refreshActivityTimeout("fallback-encoding-thumbnail");
        const blob = await canvasToBlob(canvas, format, quality);
        const dataUrl = canvas.toDataURL(format, quality);

        resolveOnce({
          blob,
          dataUrl,
          width,
          height,
          format,
          selectedTime: fallbackTime,
        });
      } catch (error) {
        rejectOnce(
          new Error(`Fallback thumbnail extraction error: ${error.message}`),
        );
      }
    };

    refreshActivityTimeout("fallback-waiting-for-metadata");
    objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;
  });
};

export const extractVideoThumbnail = async (videoFile, options = {}) => {
  try {
    return await extractScoredVideoThumbnail(videoFile, options);
  } catch (error) {
    console.warn("[videoThumbnail] fallback.attempt", {
      fileName: videoFile?.name ?? "",
      fileSize: videoFile?.size ?? 0,
      error: error?.message ?? "Unknown error",
    });
    return extractInitialVideoThumbnail(videoFile, options);
  }
};

// File type detection utility
export const detectFileType = (file) => {
  const ext = file.name.split(".").pop()?.toLowerCase();

  // Check MIME type first
  if (file.type === "video/mp4") return "video";
  if (
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    (file.type.startsWith("image/") &&
      ["jpg", "jpeg", "png", "webp"].includes(ext))
  ) {
    return "image";
  }
  if (
    [
      "audio/mpeg",
      "audio/x-mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/wave",
      "audio/ogg",
    ].includes(file.type)
  ) {
    return "audio";
  }

  // Fallback to extension check (mainly for fonts which often have no MIME type)
  if (!ext) return "generic";

  if (["ttf", "otf", "woff", "woff2", "ttc"].includes(ext)) return "font";

  // Additional fallbacks for common formats with unreliable MIME types
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  if (["mp3", "wav", "ogg"].includes(ext)) return "audio";
  if (ext === "mp4") return "video";

  return "generic";
};
