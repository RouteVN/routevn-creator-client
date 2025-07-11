export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || '';
  
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
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("font-item-", "");
  
  // Forward font item selection to parent
  dispatchEvent(new CustomEvent("font-item-click", {
    detail: { itemId },
    bubbles: true,
    composed: true
  }));
};

export const handleOnMount = async (deps) => {
  const { props = {}, render, httpClient, fontManager, loadFontFile } = deps;
  const { flatGroups = [] } = props;
  
  // Extract all font items from all groups
  const allFontItems = [];
  
  for (const group of flatGroups) {
    if (group.children) {
      allFontItems.push(...group.children);
    }
  }
  
  if (!allFontItems.length) {
    return;
  }
  
  // Load existing fonts in parallel using loadFontFile function
  const loadPromises = allFontItems.map(item => {    
    // Ensure fontFamily is set for loadFontFile
    const fontItem = {
      ...item,
      fontFamily: item.fontFamily
    };
    
    return loadFontFile(fontItem, httpClient, fontManager);
  });
  
  await Promise.all(loadPromises);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent, fontManager } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");
  
  // Load fonts for preview
  for (const file of files) {
    const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
    const fontUrl = URL.createObjectURL(file);
    await fontManager.load(fontName, fontUrl);
  }
  
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