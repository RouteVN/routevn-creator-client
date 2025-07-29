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

export const handleFontItemClick = (e, deps) => {
  console.log("👆 Single click on font item:", e.currentTarget.id);
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("font-item-", "");

  // Forward font item selection to parent
  dispatchEvent(
    new CustomEvent("font-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleFontItemDoubleClick = (e, deps) => {
  console.log("🖱️ Double-click detected on font item:", e.currentTarget.id);
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("font-item-", "");
  
  console.log("📤 Dispatching font-item-double-click event with itemId:", itemId);

  // Forward double-click event to parent
  dispatchEvent(
    new CustomEvent("font-item-double-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
  
  console.log("✅ Double-click event dispatched successfully");
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent, fontManager } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");

  // Load fonts for preview
  for (const file of files) {
    const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
    const fontUrl = URL.createObjectURL(file);
    await fontManager.load(fontName, fontUrl);
  }

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
