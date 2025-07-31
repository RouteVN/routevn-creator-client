const getImageDimensions = (file) => {
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

export const createImageFileUploader = ({ httpClient }) => {
  return async (files, projectId) => {
    // Create upload promises for all files
    const uploadPromises = Array.from(files).map(async (file) => {
      try {
        // Get image dimensions before uploading
        const dimensions = await getImageDimensions(file);

        const { downloadUrl, uploadUrl, fileId } =
          await httpClient.creator.uploadFile({
            projectId,
          });

        const response = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type, // Ensure the Content-Type matches the file type
          },
        });

        if (response.ok) {
          console.log("File uploaded successfully:", file.name);
          return {
            success: true,
            file,
            downloadUrl,
            fileId,
            dimensions,
          };
        } else {
          console.error("File upload failed:", file.name, response.statusText);
          return {
            success: false,
            file,
            error: response.statusText,
          };
        }
      } catch (error) {
        console.error("File upload error:", file.name, error);
        return {
          success: false,
          file,
          error: error.message,
        };
      }
    });

    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);

    // Add successfully uploaded files to repository
    // TODO: Add error handling for failed uploads
    const successfulUploads = uploadResults.filter((result) => result.success);

    return successfulUploads;
  };
};

// Audio waveform extraction and processing utilities
const extractWaveformData = async (audioFile, samples = 1000) => {
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

const uploadWaveformData = async (waveformData, httpClient, projectId) => {
  try {
    const waveformJson = JSON.stringify(waveformData);
    const blob = new Blob([waveformJson], { type: "application/json" });

    const { uploadUrl, fileId } = await httpClient.creator.uploadFile({
      projectId: projectId,
    });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: blob,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return { fileId, success: true };
    } else {
      return { fileId: null, success: false };
    }
  } catch (error) {
    return { fileId: null, success: false };
  }
};

export const downloadWaveformData = async (fileId, httpClient) => {
  try {
    const { url } = await httpClient.creator.getFileContent({
      fileId: fileId,
      projectId: "someprojectId",
    });
    const response = await fetch(url);

    if (response.ok) {
      const waveformData = await response.json();
      return waveformData;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
};

export const createAudioFileUploader = ({ httpClient }) => {
  return async (files, projectId) => {
    // Create upload promises for all files
    const uploadPromises = Array.from(files).map(async (file) => {
      try {
        // Extract waveform data
        const waveformData = await extractWaveformData(file);

        // Upload audio file
        const { downloadUrl, uploadUrl, fileId } =
          await httpClient.creator.uploadFile({
            projectId,
          });

        const response = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!response.ok) {
          return {
            success: false,
            file,
            error: response.statusText,
          };
        }

        // Upload waveform data if extraction was successful
        let waveformDataFileId = null;
        let duration = null;

        if (waveformData) {
          const waveformUploadResult = await uploadWaveformData(
            waveformData,
            httpClient,
            projectId,
          );

          if (waveformUploadResult.success) {
            waveformDataFileId = waveformUploadResult.fileId;
          }

          duration = waveformData.duration;
        }

        return {
          success: true,
          file,
          downloadUrl,
          fileId,
          waveformDataFileId,
          duration,
          waveformData,
        };
      } catch (error) {
        return {
          success: false,
          file,
          error: error.message,
        };
      }
    });

    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);

    // Add successfully uploaded files to repository
    const successfulUploads = uploadResults.filter((result) => result.success);

    return successfulUploads;
  };
};

const extractVideoThumbnail = async (videoFile, options = {}) => {
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

export const createVideoFileUploader = ({ httpClient }) => {
  return async (files, projectId) => {
    // Create upload promises for all files
    const uploadPromises = Array.from(files).map(async (file) => {
      try {
        // Extract thumbnail for video files
        let thumbnailData = null;
        if (file.type.startsWith("video/")) {
          try {
            console.log(`Extracting thumbnail for video: ${file.name}`);
            thumbnailData = await extractVideoThumbnail(file, {
              timeOffset: 1,
              width: 240,
              height: 135,
              format: "image/jpeg",
              quality: 0.8,
            });
            console.log(`Thumbnail extracted successfully for: ${file.name}`);
          } catch (error) {
            return {
              success: false,
              file,
              error: error.message,
            };
          }
        }

        // Get upload URLs for both video and thumbnail in parallel
        const [videoUpload, thumbnailUpload] = await Promise.all([
          httpClient.creator.uploadFile({
            projectId,
          }),
          httpClient.creator.uploadFile({
            projectId,
          }),
        ]);

        // Upload both files in parallel
        const [videoResponse, thumbnailResponse] = await Promise.all([
          fetch(videoUpload.uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          }),
          fetch(thumbnailUpload.uploadUrl, {
            method: "PUT",
            body: thumbnailData.blob,
            headers: {
              "Content-Type": thumbnailData.format,
            },
          }),
        ]);

        if (videoResponse.ok && thumbnailResponse.ok) {
          console.log("File uploaded successfully:", file.name);

          return {
            success: true,
            file,
            downloadUrl: videoUpload.downloadUrl,
            fileId: videoUpload.fileId,
            thumbnailFileId: thumbnailUpload.fileId,
            thumbnailData,
          };
        } else {
          console.error(
            "File upload failed:",
            file.name,
            videoResponse.statusText,
          );
          return {
            success: false,
            file,
            error: videoResponse.statusText,
          };
        }
      } catch (error) {
        console.error("File upload error:", file.name, error);
        return {
          success: false,
          file,
          error: error.message,
        };
      }
    });

    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);

    // Add successfully uploaded files to repository
    // TODO: Add error handling for failed uploads
    const successfulUploads = uploadResults.filter((result) => result.success);

    return successfulUploads;
  };
};

export const createFontFileUploader = ({ httpClient, fontManager }) => {
  return async (files, projectId) => {
    // Create upload promises for all files
    const uploadPromises = Array.from(files).map(async (file) => {
      try {
        // Load font file for preview using fontManager
        const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
        const fontUrl = URL.createObjectURL(file);

        try {
          await fontManager.load(fontName, fontUrl);
        } catch (loadError) {
          console.error("Font loading error:", file.name, loadError);
          return {
            success: false,
            file,
            error: loadError.message,
          };
        }

        const { downloadUrl, uploadUrl, fileId } =
          await httpClient.creator.uploadFile({
            projectId,
          });

        const response = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (response.ok) {
          console.log("Font file uploaded successfully:", file.name);
          return {
            success: true,
            file,
            downloadUrl,
            fileId,
            fontName,
            fontUrl,
          };
        } else {
          console.error(
            "Font file upload failed:",
            file.name,
            response.statusText,
          );
          return {
            success: false,
            file,
            error: response.statusText,
          };
        }
      } catch (error) {
        console.error("Font file upload error:", file.name, error);
        return {
          success: false,
          file,
          error: error.message,
        };
      }
    });

    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);

    // Add successfully uploaded files to repository
    const successfulUploads = uploadResults.filter((result) => result.success);

    return successfulUploads;
  };
};

export const createGetFileContent = ({ httpClient }) => {
  return async ({ fileId, projectId }) => {
    const result = await httpClient.creator.getFileContent({
      fileId,
      projectId,
    });
    return result;
  };
};
