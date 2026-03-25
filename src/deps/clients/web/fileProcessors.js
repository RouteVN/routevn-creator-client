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

// Video thumbnail extraction
export const extractVideoThumbnail = async (videoFile, options = {}) => {
  const {
    timeOffset = 2,
    width = 320,
    height = 240,
    format = "image/jpeg",
    quality = 0.8,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    video.onerror = (error) => {
      reject(
        new Error(`Video load error: ${error.message || "Unknown error"}`),
      );
    };

    video.onloadedmetadata = () => {
      const seekTime = Math.min(timeOffset, video.duration - 0.1);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        const videoAspectRatio = video.videoWidth / video.videoHeight;
        const canvasAspectRatio = width / height;

        let drawWidth,
          drawHeight,
          offsetX = 0,
          offsetY = 0;

        if (videoAspectRatio > canvasAspectRatio) {
          drawHeight = height;
          drawWidth = height * videoAspectRatio;
          offsetX = (width - drawWidth) / 2;
        } else {
          drawWidth = width;
          drawHeight = width / videoAspectRatio;
          offsetY = (height - drawHeight) / 2;
        }

        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const dataUrl = canvas.toDataURL(format, quality);

              video.remove();
              canvas.remove();
              URL.revokeObjectURL(video.src);

              resolve({
                blob,
                dataUrl,
                width,
                height,
                format,
              });
            } else {
              reject(new Error("Failed to create thumbnail blob"));
            }
          },
          format,
          quality,
        );
      } catch (error) {
        reject(new Error(`Thumbnail extraction error: ${error.message}`));
      }
    };

    video.src = URL.createObjectURL(videoFile);
  });
};

// File type detection utility
export const detectFileType = (file) => {
  // Check MIME type first
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";

  // Fallback to extension check (mainly for fonts which often have no MIME type)
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext) return "generic";

  if (["ttf", "otf", "woff", "woff2", "ttc"].includes(ext)) return "font";

  // Additional fallbacks for common formats with unreliable MIME types
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext))
    return "image";
  if (["mp3", "wav", "ogg", "aac", "m4a", "flac"].includes(ext)) return "audio";
  if (["mp4", "webm", "avi", "mov", "mkv"].includes(ext)) return "video";

  return "generic";
};
