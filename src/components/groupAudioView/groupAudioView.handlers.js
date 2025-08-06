export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleAudioItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("audio-item-", "");

  // Forward audio item selection to parent
  dispatchEvent(
    new CustomEvent("audio-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAudioItemDoubleClick = (e, deps) => {
  const { store, render, props = {} } = deps;
  const itemId = e.currentTarget.id.replace("audio-item-", "");

  const flatGroups = props.flatGroups || [];
  let selectedAudio = null;

  for (const group of flatGroups) {
    if (group.children) {
      selectedAudio = group.children.find((item) => item.id === itemId);
      if (selectedAudio) break;
    }
  }

  store.openAudioPlayer({
    fileId: selectedAudio.fileId,
    fileName: selectedAudio.name,
  });
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");

  // Forward file uploads to parent (parent will handle the actual upload logic)
  dispatchEvent(
    new CustomEvent("files-uploaded", {
      detail: {
        files,
        targetGroupId,
        originalEvent: e,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAudioPlayerClose = (e, deps) => {
  const { store, render } = deps;

  store.closeAudioPlayer();
  render();
};

export const handleAfterMount = (deps) => {
  const { store, render, userConfig } = deps;

  // Store current panel widths
  let currentLeftWidth = parseInt(
    userConfig.get("resizablePanel.file-explorerWidth") || "280",
    10,
  );
  let currentRightWidth = parseInt(
    userConfig.get("resizablePanel.detail-panelWidth") || "320",
    10,
  );

  // Function to update position
  const updatePosition = () => {
    store.updateAudioPlayerPosition({
      left: currentLeftWidth,
      right: currentRightWidth,
    });
    render();
  };

  // Initial position
  updatePosition();

  // Listen for panel resize events using subject
  const { subject } = deps;
  if (subject) {
    const subscription = subject.pipe().subscribe(({ action, payload }) => {
      if (action === "panel-resize") {
        // Update width during resize based on which panel is resizing
        if (payload.panelType === "file-explorer") {
          currentLeftWidth = payload.width;
        } else if (payload.panelType === "detail-panel") {
          currentRightWidth = payload.width;
        }
        updatePosition();
      } else if (action === "panel-resize-end") {
        // Update from userConfig when resize ends (in case of any discrepancy)
        currentLeftWidth = parseInt(
          userConfig.get("resizablePanel.file-explorerWidth") || "280",
          10,
        );
        currentRightWidth = parseInt(
          userConfig.get("resizablePanel.detail-panelWidth") || "320",
          10,
        );
        updatePosition();
      }
    });

    // Store subscription for cleanup
    store._resizeSubscription = subscription;
  }
};

export const handleBeforeUnmount = (deps) => {
  const { store } = deps;
  if (store._resizeSubscription) {
    store._resizeSubscription.unsubscribe();
  }
};
