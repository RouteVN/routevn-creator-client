
import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";

const extractVideoThumbnail = async (videoFile, options = {}) => {
  const {
    timeOffset = 2,
    width = 320,
    height = 240,
    format = 'image/jpeg',
    quality = 0.8
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = width;
    canvas.height = height;
    
    video.onerror = (error) => {
      reject(new Error(`Video load error: ${error.message || 'Unknown error'}`));
    };
    
    video.onloadedmetadata = () => {
      const seekTime = Math.min(timeOffset, video.duration - 0.1);
      video.currentTime = seekTime;
    };
    
    video.onseeked = () => {
      try {
        const videoAspectRatio = video.videoWidth / video.videoHeight;
        const canvasAspectRatio = width / height;
        
        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
        
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
        
        canvas.toBlob((blob) => {
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
              format
            });
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }
        }, format, quality);
        
      } catch (error) {
        reject(new Error(`Thumbnail extraction error: ${error.message}`));
      }
    };
    
    video.src = URL.createObjectURL(videoFile);
  });
};

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { videos } = repository.getState();
  store.setItems(videos);

  return () => {}
};


export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { videos } = repository.getState();
  store.setItems(videos);
  render();
};


export const handleVideoItemClick = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  
  // Get the selected item to check if it's a video
  const { videos } = repository.getState();
  const flatItems = toFlatItems(videos);
  const selectedItem = flatItems.find(item => item.id === itemId);
  
  // If it's a video and we don't have the URL cached, fetch it
  if (selectedItem && selectedItem.type === 'video' && selectedItem.fileId) {
    const state = store.getState();
    if (!state.videoUrls[selectedItem.fileId]) {
      try {
        const { url } = await httpClient.creator.getFileContent({ 
          fileId: selectedItem.fileId, 
          projectId: 'someprojectId' 
        });
        store.setVideoUrl({ fileId: selectedItem.fileId, url });
      } catch (error) {
        console.error('Error fetching video URL:', error);
      }
    }
  }
  
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Create upload promises for all files
  const uploadPromises = Array.from(files).map(async (file) => {
    try {
      // Extract thumbnail for video files
      let thumbnailData = null;
      if (file.type.startsWith('video/')) {
        try {
          console.log(`Extracting thumbnail for video: ${file.name}`);
          thumbnailData = await extractVideoThumbnail(file, {
            timeOffset: 1,
            width: 240,
            height: 135,
            format: 'image/jpeg',
            quality: 0.8
          });
          console.log(`Thumbnail extracted successfully for: ${file.name}`);
        } catch (thumbnailError) {
          console.warn(`Failed to extract thumbnail for ${file.name}:`, thumbnailError);
        }
      }

      // Upload the main video file
      const { downloadUrl, uploadUrl, fileId } =
        await httpClient.creator.uploadFile({
          projectId: "someprojectId",
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
        
        // Upload thumbnail if extracted successfully
        let thumbnailFileId = null;
        if (thumbnailData) {
          try {
            const thumbnailUpload = await httpClient.creator.uploadFile({
              projectId: "someprojectId",
            });
            
            const thumbnailResponse = await fetch(thumbnailUpload.uploadUrl, {
              method: "PUT",
              body: thumbnailData.blob,
              headers: {
                "Content-Type": thumbnailData.format,
              },
            });
            
            if (thumbnailResponse.ok) {
              thumbnailFileId = thumbnailUpload.fileId;
              console.log(`Thumbnail uploaded successfully for: ${file.name}`);
            } else {
              console.warn(`Thumbnail upload failed for ${file.name}:`, thumbnailResponse.statusText);
            }
          } catch (thumbnailUploadError) {
            console.warn(`Thumbnail upload error for ${file.name}:`, thumbnailUploadError);
          }
        }
        
        return {
          success: true,
          file,
          downloadUrl,
          fileId,
          thumbnailFileId,
          thumbnailData
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
  const successfulUploads = uploadResults.filter((result) => result.success);

  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "videos",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "video",
          fileId: result.fileId,
          thumbnailFileId: result.thumbnailFileId,
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { videos } = repository.getState();
    store.setItems(videos);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};
