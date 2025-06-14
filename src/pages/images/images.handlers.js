export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { images } = repository.getState();
  store.setItems(images);
}

// export const handleTargetChanged = (payload, deps) => {
//   const { store, localData, render } = deps;
//   localData.backgrounds.createItem('_root', {
//     name: 'New Item',
//     level: 0
//   })
//   store.setItems(localData.backgrounds.toJSONFlat())
//   render();
// }

export const handleFileExplorerRightClickContainer = (e, deps) => {
  const { store, render } = deps;
  const detail = e.detail;
  store.showDropdownMenuFileExplorerEmpty({
    position: {
      x: detail.x,
      y: detail.y,
    },
  });
  render();
};

export const handleFileExplorerRightClickItem = (e, deps) => {
  const { store, render } = deps;
  store.showDropdownMenuFileExplorerItem({
    position: {
      x: e.detail.x,
      y: e.detail.y,
    },
    id: e.detail.id,
  });
  render();
}

export const handleDropdownMenuClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
}

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render, repository } = deps;

  const { item } = e.detail;
  if (item.value === 'new-item') {
    const { images } = repository.getState();
    const lastItem = images.tree[images.tree.length - 1]?.id;
    const previousSibling = lastItem ? lastItem : undefined;
    repository.addAction({
      actionType: 'treePush',
      target: 'images',
      value: {
        parent: '_root',
        previousSibling,
        item: {
          id: 'image' + Date.now(),
          type: 'folder',
          name: 'New Folder',
        }
      }
    })
  } else if (item.value === 'rename-item') {
    const itemId = store.selectDropdownMenuItemId();
    const { x, y } = store.selectDropdownMenuPosition();
    store.showPopover({ 
      position: { x, y }, 
      itemId 
    });
  } else if (item.value === 'delete-item') {
    const itemId = store.selectDropdownMenuItemId();
    const { images } = repository.getState();
    const currentItem = images.items[itemId];
    
    if (currentItem) {
      repository.addAction({
        actionType: 'treeDelete',
        target: 'images',
        value: {
          id: itemId
        }
      });
    }
  } else if (item.value === 'new-child-folder') {
    const itemId = store.selectDropdownMenuItemId();
    const { images } = repository.getState();
    const currentItem = images.items[itemId];
    const lastItem = images.tree[images.tree.length - 1]?.id;
    const previousSibling = lastItem ? lastItem : undefined;

    if (currentItem) {
      repository.addAction({
        actionType: 'treePush',
        target: 'images',
        value: {
          parent: itemId,
          previousSibling,
          item: {
            id: 'image' + Date.now(),
            type: 'folder',
            name: 'New Folder',
          }
        }
      });
    }
  }


  store.hideDropdownMenu();
  const { images } = repository.getState();
  store.setItems(images)
  render();
}

export const handleAssetItemClick = (e, deps) => {
  const { subject, store } = deps;
  const id = e.target.id.split('-')[2];
  const assetItem = store.selectAssetItem(id);
  subject.dispatch('redirect', {
    path: assetItem.path,
  })
}

export const handlePopoverClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
}

export const handleFormActionClick = (e, deps) => {
  const { store, render, repository } = deps;
  const { formValues, actionId } = e.detail;
  
  if (actionId === 'submit' && formValues.name) {
    const itemId = store.selectPopoverItem()?.id;
    if (itemId) {
      repository.addAction({
        actionType: 'treeUpdate',
        target: 'images',
        value: {
          id: itemId,
          replace: false,
          item: {
            name: formValues.name
          }
        }
      });
      
      // Update local state
      const { images } = repository.getState();
      store.setItems(images);
    }
  }
  
  store.hidePopover();
  render();
}

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace('group-', '');
  store.toggleGroupCollapse(groupId);
  render();
}

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { files } = e.detail;
  console.log('selected', e.currentTarget.id);
  const id = e.currentTarget.id.replace('drag-drop-', '');
  // upload files to server
  // update repository

  // Create upload promises for all files
  const uploadPromises = Array.from(files).map(async (file) => {
    try {
      const { downloadUrl, uploadUrl, fileId } = await httpClient.creator.uploadFile({
        projectId: 'someprojectId',
      });

      console.log('downloadUrl', {
        file: file.name,
        downloadUrl,
        uploadUrl,
        fileId,
      });

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type, // Ensure the Content-Type matches the file type
        },
      });
      
      if (response.ok) {
        console.log('File uploaded successfully:', file.name);
        return {
          success: true,
          file,
          downloadUrl,
          fileId,
        };
      } else {
        console.error('File upload failed:', file.name, response.statusText);
        return {
          success: false,
          file,
          error: response.statusText,
        };
      }
    } catch (error) {
      console.error('File upload error:', file.name, error);
      return {
        success: false,
        file,
        error: error.message,
      };
    }
  });

  // Wait for all uploads to complete
  const uploadResults = await Promise.all(uploadPromises);

  // Add successfully uploaded files to repository
  const successfulUploads = uploadResults.filter(result => result.success);
  
  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: 'treePush',
      target: 'images',
      value: {
        parent: id,
        // previousSibling,
        item: {
          id: 'image' + Date.now() + Math.random(), // Add randomness to ensure unique IDs
          type: 'image',
          name: result.file.name,
        }
      }
    });
  });

  if (successfulUploads.length > 0) {
    const { images } = repository.getState();
    store.setItems(images);
  }

  console.log(`Uploaded ${successfulUploads.length} out of ${files.length} files successfully`);
  render();
}
