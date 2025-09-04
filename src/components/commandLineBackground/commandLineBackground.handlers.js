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

export const handleImageSelected = async (e, deps) => {
  const { store, render, getFileContent, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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

  render();
};

export const handleFormExtra = (e, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleFormInputChange = (e, deps) => {
  const { store, render } = deps;
  const { name, fieldValue } = e.detail;

  if (name === "animation") {
    store.setSelectedAnimation({
      animationId: fieldValue,
    });
    render();
  }
};

export const handleResourceItemClick = (e, deps) => {
  const { store, render } = deps;
  const resourceId = e.currentTarget.id.replace("resource-item-", "");
  const resourceType = store.selectTab();

  store.setTempSelectedResource({
    resourceId,
    resourceType,
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

export const handleBackgroundImageClick = (payload, deps) => {
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

export const handleButtonSelectClick = async (e, deps) => {
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
