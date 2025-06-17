export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");
  
  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleLayoutItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("layout-item-", "");
  
  // Forward layout item selection to parent
  dispatchEvent(new CustomEvent("image-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handleLayoutItemDoubleClick = (e, deps) => {
  const { subject } = deps;
  const itemId = e.currentTarget.id.replace("layout-item-", "");
  
  // Redirect to layout editor with layoutId payload
  subject.dispatch('redirect', {
    path: '/project/resources/layout-editor',
    payload: {
      layoutId: itemId
    }
  });
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