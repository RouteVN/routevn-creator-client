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

// Audio waveform extraction and processing utilities
export const extractWaveformData = async (audioFile, samples = 1000) => {
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / samples);
    const waveformData = [];

    for (let i = 0; i < samples; i++) {
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
    const normalizedData = waveformData.map((value) => value / maxAmplitude);

    audioContext.close();

    return {
      data: normalizedData,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    };
  } catch (error) {
    return null;
  }
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
