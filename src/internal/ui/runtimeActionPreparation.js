const SAVE_ACTION_KEYS = new Set(["saveSlot", "saveSaveSlot"]);
const LOAD_ACTION_KEYS = new Set(["loadSlot", "loadSaveSlot"]);
const THUMBNAIL_MAX_WIDTH = 400;
const THUMBNAIL_MAX_HEIGHT = 225;
const THUMBNAIL_FORMAT = "image/jpeg";
const THUMBNAIL_QUALITY = 0.75;

const getCanvasElement = (canvasRoot) => {
  if (!canvasRoot || typeof canvasRoot !== "object") {
    return;
  }

  if (typeof canvasRoot.toDataURL === "function") {
    return canvasRoot;
  }

  if (typeof canvasRoot.querySelector !== "function") {
    return;
  }

  return canvasRoot.querySelector("canvas") ?? undefined;
};

const getThumbnailDimensions = (sourceWidth, sourceHeight) => {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return;
  }

  const scale = Math.min(
    THUMBNAIL_MAX_WIDTH / sourceWidth,
    THUMBNAIL_MAX_HEIGHT / sourceHeight,
    1,
  );

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
};

const renderThumbnailDataUrl = ({ source, sourceWidth, sourceHeight }) => {
  const thumbnailDimensions = getThumbnailDimensions(sourceWidth, sourceHeight);
  if (
    !thumbnailDimensions ||
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  ) {
    return;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  canvas.width = thumbnailDimensions.width;
  canvas.height = thumbnailDimensions.height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const thumbnailDataUrl = canvas.toDataURL(
    THUMBNAIL_FORMAT,
    THUMBNAIL_QUALITY,
  );
  canvas.remove?.();
  return thumbnailDataUrl;
};

const loadImageFromDataUrl = (value) => {
  return new Promise((resolve, reject) => {
    if (typeof Image !== "function") {
      reject(new Error("Image constructor is unavailable"));
      return;
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load thumbnail image"));
    image.src = value;
  });
};

const createCanvasThumbnailDataUrl = (canvasElement) => {
  const thumbnailDataUrl = renderThumbnailDataUrl({
    source: canvasElement,
    sourceWidth: canvasElement.width,
    sourceHeight: canvasElement.height,
  });

  return (
    thumbnailDataUrl ??
    canvasElement.toDataURL(THUMBNAIL_FORMAT, THUMBNAIL_QUALITY)
  );
};

const createDataUrlThumbnailImage = async (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  try {
    const image = await loadImageFromDataUrl(value);
    return (
      renderThumbnailDataUrl({
        source: image,
        sourceWidth: image.naturalWidth || image.width,
        sourceHeight: image.naturalHeight || image.height,
      }) ?? value
    );
  } catch {
    return value;
  }
};

export const captureCanvasThumbnailImage = async (
  graphicsService,
  canvasRoot,
) => {
  if (typeof graphicsService?.extractBase64 === "function") {
    try {
      const extracted = await graphicsService.extractBase64("story");
      if (typeof extracted === "string" && extracted.length > 0) {
        return await createDataUrlThumbnailImage(extracted);
      }
    } catch {
      try {
        const extracted = await graphicsService.extractBase64();
        if (typeof extracted === "string" && extracted.length > 0) {
          return await createDataUrlThumbnailImage(extracted);
        }
      } catch {
        // Fall back to DOM canvas capture below.
      }
    }
  }

  const canvasElement = getCanvasElement(canvasRoot);
  if (!canvasElement || typeof canvasElement.toDataURL !== "function") {
    return;
  }

  try {
    return createCanvasThumbnailDataUrl(canvasElement);
  } catch {
    return;
  }
};

const getDataUrlMimeType = (value) => {
  if (typeof value !== "string" || !value.startsWith("data:")) {
    return;
  }

  const mimeType = value.slice("data:".length).split(";")[0];
  return mimeType || undefined;
};

const fillSlotBinding = (payload, slotBinding, fieldName) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return;
  }

  if (payload.slotId !== undefined || payload.slot !== undefined) {
    return;
  }

  if (slotBinding === undefined) {
    return;
  }

  payload[fieldName] = slotBinding;
};

const fillThumbnailImage = (payload, thumbnailImage) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return;
  }

  if (payload.thumbnailImage !== undefined || thumbnailImage === undefined) {
    return;
  }

  payload.thumbnailImage = thumbnailImage;
};

export const applyRuntimeActionContext = (
  actions,
  { slotBinding, thumbnailImage } = {},
) => {
  if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
    return actions;
  }

  Object.entries(actions).forEach(([actionName, payload]) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return;
    }

    if (actionName === "showConfirmDialog") {
      applyRuntimeActionContext(payload.confirmActions, {
        slotBinding,
        thumbnailImage,
      });
      applyRuntimeActionContext(payload.cancelActions, {
        slotBinding,
        thumbnailImage,
      });
      return;
    }

    if (SAVE_ACTION_KEYS.has(actionName)) {
      fillSlotBinding(
        payload,
        slotBinding,
        actionName === "saveSlot" ? "slotId" : "slot",
      );
      fillThumbnailImage(payload, thumbnailImage);
      return;
    }

    if (LOAD_ACTION_KEYS.has(actionName)) {
      fillSlotBinding(
        payload,
        slotBinding,
        actionName === "loadSlot" ? "slotId" : "slot",
      );
    }
  });

  return actions;
};

export const preloadRuntimeThumbnailImage = async (graphicsService, value) => {
  if (
    !graphicsService ||
    typeof value !== "string" ||
    !value.startsWith("data:") ||
    typeof graphicsService.loadAssets !== "function"
  ) {
    return;
  }

  if (typeof graphicsService.hasLoadedAsset === "function") {
    const hasLoaded = graphicsService.hasLoadedAsset(value);
    if (hasLoaded) {
      return;
    }
  }

  await graphicsService.loadAssets({
    [value]: {
      url: value,
      type: getDataUrlMimeType(value) ?? "image/jpeg",
    },
  });
};
