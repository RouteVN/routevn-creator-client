// HTTP storage adapter - implements storage operations via HTTP API

export const createHttpStorageAdapter = ({ httpClient }) => {
  return {
    // Store a file via HTTP upload
    storeFile: async (file, projectId) => {
      try {
        // Get upload URL from server
        const { downloadUrl, uploadUrl, fileId } =
          await httpClient.creator.uploadFile({
            projectId,
          });

        // Upload the file
        const response = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        return { fileId, downloadUrl };
      } catch (error) {
        console.error("HTTP storage error:", error);
        throw error;
      }
    },

    // Get file content URL from server
    getFileUrl: async (fileId, projectId) => {
      try {
        const result = await httpClient.creator.getFileContent({
          fileId,
          projectId,
        });
        return result;
      } catch (error) {
        console.error("Failed to get file URL:", error);
        throw error;
      }
    },

    // Store metadata (like waveform data) as JSON
    storeMetadata: async function (data, projectId) {
      try {
        const jsonBlob = new Blob([JSON.stringify(data)], {
          type: "application/json",
        });

        // Reuse storeFile for metadata
        const result = await this.storeFile(jsonBlob, projectId);
        return result;
      } catch (error) {
        console.error("Failed to store metadata:", error);
        throw error;
      }
    },
  };
};
