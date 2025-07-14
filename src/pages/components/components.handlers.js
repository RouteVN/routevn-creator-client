
import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { components } = repository.getState();
  store.setItems(components);

  return () => {}
};


export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { components } = repository.getState();
  store.setItems(components);
  render();
};


export const handleImageItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleComponentCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "components",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "component",
        name: name,
        layout: {
          items: {},
          tree: []
        }
      },
    },
  });

  const { components } = repository.getState();
  store.setItems(components);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Create upload promises for all files
  const uploadPromises = Array.from(files).map(async (file) => {
    try {
      const { downloadUrl, uploadUrl, fileId } =
        await httpClient.creator.uploadFile({
          projectId: "someprojectId",
        });

      const response = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type, // Ensure the Content-Type matches the file type
        },
      });

      if (response.ok) {
        console.log("File uploaded successfully:", file.name);
        return {
          success: true,
          file,
          downloadUrl,
          fileId,
        };
      } else {
        console.error("File upload failed:", file.name, response.statusText);
        return {
          success: false,
          file,
          error: response.statusText,
        };
      }
    } catch (error) {
      console.error("File upload error:", file.name, error);
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
  const successfulUploads = uploadResults.filter((result) => result.success);

  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "components",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "component",
          fileId: result.fileId,
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
          layout: {
            items: {},
            tree: []
          }
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { components } = repository.getState();
    store.setItems(components);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleDetailPanelItemUpdate = (e, deps) => {
  const { repository, store, render } = deps;

  repository.addAction({
    actionType: "treeUpdate",
    target: "components",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  const { components } = repository.getState();
  store.setItems(components);
  render();
};
