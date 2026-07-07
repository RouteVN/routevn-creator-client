import { toFlatItems } from "../../internal/project/tree.js";
import {
  BACKGROUND_TRANSFORM_FIELDS,
  createBackgroundWithInlineTransform,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const isHierarchyCollection = (value) =>
  !!value &&
  typeof value === "object" &&
  !!value.items &&
  typeof value.items === "object" &&
  Array.isArray(value.tree);

const normalizeLayoutCollection = (layoutsValue) => {
  if (isHierarchyCollection(layoutsValue)) {
    return layoutsValue;
  }

  const layoutMap =
    layoutsValue && typeof layoutsValue === "object" ? layoutsValue : {};
  const items = {};
  const ids = [];

  for (const [layoutId, layout] of Object.entries(layoutMap)) {
    if (!layout || typeof layout !== "object") continue;
    items[layoutId] = {
      id: layoutId,
      type: layout.type || "layout",
      ...structuredClone(layout),
    };
    ids.push(layoutId);
  }

  const sortedIds = ids.sort((a, b) => {
    const aTs = items[a]?.createdAt ?? 0;
    const bTs = items[b]?.createdAt ?? 0;
    if (aTs !== bTs) return aTs - bTs;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });

  const idSet = new Set(sortedIds);
  const ROOT = "__root__";
  const childrenByParent = new Map([[ROOT, []]]);
  for (const id of sortedIds) {
    const rawParentId = items[id]?.parentId;
    const parentId =
      typeof rawParentId === "string" &&
      rawParentId.length > 0 &&
      rawParentId !== id &&
      idSet.has(rawParentId)
        ? rawParentId
        : null;
    const key = parentId || ROOT;
    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }
    childrenByParent.get(key).push(id);
  }

  const visited = new Set();
  const buildNodes = (parentKey) => {
    const idsForParent = childrenByParent.get(parentKey) || [];
    const nodes = [];
    for (const id of idsForParent) {
      if (visited.has(id)) continue;
      visited.add(id);
      const children = buildNodes(id);
      if (children.length > 0) {
        nodes.push({ id, children });
      } else {
        nodes.push({ id });
      }
    }
    return nodes;
  };

  const tree = buildNodes(ROOT);
  for (const id of sortedIds) {
    if (visited.has(id)) continue;
    visited.add(id);
    tree.push({ id });
  }

  return { items, tree };
};

const getResourceCollectionsFromDomainState = (domainState) => ({
  images: domainState?.images || createEmptyCollection(),
  layouts: normalizeLayoutCollection(domainState?.layouts),
  videos: domainState?.videos || createEmptyCollection(),
  animations: domainState?.animations || createEmptyCollection(),
  transforms: domainState?.transforms || createEmptyCollection(),
  colors: domainState?.colors || createEmptyCollection(),
});

const getDomainStateFromProjectService = (projectService) => {
  if (typeof projectService.getDomainState === "function") {
    return projectService.getDomainState();
  }
  return projectService.getState();
};

const getDomainStateFromRepository = (repository) => {
  if (typeof repository?.getDomainState === "function") {
    return repository.getDomainState();
  }
  return repository.getState();
};

const hasBackgroundInlineTransform = (background = {}) => {
  return BACKGROUND_TRANSFORM_FIELDS.some(
    (field) => background?.[field] !== undefined,
  );
};

