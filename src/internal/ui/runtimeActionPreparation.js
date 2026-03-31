const SAVE_ACTION_KEYS = new Set(["saveSlot", "saveSaveSlot"]);
const LOAD_ACTION_KEYS = new Set(["loadSlot", "loadSaveSlot"]);

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

export const captureCanvasThumbnailImage = async (
  graphicsService,
  canvasRoot,
) => {
  if (typeof graphicsService?.extractBase64 === "function") {
    try {
      const extracted = await graphicsService.extractBase64("story");
      if (typeof extracted === "string" && extracted.length > 0) {
        return extracted;
      }
    } catch {
      try {
        const extracted = await graphicsService.extractBase64();
        if (typeof extracted === "string" && extracted.length > 0) {
          return extracted;
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
    return canvasElement.toDataURL("image/jpeg", 0.85);
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
      console.log("[runtimeActionPreparation] showConfirmDialog context", {
        slotBinding,
        hasThumbnailImage: thumbnailImage !== undefined,
      });
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
      console.log("[runtimeActionPreparation] save action prepared", {
        actionName,
        slotId: payload.slotId,
        slot: payload.slot,
        hasThumbnailImage: payload.thumbnailImage !== undefined,
      });
      return;
    }

    if (LOAD_ACTION_KEYS.has(actionName)) {
      fillSlotBinding(
        payload,
        slotBinding,
        actionName === "loadSlot" ? "slotId" : "slot",
      );
      console.log("[runtimeActionPreparation] load action prepared", {
        actionName,
        slotId: payload.slotId,
        slot: payload.slot,
      });
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
