import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";
import { formatFileSize } from "../../utils/index.js";

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      name: "",
      fileType: "",
      fileSize: "",
      dimensions: "",
    };
  }

  return {
    name: item.name || "",
    fileType: item.fileType || "",
    fileSize: formatFileSize(item.fileSize),
    dimensions: `${item.width} × ${item.height}`,
  };
};

const COLLAB_IMAGES_REFRESH_ACTION = "collab.images.refresh";

const mountLegacySubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => mountLegacySubscriptions(deps);

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { images } = projectService.getState();
  store.setItems({ imagesData: images });
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload?._event?.detail || {};
  const id = resolveDetailItemId(detail);
  const { item, isFolder } = detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      context: {
        fileId: {
          src: null,
        },
      },
    });
    render();
    return;
  }

  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  const selectedItem = item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);

  let imageSrc = null;
  if (selectedItem?.fileId) {
    const { url } = await projectService.getFileContent(selectedItem.fileId);
    imageSrc = url;
  }

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });

  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: id,
    });
  }
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;
  store.showFullImagePreview({ itemId });
  render();
};

export const handleFileExplorerDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const state = repository.getState();
  store.setItems({ imagesData: state.images });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === COLLAB_IMAGES_REFRESH_ACTION),
      tap(() => {
        void deps.handlers.handleFileExplorerDataChanged(deps);
      }),
    ),
  ];
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const files = await appService.pickFiles({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const uploadedFiles = await projectService.uploadFiles([file]);

  // TODO improve error handling
  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  await projectService.updateResourceItem({
    resourceType: "images",
    resourceId: selectedItem.id,
    patch: {
      fileId: uploadResult.fileId,
      name: uploadResult.displayName,
      fileType: uploadResult.file.type,
      fileSize: uploadResult.file.size,
      width: uploadResult.dimensions.width,
      height: uploadResult.dimensions.height,
    },
  });

  // Update the store with the new repository state
  const { images } = projectService.getState();
  store.setContext({
    context: {
      fileId: {
        src: uploadResult.downloadUrl,
      },
    },
  });
  store.setItems({ imagesData: images });
  const selectedItemId = store.selectSelectedItemId();
  const updatedSelectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(updatedSelectedItem);
  render();

  if (updatedSelectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleImageItemClick = async (deps, payload) => {
  const { store, render, projectService, refs } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  let imageSrc = null;

  if (selectedItem?.fileId) {
    const { url } = await projectService.getFileContent(selectedItem.fileId);
    imageSrc = url;
  }

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });

  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
};

export const handleImageItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = detail.itemId || detail.id;

  if (!itemId) {
    return;
  }

  store.showFullImagePreview({ itemId });
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail;
  const id = targetGroupId;

  const successfulUploads = await projectService.uploadFiles(files);
  for (const result of successfulUploads) {
    await projectService.createResourceItem({
      resourceType: "images",
      resourceId: nanoid(),
      data: {
        type: "image",
        fileId: result.fileId,
        name: result.displayName,
        fileType: result.file.type,
        fileSize: result.file.size,
        width: result.dimensions.width,
        height: result.dimensions.height,
      },
      parentId: id,
      position: "last",
    });
  }

  if (successfulUploads.length > 0) {
    const { images } = projectService.getState();
    store.setItems({ imagesData: images });
  }

  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  await projectService.updateResourceItem({
    resourceType: "images",
    resourceId: selectedItemId,
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { images } = projectService.getState();
  store.setItems({ imagesData: images });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;
  await projectService.ensureRepository();
  const state = projectService.getState();

  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ imagesData: data });
  render();
};