const buildBackgroundDataFromState = (
  store,
  { includeTemporaryResource = false } = {},
) => {
  const selectedResource =
    includeTemporaryResource && store.selectMode?.() === "gallery"
      ? (store.selectTempSelectedResource?.() ?? store.selectSelectedResource())
      : store.selectSelectedResource();
  const selectedTransformId = store.selectSelectedTransform();
  const customTransformEnabled = store.selectCustomTransformEnabled();
  const selectedCustomTransform = store.selectCustomTransform?.();
  const selectedColorId = store.selectSelectedColor();
  const selectedOpacity = store.selectSelectedOpacity();
  const selectedBlur = store.selectSelectedBlurActionValue();
  const selectedAnimationMode = store.selectSelectedAnimationMode();
  const selectedAnimationId = store.selectSelectedAnimation();
  const selectedAnimationPlaybackContinuity =
    store.selectSelectedAnimationPlaybackContinuity();
  const backgroundLoop = store.selectBackgroundLoop();
  const hasBackgroundTarget =
    !!selectedResource?.resourceId || !!selectedColorId;

  const backgroundData = {
    resourceId: selectedResource?.resourceId,
  };

  if (selectedColorId) {
    backgroundData.colorId = selectedColorId;
  }

  if (selectedResource?.resourceType === "video") {
    backgroundData.loop = backgroundLoop ?? false;
  }

  if (hasBackgroundTarget && selectedOpacity !== undefined) {
    backgroundData.opacity = selectedOpacity;
  }

  if (hasBackgroundTarget && selectedBlur !== undefined) {
    backgroundData.blur = selectedBlur;
  }

  if (
    hasBackgroundTarget &&
    customTransformEnabled &&
    selectedCustomTransform
  ) {
    Object.assign(
      backgroundData,
      createBackgroundWithInlineTransform({}, selectedCustomTransform),
    );
  }

  if (hasBackgroundTarget && !customTransformEnabled && selectedTransformId) {
    backgroundData.transformId = selectedTransformId;
  }

  if (
    hasBackgroundTarget &&
    selectedAnimationMode !== "none" &&
    selectedAnimationId
  ) {
    backgroundData.animations = {
      resourceId: selectedAnimationId,
      playback: {
        continuity: selectedAnimationPlaybackContinuity,
      },
    };
  }

  return backgroundData;
};

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent, store } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  const background = buildBackgroundDataFromState(store, {
    includeTemporaryResource: true,
  });

  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState: {
          background,
        },
      },
    }),
  );
};

