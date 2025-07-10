
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
  const { store, render, repository, uploadAudioFiles, httpClient } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await uploadAudioFiles(files, "someprojectId");

  // Extract waveform data and upload to API Object Storage
  const waveformPromises = successfulUploads.map(async (result) => {
    const waveformData = await AudioWaveformExtractor.extractWaveformData(result.file);
    
    if (!waveformData) {
      return {
        ...result,
        waveformDataFileId: null,
        duration: null,
      };
    }
    
    // Upload waveform data to API Object Storage
    const uploadResult = await AudioWaveformExtractor.uploadWaveformData(
      waveformData, 
      httpClient, 
      "someprojectId"
    );
    
    if (uploadResult.success) {
      return {
        ...result,
        waveformDataFileId: uploadResult.fileId,
        duration: waveformData.duration,
      };
    } else {
      return {
        ...result,
        waveformDataFileId: null,
        duration: waveformData.duration,
      };
    }
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
          waveformDataFileId: result.waveformDataFileId,
          duration: result.duration,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { audio } = repository.getState();
    store.setItems(audio);
  }

  render();
};

export const handleReplaceItem = async (e, deps) => {
  const { store, render, repository, uploadAudioFiles, httpClient } = deps;
  const { file } = e.detail;
  
  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }
  
  const uploadedFiles = await uploadAudioFiles([file], "someprojectId");
  
  if (uploadedFiles.length === 0) {
    return;
  }
  
  const uploadResult = uploadedFiles[0];
  
  // Extract waveform data and upload to API Object Storage
  const waveformData = await AudioWaveformExtractor.extractWaveformData(file);
  let waveformDataFileId = null;
  let duration = null;
  
  if (waveformData) {
    const uploadResult = await AudioWaveformExtractor.uploadWaveformData(
      waveformData, 
      httpClient, 
      "someprojectId"
    );
    
    if (uploadResult.success) {
      waveformDataFileId = uploadResult.fileId;
    }
    
    duration = waveformData.duration;
  }
  
  repository.addAction({
    actionType: "treeUpdate",
    target: "audio",
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        fileId: uploadResult.fileId,
        name: uploadResult.file.name,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        waveformDataFileId: waveformDataFileId,
        duration: duration,
      },
    },
  });
  
  // Update the store with the new repository state
  const { audio } = repository.getState();
  store.setItems(audio);
  render();
};

export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;
  
  if (detail.value === 'rename-item-confirmed') {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
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
