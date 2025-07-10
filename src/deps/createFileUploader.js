
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

export const createFileUploader = ({ httpClient }) => {
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
  }
}
