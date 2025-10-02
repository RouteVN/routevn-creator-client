import { toFlatItems } from "../../deps/repository";

export const handleAfterMount = async (deps) => {
  const { repositoryFactory, router, store, props } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { images, layouts, videos, animations } = repository.getState();

  store.setRepositoryState({
    images,
    layouts,
    videos,
    animations,
  });

  if (!props.line.presentation?.background) {
    return;
  }

  const {
    resourceId,
    resourceType,
    animations: backgroundAnimations,
  } = props.line.presentation.background;
  if (!resourceId || !resourceType) {
    return;
  }

  store.setSelectedResource({
    resourceId,
    resourceType,
  });

  // Set the selected animation if it exists
  if (backgroundAnimations?.in) {
    store.setSelectedAnimation({
      animationId: backgroundAnimations.in,
    });
  }
};

export const handleImageSelected = async (deps, payload) => {
  const { store, render, fileManagerFactory, repositoryFactory, router } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { images } = repository.getState();

  const { imageId } = payload._event.detail;

  store.setTempSelectedResource({
    resourceId: imageId,
    resourceType: "image",
  });

  render();

  const flatImageItems = toFlatItems(images);
  const existingImage = flatImageItems.find((item) => item.id === imageId);

  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { url } = await fileManager.getFileContent({
    fileId: existingImage.fileId,
  });

  render();
};

export const handleFormExtra = (deps, payload) => {
  const { store, render } = deps;
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleFormInputChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, fieldValue } = payload._event.detail;

  if (name === "animation") {
    store.setSelectedAnimation({
      animationId: fieldValue,
    });
    render();
  }
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.id.replace(
    "resource-item-",
    "",
  );
  const resourceType = store.selectTab();

  store.setTempSelectedResource({
    resourceId,
    resourceType,
  });
  render();
};

export const handleTabClick = (deps, payload) => {
  const { store, render } = deps;

  store.setTab({
    tab: payload._event.detail.id,
  });

  render();
};

export const handleSubmitClick = (deps, payload) => {
  const { dispatchEvent, store } = deps;
  const selectedResource = store.selectSelectedResource();
  const selectedAnimationId = store.selectSelectedAnimation();

  if (!selectedResource) {
    return;
  }

  const backgroundData = {
    resourceId: selectedResource.resourceId,
    resourceType: selectedResource.resourceType,
  };

  // Only add animations object if there's a valid animation selected
  if (selectedAnimationId && selectedAnimationId !== "none") {
    backgroundData.animations = {
      in: selectedAnimationId,
    };
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        background: backgroundData,
      },
    }),
  );
};

export const handleBackgroundImageClick = (deps, payload) => {
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

export const handleBreadcumbActionsClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else {
    store.setMode({
      mode: payload._event.detail.id,
    });
    render();
  }
};

export const handleButtonSelectClick = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
  } else if (tempSelectedResourceType === "layout") {
    const { layouts } = repository.getState();
    const tempSelectedLayout = toFlatItems(layouts).find(
      (layout) => layout.id === tempSelectedResourceId,
    );
    fileId = tempSelectedLayout?.thumbnailFileId;
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
