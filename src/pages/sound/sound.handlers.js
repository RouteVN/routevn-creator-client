import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render, appService } = deps;
  await projectService.ensureRepository();
  const { sounds } = projectService.getState();
  store.setItems(sounds || { tree: [], items: {} });

  // Initialize audio player positions from userConfig
  const defaultLeft = parseInt(
    appService.getUserConfig("resizablePanel.file-explorerWidth"),
  );
  const defaultRight = parseInt(
    appService.getUserConfig("resizablePanel.detail-panelWidth"),
  );
  store.updateAudioPlayerLeft({ width: defaultLeft, appService });
  store.updateAudioPlayerRight({ width: defaultRight, appService });

  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { sounds } = projectService.getState();
  const soundData = sounds || { tree: [], items: {} };

  store.setItems(soundData);
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId(null);
    store.setContext({
      fileId: {
        waveformData: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId(id);

  // If we have item data with waveformDataFileId, set up media context for preview
  if (item && item.waveformDataFileId) {
    const waveformData = await projectService.downloadMetadata(
      item.waveformDataFileId,
    );

    store.setContext({
      fileId: {
        waveformData,
      },
    });
  }

  render();
};

export const handleFileExplorerDoubleClick = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();
  if (selectedItem) {
    store.openAudioPlayer({
      fileId: selectedItem.fileId,
      fileName: selectedItem.name,
    });
  }
  render();
};

export const handleSoundItemClick = async (deps, payload) => {
  const { store, render, projectService, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  if (!selectedItem?.waveformDataFileId) {
    // Clear waveform data when no waveformDataFileId
    store.setContext({
      fileId: {
        waveformData: null,
      },
    });
    render();
    return;
  }

  const waveformData = await projectService.downloadMetadata(
    selectedItem.waveformDataFileId,
  );

  store.setContext({
    fileId: {
      waveformData,
    },
  });
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  let successfulUploads;
  try {
    successfulUploads = await projectService.uploadFiles(files);
  } catch {
    await appService.showDialog({
      title: "Unsupported Format",
      message:
        "The audio file format is not supported. Please use MP3, WAV, or OGG (Windows only) files.",
      confirmText: "OK",
    });
    return;
  }

  // Add all items to repository
  for (const result of successfulUploads) {
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "sounds",
        value: {
          id: nanoid(),
          type: "sound",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          waveformDataFileId: result.waveformDataFileId,
          duration: result.duration,
        },
        options: {
          parent: id,
          position: "last",
        },
      },
    });
  }

  if (successfulUploads.length > 0) {
    const { sounds } = projectService.getState();
    store.setItems(sounds);
  }

  render();
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for sound replacement");
    return;
  }

  const files = await appService.pickFiles({
    accept: "audio/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  let uploadedFiles;
  try {
    uploadedFiles = await projectService.uploadFiles([file]);
  } catch {
    await appService.showDialog({
      title: "Unsupported Format",
      message:
        "The audio file format is not supported. Please use MP3, WAV, or OGG (Windows only) files.",
      confirmText: "OK",
    });
    return;
  }

  const uploadResult = uploadedFiles[0];
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "sounds",
      value: {
        fileId: uploadResult.fileId,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        waveformDataFileId: uploadResult.waveformDataFileId,
        duration: uploadResult.duration,
      },
      options: {
        id: selectedItem.id,
        replace: false,
      },
    },
  });

  // Update the store with the new repository state
  const { sounds } = projectService.getState();

  // Use the waveform data directly (already normalized)
  const waveformData = uploadResult.waveformData;

  store.setContext({
    fileId: {
      waveformData,
    },
  });
  store.setItems(sounds);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "sounds",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { sounds } = projectService.getState();
  store.setItems(sounds);
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleSoundItemDoubleClick = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;

  const selectedItem = store.selectSelectedItem();
  if (selectedItem && selectedItem.id === itemId) {
    store.openAudioPlayer({
      fileId: selectedItem.fileId,
      fileName: selectedItem.name,
    });
    render();
  }
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;

  store.closeAudioPlayer();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  await projectService.appendEvent({
    type: "treeDelete",
    payload: {
      target: resourceType,
      options: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems(data);
  render();
};

export const handlePanelResize = (deps, payload) => {
  const { store, render, appService } = deps;
  const { panelType, width } = payload;
  // Handle file-explorer panel resize to adjust audio player position
  if (panelType === "file-explorer") {
    store.updateAudioPlayerLeft({ width, appService });
    render();
  }

  // Handle detail-panel resize to adjust audio player position
  if (panelType === "detail-panel") {
    store.updateAudioPlayerRight({ width, appService });
    render();
  }
};

export const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === "panel-resize"),
      tap(({ payload }) => {
        handlePanelResize(deps, payload);
      }),
    ),
  ];
};
