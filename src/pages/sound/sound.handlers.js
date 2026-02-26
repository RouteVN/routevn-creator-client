import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";
import { formatFileSize } from "../../utils/index.js";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const formatDuration = (duration) => {
  if (!duration && duration !== 0) {
    return "Unknown";
  }

  return `${Math.floor(duration / 60).toString()}:${Math.floor(duration % 60)
    .toString()
    .padStart(2, "0")}`;
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      name: "",
      fileType: "",
      fileSize: "",
      duration: "",
    };
  }

  return {
    name: item.name || "",
    fileType: item.fileType || "",
    fileSize: formatFileSize(item.fileSize),
    duration: formatDuration(item.duration),
  };
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

const mountLegacySubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => {
  return mountLegacySubscriptions(deps);
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render, appService } = deps;
  await projectService.ensureRepository();
  const { sounds } = projectService.getState();
  store.setItems({ soundData: sounds || { tree: [], items: {} } });

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

  store.setItems({ soundData: soundData });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload?._event?.detail || {};
  const id = resolveDetailItemId(detail);
  const { item, isFolder } = detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      context: {
        fileId: {
          waveformData: null,
        },
      },
    });
    render();
    return;
  }

  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  const selectedItem = item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  let waveformData = null;

  // If we have item data with waveformDataFileId, set up media context for preview
  if (selectedItem?.waveformDataFileId) {
    waveformData = await projectService.downloadMetadata(
      selectedItem.waveformDataFileId,
    );
  }

  store.setContext({
    context: {
      fileId: {
        waveformData,
      },
    },
  });

  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: id,
    });
  }
};

export const handleFileExplorerDoubleClick = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  store.setSelectedItemId({ itemId: itemId });

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
  const { store, render, projectService, refs } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);

  if (!selectedItem?.waveformDataFileId) {
    // Clear waveform data when no waveformDataFileId
    store.setContext({
      context: {
        fileId: {
          waveformData: null,
        },
      },
    });
    render();
    if (selectedItem) {
      syncDetailFormValues({
        deps,
        values: detailValues,
        selectedItemId: itemId,
      });
    }
    return;
  }

  const waveformData = await projectService.downloadMetadata(
    selectedItem.waveformDataFileId,
  );

  store.setContext({
    context: {
      fileId: {
        waveformData,
      },
    },
  });
  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
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
    await projectService.createResourceItem({
      resourceType: "sounds",
      resourceId: nanoid(),
      data: {
        type: "sound",
        fileId: result.fileId,
        name: result.displayName,
        fileType: result.file.type,
        fileSize: result.file.size,
        waveformDataFileId: result.waveformDataFileId,
        duration: result.duration,
      },
      parentId: id,
      position: "last",
    });
  }

  if (successfulUploads.length > 0) {
    const { sounds } = projectService.getState();
    store.setItems({ soundData: sounds });
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
  const selectedItemId = store.selectSelectedItemId();
  await projectService.updateResourceItem({
    resourceType: "sounds",
    resourceId: selectedItem.id,
    patch: {
      fileId: uploadResult.fileId,
      fileType: uploadResult.file.type,
      fileSize: uploadResult.file.size,
      waveformDataFileId: uploadResult.waveformDataFileId,
      duration: uploadResult.duration,
    },
  });

  // Update the store with the new repository state
  const { sounds } = projectService.getState();

  // Use the waveform data directly (already normalized)
  const waveformData = uploadResult.waveformData;

  store.setContext({
    context: {
      fileId: {
        waveformData,
      },
    },
  });
  store.setItems({ soundData: sounds });
  const updatedSelectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(updatedSelectedItem);
  render();

  if (updatedSelectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  await projectService.updateResourceItem({
    resourceType: "sounds",
    resourceId: selectedItemId,
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { sounds } = projectService.getState();
  store.setItems({ soundData: sounds });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery({ query: searchQuery });
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
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ soundData: data });
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

const subscriptions = (deps) => {
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