export const handleCustomTransformButtonClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { dispatchEvent, store, render } = deps;

  store.openCustomTransformEditor?.();
  render?.();

  if (typeof dispatchEvent !== "function") {
    return;
  }

  const background = buildBackgroundDataFromState(store, {
    includeTemporaryResource: true,
  });

  dispatchEvent(
    new CustomEvent("background-transform-customize", {
      detail: {
        background,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSetCustomTransform = (deps, { transform } = {}) => {
  const { store, render } = deps;
  store.setCustomTransformEnabled?.({
    enabled: true,
  });
  store.setCustomTransform?.({
    transform,
  });
  render?.();
};

export const handleCustomTransformDoneButtonClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { dispatchEvent, store, render } = deps;

  store.closeCustomTransformEditor?.();
  render?.();

  dispatchEvent?.(
    new CustomEvent("background-transform-editor-done", {
      detail: {},
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleCancelCustomTransformEditor = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { store, render } = deps;

  store.closeCustomTransformEditor?.();
  render?.();
};

export const handleGetBackgroundTransformPreviewCanvasRoot = ({ refs }) => {
  const canvasHost = refs?.backgroundTransformPreviewCanvasHost;
  return (
    canvasHost?.getCanvasRoot?.() ||
    canvasHost?.shadowRoot?.querySelector?.("#canvas") ||
    canvasHost?.querySelector?.("#canvas")
  );
};

export const handleBeforeMount = (deps) => {
  const { store, props, uiConfig } = deps;

  store.setUiConfig({
    uiConfig,
  });

  if (!props.background) {
    return;
  }

  const {
    resourceId,
    colorId,
    opacity,
    blur,
    transformId,
    animations: backgroundAnimations,
    loop: backgroundLoop,
  } = props.background;

  if (colorId) {
    store.setSelectedColor({
      colorId,
    });
  }

  if (resourceId) {
    store.setPendingResourceId({ resourceId: resourceId });
  }

  if (opacity !== undefined) {
    store.setSelectedOpacity({
      opacity,
    });
  }

  if (blur !== undefined) {
    store.setSelectedBlur({
      blur,
    });
  }

  if (backgroundLoop !== undefined) {
    store.setBackgroundLoop({
      loop: backgroundLoop,
    });
  }

  const animationResourceId = backgroundAnimations?.resourceId;
  if (animationResourceId) {
    store.setSelectedAnimation({
      animationId: animationResourceId,
    });
  }

  const animationPlaybackContinuity =
    backgroundAnimations?.playback?.continuity;
  if (animationPlaybackContinuity) {
    store.setSelectedAnimationPlaybackContinuity({
      continuity: animationPlaybackContinuity,
    });
  }

  if (transformId) {
    store.setCustomTransformEnabled({
      enabled: false,
    });
    store.setCustomTransform({
      transform: undefined,
    });
    store.setSelectedTransform({
      transformId,
    });
  } else if (hasBackgroundInlineTransform(props.background)) {
    store.setSelectedTransform({
      transformId: undefined,
    });
    store.setCustomTransformEnabled({
      enabled: true,
    });
    store.setCustomTransform({
      transform: props.background,
    });
  } else {
    store.setCustomTransformEnabled({
      enabled: false,
    });
    store.setCustomTransform({
      transform: undefined,
    });
    store.setSelectedTransform({
      transformId,
    });
  }
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, render } = deps;

  await projectService.ensureRepository();
  const domainState = getDomainStateFromProjectService(projectService);
  const { images, layouts, videos, animations, transforms, colors } =
    getResourceCollectionsFromDomainState(domainState);

  store.setRepositoryState({
    images,
    layouts,
    videos,
    animations,
    transforms,
    colors,
  });

  const pendingResourceId = store.selectPendingResourceId();
  if (pendingResourceId) {
    const flatImages = toFlatItems(images);
    const flatLayouts = toFlatItems(layouts);
    const flatVideos = toFlatItems(videos);

    let resourceType = null;
    let fileId = null;

    const foundImage = flatImages.find((item) => item.id === pendingResourceId);
    if (foundImage) {
      resourceType = "image";
      fileId = foundImage.fileId;
    }

    if (!resourceType) {
      const foundLayout = flatLayouts.find(
        (item) => item.id === pendingResourceId,
      );
      if (foundLayout) {
        resourceType = "layout";
        fileId = foundLayout.thumbnailFileId;
      }
    }

    if (!resourceType) {
      const foundVideo = flatVideos.find(
        (item) => item.id === pendingResourceId,
      );
      if (foundVideo) {
        resourceType = "video";
        fileId = foundVideo.fileId;
      }
    }

    if (resourceType) {
      store.setSelectedResource({
        resourceId: pendingResourceId,
        resourceType,
        fileId,
      });
    }

    store.clearPendingResourceId();
  }

  render();
};

export const handleBackgroundImageRightClick = async (deps, payload) => {
  const { store, render, appService, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const { _event: event } = payload;
  event.preventDefault();
  event.stopPropagation();

  const result = await appService.showDropdownMenu({
    items: [
      {
        type: "item",
        label: localizeCommandLineText("Remove", copy),
        key: "remove",
      },
    ],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });

  if (result?.item?.key !== "remove") {
    return;
  }

  store.setSelectedResource({
    resourceId: undefined,
    resourceType: undefined,
  });
  store.setTempSelectedResource({
    resourceId: undefined,
    resourceType: undefined,
  });
  store.setBackgroundLoop({
    loop: false,
  });

  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleImageSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  await projectService.ensureRepository();
  const domainState = getDomainStateFromProjectService(projectService);
  const { images } = getResourceCollectionsFromDomainState(domainState);

  const { imageId } = payload._event.detail;

  store.setTempSelectedResource({
    resourceId: imageId,
    resourceType: "image",
  });

  render();
  dispatchTemporaryPresentationStateChange(deps);

  const flatImageItems = toFlatItems(images);
  const existingImage = flatImageItems.find((item) => item.id === imageId);

  await projectService.getFileContent(existingImage.fileId);

  render();
};

export const handleImageDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { imageId } = payload._event.detail;

  store.setTempSelectedResource({
    resourceId: imageId,
    resourceType: "image",
  });
  store.showFullImagePreview({ imageId });
  render();
  dispatchTemporaryPresentationStateChange(deps);
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
  const { name, value: fieldValue } = payload._event.detail;

  if (name === "animationId") {
    store.setSelectedAnimation({
      animationId: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (name === "customTransform") {
    const customTransformWasEnabled = store.selectCustomTransformEnabled();
    const customTransformEnabled = fieldValue === true || fieldValue === "true";

    store.setCustomTransformEnabled({
      enabled: fieldValue,
    });

    if (!customTransformEnabled) {
      store.setCustomTransform?.({
        transform: undefined,
      });
    } else if (!customTransformWasEnabled) {
      const selectedTransform = store.selectSelectedTransformResource?.();
      if (selectedTransform) {
        store.setCustomTransform?.({
          transform: selectedTransform,
        });
      }
    }

    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (name === "transformId") {
    store.setCustomTransformEnabled?.({
      enabled: false,
    });
    store.setCustomTransform?.({
      transform: undefined,
    });
    store.setSelectedTransform({
      transformId: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (name === "colorId") {
    store.setSelectedColor({
      colorId: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (name === "opacity") {
    store.setSelectedOpacity({
      opacity: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (name === "blur") {
    store.setSelectedBlurEnabled({
      enabled: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  const blurFieldMap = {
    blurX: "x",
    blurY: "y",
    blurQuality: "quality",
    blurKernelSize: "kernelSize",
    blurRepeatEdgePixels: "repeatEdgePixels",
  };
  const blurFieldName = blurFieldMap[name];
  if (blurFieldName) {
    store.setSelectedBlurField({
      fieldName: blurFieldName,
      value: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (name === "playbackContinuity") {
    store.setSelectedAnimationPlaybackContinuity({
      continuity: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (name === "loop") {
    store.setBackgroundLoop({
      loop: fieldValue,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
  }
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;
  const target = payload._event.currentTarget;
  const resourceId =
    target?.dataset?.resourceId ||
    target?.id?.replace("resourceItem", "") ||
    "";
  const resourceType = store.selectTab();

  store.setTempSelectedResource({
    resourceId,
    resourceType,
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleTabClick = (deps, payload) => {
  const { store, render } = deps;

  store.setTab({
    tab: payload._event.detail.id,
  });

  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

export const handleSubmitClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { dispatchEvent, store } = deps;
  const backgroundData = buildBackgroundDataFromState(store);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        background: backgroundData,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleFileExplorerClickItem = (deps, payload) => {
  const { refs, store } = deps;
  const tab = store.selectTab();

  // Only scroll to item when on image tab (image selector only exists there)
  if (tab !== "image") {
    return;
  }

  const { itemId } = payload._event.detail;
  const imageSelector = refs["rvnImageSelector"];
  if (imageSelector?.transformedHandlers?.handleScrollToItem) {
    imageSelector.transformedHandlers.handleScrollToItem({ itemId });
  }
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
    dispatchTemporaryPresentationStateChange(deps);
  }
};

export const handleButtonSelectClick = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const domainState = getDomainStateFromRepository(repository);
  const { images, layouts, videos } =
    getResourceCollectionsFromDomainState(domainState);
  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedResourceType = store.selectTab();

  if (!tempSelectedResourceId || !tempSelectedResourceType) {
    return;
  }

  let fileId;
  const tempSelectedImage = toFlatItems(images).find(
    (image) => image.id === tempSelectedResourceId,
  );
  fileId = tempSelectedImage?.fileId;
  if (!fileId) {
    const tempSelectedLayout = toFlatItems(layouts).find(
      (layout) => layout.id === tempSelectedResourceId,
    );
    fileId = tempSelectedLayout?.thumbnailFileId;
  }
  if (!fileId) {
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
  dispatchTemporaryPresentationStateChange(deps);
};
