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
  dispatchEvent(new CustomEvent("audio-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handleAudioItemDoubleClick = (e, deps) => {
  const { store, render, props = {} } = deps;
  const itemId = e.currentTarget.id.replace("audio-item-", "");

  const flatGroups = props.flatGroups || [];
  let selectedAudio = null;
  
  for (const group of flatGroups) {
    if (group.children) {
      selectedAudio = group.children.find(item => item.id === itemId);
      if (selectedAudio) break;
    }
  }

  store.openAudioPlayer({ fileId: selectedAudio.fileId, fileName: selectedAudio.name });
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");
  
  // Forward file uploads to parent (parent will handle the actual upload logic)
  dispatchEvent(new CustomEvent("files-uploaded", {
    detail: { 
      files, 
      targetGroupId,
      originalEvent: e
    },
    bubbles: true,
    composed: true
  }));
};

export const handleAudioPlayerClose = (e, deps) => {
  const { store, render } = deps;

  store.closeAudioPlayer();
  render();
}