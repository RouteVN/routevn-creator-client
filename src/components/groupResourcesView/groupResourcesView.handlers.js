export const handleSearchInput = (e, deps) => {
  const { dispatchEvent } = deps;
  const searchQuery = e.detail.value || "";

  // Forward search input to parent
  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value: searchQuery },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleGroupClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Forward group toggle to parent
  dispatchEvent(
    new CustomEvent("group-toggle", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("item-", "");

  // Forward item selection to parent
  dispatchEvent(
    new CustomEvent("item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemDoubleClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("item-", "");

  // Forward double-click event to parent
  dispatchEvent(
    new CustomEvent("item-dblclick", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent, fontManager, props = {} } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");

  // For fonts, load them for preview
  if (props.resourceType === "fonts" && fontManager) {
    for (const file of files) {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
      const fontUrl = URL.createObjectURL(file);
      await fontManager.load(fontName, fontUrl);
    }
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
