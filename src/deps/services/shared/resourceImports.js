export const buildImageResourceDataFromUploadResult = (uploadResult = {}) => ({
  type: "image",
  fileId: uploadResult.fileId,
  thumbnailFileId: uploadResult.thumbnailFileId,
  name: uploadResult.displayName,
  width: uploadResult.dimensions?.width,
  height: uploadResult.dimensions?.height,
});

export const buildImageResourcePatchFromUploadResult = (uploadResult = {}) => ({
  fileId: uploadResult.fileId,
  thumbnailFileId: uploadResult.thumbnailFileId,
  name: uploadResult.displayName,
  width: uploadResult.dimensions?.width,
  height: uploadResult.dimensions?.height,
});

export const buildSoundResourceDataFromUploadResult = (uploadResult = {}) => ({
  type: "sound",
  fileId: uploadResult.fileId,
  name: uploadResult.displayName,
  description: "",
  waveformDataFileId: uploadResult.waveformDataFileId,
  duration: uploadResult.duration,
});

export const buildSoundResourcePatchFromUploadResult = (uploadResult = {}) => ({
  fileId: uploadResult.fileId,
  waveformDataFileId: uploadResult.waveformDataFileId,
  duration: uploadResult.duration,
});

export const buildVoiceResourceDataFromUploadResult = ({
  uploadResult = {},
  sceneId,
} = {}) => ({
  type: "voice",
  fileId: uploadResult.fileId,
  name: uploadResult.displayName,
  description: "",
  sceneId,
  waveformDataFileId: uploadResult.waveformDataFileId,
  duration: uploadResult.duration,
});

export const buildVideoResourceDataFromUploadResult = (uploadResult = {}) => ({
  type: "video",
  fileId: uploadResult.fileId,
  thumbnailFileId: uploadResult.thumbnailFileId,
  name: uploadResult.displayName,
  description: "",
  duration: uploadResult.duration,
  width: uploadResult.dimensions?.width,
  height: uploadResult.dimensions?.height,
});

export const buildVideoResourcePatchFromUploadResult = (uploadResult = {}) => ({
  fileId: uploadResult.fileId,
  thumbnailFileId: uploadResult.thumbnailFileId,
  name: uploadResult.displayName,
  duration: uploadResult.duration,
  width: uploadResult.dimensions?.width,
  height: uploadResult.dimensions?.height,
});

const assignFontWeightFields = (data, uploadResult = {}) => {
  const capabilities = uploadResult.fontCapabilities;
  if (
    capabilities?.minWeight !== undefined &&
    capabilities.defaultWeight !== undefined &&
    capabilities.maxWeight !== undefined
  ) {
    data.minWeight = capabilities.minWeight;
    data.defaultWeight = capabilities.defaultWeight;
    data.maxWeight = capabilities.maxWeight;
  }

  return data;
};

export const buildFontResourceDataFromUploadResult = ({
  uploadResult = {},
  name,
  description = "",
  fontFamily,
} = {}) => {
  const data = {
    type: "font",
    fileId: uploadResult.fileId,
    name: name ?? uploadResult.displayName,
    description,
    fontFamily,
  };

  return assignFontWeightFields(data, uploadResult);
};

export const buildFontResourcePatchFromUploadResult = ({
  uploadResult = {},
  fontFamily,
} = {}) => {
  const data = {
    fileId: uploadResult.fileId,
    fontFamily,
  };

  return assignFontWeightFields(data, uploadResult);
};

const createMissingUploadResult = (message) => ({
  valid: false,
  error: {
    code: "upload_failed",
    message,
  },
});

export const importImageFile = async ({
  file,
  parentId,
  imageId,
  uploadFiles,
  createImage,
} = {}) => {
  const uploadResults = await uploadFiles([file]);
  const uploadResult = Array.isArray(uploadResults)
    ? uploadResults[0]
    : undefined;

  if (!uploadResult) {
    return createMissingUploadResult("Failed to upload image.");
  }

  const createdImageId = await createImage({
    imageId,
    data: buildImageResourceDataFromUploadResult(uploadResult),
    fileRecords: uploadResult.fileRecords,
    parentId,
    position: "last",
  });

  if (createdImageId?.valid === false) {
    return createdImageId;
  }

  return {
    valid: true,
    imageId: createdImageId,
    uploadResult,
  };
};
