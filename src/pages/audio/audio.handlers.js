
import { nanoid } from "nanoid";
import { AudioWaveformExtractor } from "../../utils/audioWaveform.js";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { audio } = repository.getState();
  store.setItems(audio || { tree: [], items: {} })

  return () => {}
}

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { audio } = repository.getState();
  const audioData = audio || { tree: [], items: {} };
  
  store.setItems(audioData);
  render();
};

export const handleAudioItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Create upload promises for all files
  const uploadPromises = Array.from(files).map(async (file) => {
    try {
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
        return {
          success: true,
          file,
          downloadUrl,
          fileId,
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

  // Extract waveform data and generate images for all successful uploads
  const waveformPromises = successfulUploads.map(async (result) => {
    const waveformData = await AudioWaveformExtractor.extractWaveformData(result.file);
    
    if (!waveformData) {
      return {
        ...result,
        waveformFileId: null,
        duration: null,
      };
    }
    
    // Generate both full-size and thumbnail waveform images
    const [waveformBlob, thumbnailBlob] = await Promise.all([
      AudioWaveformExtractor.generateWaveformImage(waveformData, 600, 400), // 3:2 ratio for detail view
      AudioWaveformExtractor.generateWaveformThumbnail(waveformData) // Smaller for list view
    ]);
    
    if (!waveformBlob || !thumbnailBlob) {
      return {
        ...result,
        waveformFileId: null,
        waveformThumbnailFileId: null,
        duration: waveformData?.duration || null,
      };
    }
    
    // Upload both images
    try {
      const [waveformUpload, thumbnailUpload] = await Promise.all([
        httpClient.creator.uploadFile({ projectId: "someprojectId" }),
        httpClient.creator.uploadFile({ projectId: "someprojectId" })
      ]);
      
      const [waveformResponse, thumbnailResponse] = await Promise.all([
        fetch(waveformUpload.uploadUrl, {
          method: "PUT",
          body: waveformBlob,
          headers: { "Content-Type": "image/png" },
        }),
        fetch(thumbnailUpload.uploadUrl, {
          method: "PUT",
          body: thumbnailBlob,
          headers: { "Content-Type": "image/png" },
        })
      ]);
      
      if (waveformResponse.ok && thumbnailResponse.ok) {
        console.log("Waveform images uploaded successfully for:", result.file.name);
        return {
          ...result,
          waveformFileId: waveformUpload.fileId,
          waveformThumbnailFileId: thumbnailUpload.fileId,
          duration: waveformData?.duration || null,
        };
      }
    } catch (error) {
      console.error("Failed to upload waveform images:", error);
    }
    
    return {
      ...result,
      waveformFileId: null,
      waveformThumbnailFileId: null,
      duration: waveformData?.duration || null,
    };
  });

  // Wait for all waveform extractions to complete
  const uploadsWithWaveforms = await Promise.all(waveformPromises);

  // Add all items to repository
  uploadsWithWaveforms.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "audio",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "audio",
          fileId: result.fileId,
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
          waveformFileId: result.waveformFileId,
          waveformThumbnailFileId: result.waveformThumbnailFileId,
          duration: result.duration,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { audio } = repository.getState();
    store.setItems(audio);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleReplaceItem = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { file, field } = e.detail;
  
  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn('No item selected for audio replacement');
    return;
  }
  
  try {
    // Upload the new file
    const { downloadUrl, uploadUrl, fileId } = await httpClient.creator.uploadFile({
      projectId: "someprojectId",
    });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (response.ok) {
      console.log("Audio replaced successfully:", file.name);
      
      const waveformData = await AudioWaveformExtractor.extractWaveformData(file);
      let waveformFileId = null;
      let waveformThumbnailFileId = null;
      
      if (waveformData) {
        const [waveformBlob, thumbnailBlob] = await Promise.all([
          AudioWaveformExtractor.generateWaveformImage(waveformData, 600, 400),
          AudioWaveformExtractor.generateWaveformThumbnail(waveformData)
        ]);
        
        if (waveformBlob && thumbnailBlob) {
          try {
            const [waveformUpload, thumbnailUpload] = await Promise.all([
              httpClient.creator.uploadFile({ projectId: "someprojectId" }),
              httpClient.creator.uploadFile({ projectId: "someprojectId" })
            ]);
            
            const [waveformResponse, thumbnailResponse] = await Promise.all([
              fetch(waveformUpload.uploadUrl, {
                method: "PUT",
                body: waveformBlob,
                headers: { "Content-Type": "image/png" },
              }),
              fetch(thumbnailUpload.uploadUrl, {
                method: "PUT",
                body: thumbnailBlob,
                headers: { "Content-Type": "image/png" },
              })
            ]);
            
            if (waveformResponse.ok && thumbnailResponse.ok) {
              waveformFileId = waveformUpload.fileId;
              waveformThumbnailFileId = thumbnailUpload.fileId;
              console.log("Waveform images uploaded successfully");
            }
          } catch (error) {
            console.error("Failed to upload waveform images:", error);
          }
        }
      }
      
      // Update the selected item in the repository with the new file information
      repository.addAction({
        actionType: "treeUpdate",
        target: "audio",
        value: {
          id: selectedItem.id,
          replace: false,
          item: {
            fileId: fileId,
            name: file.name,
            fileType: file.type,
            fileSize: file.size,
            waveformFileId: waveformFileId,
            waveformThumbnailFileId: waveformThumbnailFileId,
            duration: waveformData?.duration || null,
          },
        },
      });
      
      // Update the store with the new repository state
      const { audio } = repository.getState();
      store.setItems(audio);
      render();
      
    } else {
      console.error("Audio upload failed:", file.name, response.statusText);
    }
  } catch (error) {
    console.error("Audio upload error:", file.name, error);
  }
};

export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;
  
  if (detail.value === 'rename-item-confirmed') {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
      console.warn('No item selected for rename');
      return;
    }
    
    // Update the item name in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "audio",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: detail.newName,
        },
      },
    });
    
    // Update the store with the new repository state
    const { audio } = repository.getState();
    store.setItems(audio);
    render();
  }
};
