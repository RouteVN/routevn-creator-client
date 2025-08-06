// Backward compatibility wrapper for existing file upload functions
// This ensures no breaking changes while transitioning to the new fileManager

// Create individual upload functions that match the old interface exactly
export const createCompatibilityUploaders = (fileManager) => {
  // Image uploader - matches createImageFileUploader interface
  const createImageFileUploader = () => {
    return async (files, projectId) => {
      // The old interface returns the same structure as fileManager.upload
      return fileManager.upload(files, projectId);
    };
  };

  // Audio uploader - matches createAudioFileUploader interface
  const createAudioFileUploader = () => {
    return async (files, projectId) => {
      return fileManager.upload(files, projectId);
    };
  };

  // Video uploader - matches createVideoFileUploader interface
  const createVideoFileUploader = () => {
    return async (files, projectId) => {
      return fileManager.upload(files, projectId);
    };
  };

  // Font uploader - matches createFontFileUploader interface
  const createFontFileUploader = () => {
    return async (files, projectId) => {
      return fileManager.upload(files, projectId);
    };
  };

  // Download waveform data - matches createDownloadWaveformData interface
  const createDownloadWaveformData = () => {
    return async ({ fileId }) => {
      return fileManager.downloadMetadata({ fileId });
    };
  };

  // Get file content - matches createGetFileContent interface
  const createGetFileContent = () => {
    return async ({ fileId, projectId }) => {
      return fileManager.getFileContent({ fileId, projectId });
    };
  };

  // Load font file function
  const loadFontFile = () => {
    return async ({ fontName, fileId, projectId }) => {
      return fileManager.loadFontFile({ fontName, fileId, projectId });
    };
  };

  return {
    createImageFileUploader,
    createAudioFileUploader,
    createVideoFileUploader,
    createFontFileUploader,
    createDownloadWaveformData,
    createGetFileContent,
    loadFontFile,
  };
};

// Helper to create all the old-style uploaders from a fileManager
export const createLegacyUploaders = ({
  fileManager,
  httpClient,
  fontManager,
}) => {
  const compat = createCompatibilityUploaders(fileManager);

  // Create instances matching the old interface
  const uploadImageFiles = compat.createImageFileUploader();
  const uploadAudioFiles = compat.createAudioFileUploader();
  const uploadVideoFiles = compat.createVideoFileUploader();
  const uploadFontFiles = compat.createFontFileUploader();
  const downloadWaveformData = compat.createDownloadWaveformData();
  const getFileContent = compat.createGetFileContent();
  const loadFontFileFunc = compat.loadFontFile();

  return {
    uploadImageFiles,
    uploadAudioFiles,
    uploadVideoFiles,
    uploadFontFiles,
    downloadWaveformData,
    getFileContent,
    loadFontFile: loadFontFileFunc,
  };
};
