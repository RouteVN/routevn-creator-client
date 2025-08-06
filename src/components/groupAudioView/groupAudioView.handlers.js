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

export const handleBeforeMount = (deps) => {
  const { store, userConfig } = deps;

  // Initialize panel widths from userConfig
  const leftWidth = parseInt(
    userConfig.get("resizablePanel.file-explorerWidth") || "280",
    10,
  );
  const rightWidth = parseInt(
    userConfig.get("resizablePanel.detail-panelWidth") || "320",
    10,
  );

  // Add 64px offset for the sidebar
  store.updateAudioPlayerPosition({
    left: leftWidth + 64,
    right: rightWidth,
  });
};

export const subscriptions = (deps) => {
  const { store, render, subject } = deps;

  return [
    subject.pipe().subscribe(({ action, payload }) => {
      if (action === "panel-resize" || action === "panel-resize-end") {
        // Update width based on which panel is resizing
        if (payload.panelType === "file-explorer") {
          // Add 64px offset for the sidebar on the left
          store.updateAudioPlayerLeft(payload.width + 64);
        } else if (payload.panelType === "detail-panel") {
          store.updateAudioPlayerRight(payload.width);
        }
        render();
      }
    }),
  ];
};
