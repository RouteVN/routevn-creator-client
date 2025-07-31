import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { images, layouts, videos } = repository.getState();

  store.setRepositoryState({
    images,
    layouts,
    videos,
  });

  if (!props.line.presentation?.background) {
    return;
  }

  const { resourceId, resourceType } = props.line.presentation.background;
  if (!resourceId || !resourceType) {
    return;
  }

  store.setSelectedResource({
    resourceId,
    resourceType,
  });
};

export const handleAfterMount = async (deps) => {
  const { getFileContent, store, render } = deps;
  const selectedResource = store.selectSelectedResource();

  if (!selectedResource) {
    return;
  }

  if (selectedResource.resourceType === "image" && selectedResource.fileId) {
    const { url } = await getFileContent({
      fileId: selectedResource.fileId,
      projectId: "someprojectId",
    });

    store.setContext({
      background: {
        src: url,
      },
    });
    render();
  } else if (selectedResource.resourceType === "layout") {
    // TODO: Implement layout resource preview loading
  } else if (selectedResource.resourceType === "video") {
    // TODO: Implement video resource preview loading
  }
};

export const handleImageSelected = async (e, deps) => {
  const { store, render, getFileContent, repository } = deps;
  const { images } = repository.getState();

  const { imageId } = e.detail;

  store.setTempSelectedResource({
    resourceId: imageId,
    resourceType: "image",
  });

  render();

  const flatImageItems = toFlatItems(images);
  const existingImage = flatImageItems.find((item) => item.id === imageId);

  const { url } = await getFileContent({
    fileId: existingImage.fileId,
    projectId: "someprojectId",
  });

  store.setContext({
    background: {
      src: url,
    },
  });
  render();
};

export const handleFormExtra = (e, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleResourceItemClick = (e, deps) => {
  const { store, render } = deps;
  const resourceId = e.currentTarget.id.replace("resource-item-", "");

  store.setTempSelectedResource({
    resourceId,
  });
  render();
};

export const handleTabClick = (e, deps) => {
  const { store, render } = deps;

  store.setTab({
    tab: e.detail.id,
  });

  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent, store } = deps;
  const selectedResource = store.selectSelectedResource();

  if (!selectedResource) {
    return;
  }

  const backgroundData = {
    resourceId: selectedResource.resourceId,
    resourceType: selectedResource.resourceType,
  };

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        background: backgroundData,
      },
    }),
  );
};

export const handleBackgroundSelectorClick = (payload, deps) => {
  const { store, render } = deps;
  const selectedResource = store.selectSelectedResource();

  if (selectedResource) {
    store.setTempSelectedResource({
      resourceId: selectedResource.resourceId,
      resourceType: selectedResource.resourceType,
    });
  }

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbActionsClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else {
    store.setMode({
      mode: e.detail.id,
    });
    render();
  }
};

export const handleButtonSelectClick = (e, deps) => {
  const { store, render, repository } = deps;
  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedResourceType = store.selectTab();

  if (!tempSelectedResourceId || !tempSelectedResourceType) {
    return;
  }

  let fileId;
  if (tempSelectedResourceType === "image") {
    const { images } = repository.getState();
    const tempSelectedImage = toFlatItems(images).find(
      (image) => image.id === tempSelectedResourceId,
    );
    fileId = tempSelectedImage?.fileId;
  } else if (tempSelectedResourceType === "video") {
    const { videos } = repository.getState();
    const tempSelectedVideo = toFlatItems(videos).find(
      (video) => video.id === tempSelectedResourceId,
    );
    fileId = tempSelectedVideo?.fileId;
  }

  store.setSelectedResource({
    resourceId: tempSelectedResourceId,
    resourceType: tempSelectedResourceType,
    fileId: fileId,
  });

  store.setMode({
    mode: "current",
  });
  render();
};
