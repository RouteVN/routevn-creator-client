import { toFlatItems } from "insieme";

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  if (!props.background) {
    return;
  }

  const { resourceId, animations: backgroundAnimations } = props.background;

  if (!resourceId) {
    return;
  }

  store.setSelectedResource({
    resourceId,
  });

  // Set the selected animation if it exists
  if (backgroundAnimations?.in) {
    store.setSelectedAnimation({
      animationId: backgroundAnimations.in?.animationId,
    });
  }
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, render } = deps;

  await projectService.ensureRepository();
  const { images, layouts, videos, animations } = projectService.getState();

  store.setRepositoryState({
    images,
    layouts,
    videos,
    animations,
  });

  render();
};

export const handleBackgroundImageRightClick = async (deps, payload) => {
  const { store, render, globalUI } = deps;
  const { _event: event } = payload;
  event.preventDefault();

  const result = await globalUI.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    placement: "bottom-start",
  });

  if (result.item.key === "remove") {
    store.setSelectedResource({
      resourceId: undefined,
      resourceType: undefined,
    });

    render();
  }
};

export const handleImageSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  await projectService.ensureRepository();
  const { images } = projectService.getState();

  const { imageId } = payload._event.detail;

  store.setTempSelectedResource({
    resourceId: imageId,
    resourceType: "image",
  });

  render();

  const flatImageItems = toFlatItems(images);
  const existingImage = flatImageItems.find((item) => item.id === imageId);

  await projectService.getFileContent(existingImage.fileId);

  render();
};

export const handleFormExtra = (deps) => {
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

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const selectedResource = store.selectSelectedResource();
  const selectedAnimationId = store.selectSelectedAnimation();

  const backgroundData = {
    resourceId: selectedResource?.resourceId,
  };

  // Only add animations object if there's a valid animation selected
  if (selectedAnimationId && selectedAnimationId !== "none") {
    backgroundData.animations = {
      in: {
        animationId: selectedAnimationId,
      },
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

export const handleFileExplorerClickItem = (deps, payload) => {
  const { getRefIds } = deps;
  const { id } = payload._event.detail;
  const imageSelector = getRefIds()["rvn-image-selector"];
  imageSelector.elm.transformedHandlers.handleScrollToItem({
    id,
  });
};

export const handleBackgroundImageClick = (deps) => {
  const { store, render } = deps;
  const selectedResource = store.selectSelectedResource();

  if (selectedResource) {
    store.setTempSelectedResource({
      resourceId: selectedResource.resourceId,
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

export const handleButtonSelectClick = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedResourceType = store.selectTab();

  if (!tempSelectedResourceId || !tempSelectedResourceType) {
    return;
  }

  let fileId;
  // if (tempSelectedResourceType === "image") {
  const { images } = repository.getState();
  const tempSelectedImage = toFlatItems(images).find(
    (image) => image.id === tempSelectedResourceId,
  );
  fileId = tempSelectedImage?.fileId;
  // } else if (tempSelectedResourceType === "layout") {
  if (!fileId) {
    const { layouts } = repository.getState();
    const tempSelectedLayout = toFlatItems(layouts).find(
      (layout) => layout.id === tempSelectedResourceId,
    );
    fileId = tempSelectedLayout?.thumbnailFileId;
  }
  // } else if (tempSelectedResourceType === "video") {
  if (!fileId) {
    const { videos } = repository.getState();
    const tempSelectedVideo = toFlatItems(videos).find(
      (video) => video.id === tempSelectedResourceId,
    );
    fileId = tempSelectedVideo?.fileId;
  }
  // }

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
