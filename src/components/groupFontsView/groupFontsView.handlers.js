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

// Helper function to load font face dynamically
const loadFontFace = async (fontName, fontUrl) => {
  if (!document.fonts) return null;
  
  const fontFace = new FontFace(fontName, `url(${fontUrl})`);
  await fontFace.load();
  document.fonts.add(fontFace);
  return fontFace;
};


export const handleOnMount = async (deps) => {
  const { props = {}, render, httpClient } = deps;
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
  
  // Load existing fonts in parallel
  const loadPromises = allFontItems.map(async (item) => {
    if (!item.name || !item.name.match(/\.(ttf|otf|woff|woff2)$/i)) {
      return;
    }
    
    const fontName = item.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
    let fontUrl;
    
    // Try to get download URL from fileId if available
    if (item.fileId && httpClient?.creator?.getFileContent) {
      const response = await httpClient.creator.getFileContent({ 
        fileId: item.fileId, 
        projectId: 'someprojectId' 
      });
      fontUrl = response?.url;
    }
    
    if (fontUrl) {
      await loadFontFace(fontName, fontUrl);
    }
  });
  
  await Promise.all(loadPromises);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { dispatchEvent } = deps;
  const { files } = e.detail;
  const targetGroupId = e.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");
  
  // Load fonts for preview if they are font files
  for (const file of files) {
    if (file.name.match(/\.(ttf|otf|woff|woff2)$/i)) {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
      const fontUrl = URL.createObjectURL(file);
      await loadFontFace(fontName, fontUrl);
    }
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