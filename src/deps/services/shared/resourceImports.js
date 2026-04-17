export const buildImageResourceDataFromUploadResult = (uploadResult = {}) => ({
  type: "image",
  fileId: uploadResult.fileId,
  thumbnailFileId: uploadResult.thumbnailFileId,
  name: uploadResult.displayName,
  fileType: uploadResult.file?.type,
  fileSize: uploadResult.file?.size,
  width: uploadResult.dimensions?.width,
  height: uploadResult.dimensions?.height,
});

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

  const imageId = await createImage({
    data: buildImageResourceDataFromUploadResult(uploadResult),
    fileRecords: uploadResult.fileRecords,
    parentId,
    position: "last",
  });

  if (imageId?.valid === false) {
    return imageId;
  }

  return {
    valid: true,
    imageId,
    uploadResult,
  };
};
