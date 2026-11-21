import { describeError } from "../../internal/errorDetails.js";
import { normalizeSpritesheetFps } from "../../internal/spritesheets.js";
import { getSpritesheetFrameDisplayName } from "../../internal/spritesheetAtlas.js";
import {
  buildSpritesheetFramesOutput,
  sortFrameFilesByName,
} from "../../internal/spritesheetFrames.js";
import { selectI18nCopy } from "../../internal/ui/i18nCopy.js";
import { showResourcePageError } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { getInlineEndX } from "../../internal/textDirection.js";

const FRAME_IMAGE_ACCEPT = ".png,.webp,.jpg,.jpeg";
const FRAME_IMAGE_PATTERN = /\.(png|webp|jpe?g)$/i;
const INTERNAL_DRAG_TYPE = "application/x-routevn-spritesheet-frame";

const selectCopy = (deps) =>
  selectI18nCopy(deps.i18n, ["spritesheetFramesEditor"]);

const revokeUrls = (urls = []) => {
  for (const url of urls) {
    if (typeof url === "string" && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }
};

// Tells the page the frames changed, and whether undo and redo can run.
const dispatchChange = ({ dispatchEvent, store }) => {
  dispatchEvent(
    new CustomEvent("frames-change", {
      detail: store.selectEditHistoryState(),
      bubbles: true,
      composed: true,
    }),
  );
};

// Which pictures a preview sheet holds and where.
const getPreviewSignature = (output) =>
  JSON.stringify([
    output.sheetWidth,
    output.sheetHeight,
    output.frames.map((frame) => frame.url),
    output.placements,
  ]);

// Replaces the preview and frees the previous sheet image, unless a newer
// preview build started meanwhile.
const showPreview = (deps, { revision, preview = {} }) => {
  const { render, store } = deps;
  const previousUrl = store.selectPreviewUrl();
  if (revision !== store.selectPreviewRevision()) {
    if (preview.url !== previousUrl) {
      revokeUrls([preview.url]);
    }
    return;
  }

  store.setPreview({ revision, ...preview });
  if (previousUrl !== preview.url) {
    revokeUrls([previousUrl]);
  }
  render();
};

const refreshPreview = async (deps) => {
  const { projectService, store } = deps;
  store.startPreviewBuild();
  const revision = store.selectPreviewRevision();
  const draft = store.selectDraft();

  if (draft.frames.length === 0) {
    showPreview(deps, { revision });
    return;
  }

  // Reordering, holds, and FPS only change the animations, so the current
  // sheet image still fits.
  const output = buildSpritesheetFramesOutput(draft);
  const signature = getPreviewSignature(output);
  const currentUrl = store.selectPreviewUrl();
  if (currentUrl && signature === store.selectPreviewSignature()) {
    showPreview(deps, {
      revision,
      preview: {
        url: currentUrl,
        atlas: output.jsonData,
        animations: output.animations,
        signature,
      },
    });
    return;
  }

  let result;
  try {
    result = await projectService.renderSpritesheetFramesPreview(output);
  } catch (error) {
    showPreview(deps, {
      revision,
      preview: {
        error: { code: "preview_failed", details: describeError(error) },
      },
    });
    return;
  }

  if (result.limitError) {
    showPreview(deps, { revision, preview: { error: result.limitError } });
    return;
  }

  showPreview(deps, {
    revision,
    preview: {
      url: URL.createObjectURL(result.blob),
      atlas: output.jsonData,
      animations: output.animations,
      signature,
    },
  });
};

// Every edit ends here, so this is where it enters the undo history. A
// clip FPS change plays at once and does not need a new preview sheet.
const commitEdit = (deps, { preview = true } = {}) => {
  const { render, store } = deps;
  store.recordEdit({ time: Date.now() });
  render();
  dispatchChange(deps);
  if (preview) {
    void refreshPreview(deps);
  }
};

const addFrameFiles = async (deps, { files = [], afterEntryKey } = {}) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  // Pictures can only join frames that loaded.
  const status = store.selectStatus();
  if (status === "loading" || status === "error") {
    return;
  }

  const imageFiles = sortFrameFilesByName(
    files.filter((file) => FRAME_IMAGE_PATTERN.test(file?.name ?? "")),
  );

  if (imageFiles.length < files.length) {
    appService.showToast({
      message: copy.unsupportedFramesMessage,
      status: "warning",
    });
  }

  if (imageFiles.length === 0) {
    return;
  }

  const loadRevision = store.selectLoadRevision();
  const { frames, failedFiles } =
    await projectService.readSpritesheetFrameFiles({ files: imageFiles });

  if (loadRevision !== store.selectLoadRevision()) {
    revokeUrls(frames.map((frame) => frame.url));
    return;
  }

  if (failedFiles.length > 0) {
    appService.showToast({
      message: copy.unreadableFramesMessage,
      status: "warning",
    });
  }

  if (frames.length === 0) {
    render();
    return;
  }

  store.addFrames({ frames, afterEntryKey });
  commitEdit(deps);
};

const resetEditor = (deps) => {
  const { store } = deps;
  revokeUrls([...store.selectFrameUrls(), store.selectPreviewUrl()]);
  store.resetDraft();
};

export const handleBeforeMount = (deps) => {
  return () => {
    const { store } = deps;
    revokeUrls([...store.selectFrameUrls(), store.selectPreviewUrl()]);
  };
};

export const handleLoadSpritesheet = async (deps, payload = {}) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const { spritesheet } = payload;
  resetEditor(deps);
  const loadRevision = store.selectLoadRevision();
  const frameSource = spritesheet?.frameSource;

  // A spritesheet created empty has no sheet yet.
  if (!frameSource && !spritesheet?.fileId) {
    store.loadDraft({ frames: [], sourceKind: "pictures" });
    render();
    await refreshPreview(deps);
    return;
  }

  store.startLoading();
  render();

  const atlasFrameNames = Object.keys(spritesheet?.jsonData?.frames ?? {});
  let frames;
  try {
    if (frameSource) {
      const loadedFrames = await projectService.loadSpritesheetFrameFileIds({
        fileIds: frameSource.frames.map((frame) => frame.fileId),
      });
      frames = loadedFrames.map((frame, index) => ({
        ...frame,
        name:
          getSpritesheetFrameDisplayName(atlasFrameNames[index]) ||
          `frame_${index + 1}`,
      }));
    } else {
      frames = await projectService.extractSpritesheetFrames({
        fileId: spritesheet?.fileId,
        jsonData: spritesheet?.jsonData,
      });
    }
  } catch (error) {
    if (loadRevision !== store.selectLoadRevision()) {
      return;
    }
    store.setLoadFailed();
    render();
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.loadFramesFailedMessage,
    });
    return;
  }

  if (loadRevision !== store.selectLoadRevision()) {
    revokeUrls(frames.map((frame) => frame.url));
    return;
  }

  // Each frame is at its own index in the saved sheet, so edits that keep to
  // these frames can be saved without a new sheet image.
  store.loadDraft({
    frames: frames.map((frame, index) => ({ ...frame, sourceIndex: index })),
    animations: spritesheet?.animations,
    sourceKind: frameSource ? "frames" : "sheet",
  });
  render();
  await refreshPreview(deps);
};

export const handleGetDraft = (deps) => {
  return deps.store.selectDraft();
};

// Records a save so the next save only uploads pictures added after it.
export const handleMarkSaved = (deps, payload = {}) => {
  const { render, store } = deps;
  const { fileIdByFrameKey, sourceIndexByFrameKey, content } = payload;
  store.markSaved({ fileIdByFrameKey, sourceIndexByFrameKey, content });
  render();
};

// Undo and redo behave like an edit: the editor shows the restored frames at
// once and the page saves them.
const runHistoryStep = async (deps, direction) => {
  const { render, store } = deps;
  if (!store.selectEditHistoryStep({ direction })) {
    return false;
  }

  store.applyEditHistoryStep({ direction });
  render();
  dispatchChange(deps);
  await refreshPreview(deps);
  return true;
};

export const handleUndo = (deps) => runHistoryStep(deps, "undo");

export const handleRedo = (deps) => runHistoryStep(deps, "redo");

export const handleAddPicturesClick = async (deps) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  let files;
  try {
    files = await appService.pickFiles({
      accept: FRAME_IMAGE_ACCEPT,
      multiple: true,
    });
  } catch {
    appService.showToast({
      message: copy.failedSelectFramesMessage,
      status: "error",
    });
    return;
  }

  if (!files?.length) {
    return;
  }

  await addFrameFiles(deps, { files: Array.from(files) });
};

export const handleFramesDragOver = (_deps, payload) => {
  const { dataTransfer } = payload._event;
  if (dataTransfer) {
    dataTransfer.dropEffect = dataTransfer.types?.includes(INTERNAL_DRAG_TYPE)
      ? "move"
      : "copy";
  }
};

export const handleFramesDrop = async (deps, payload) => {
  const { store } = deps;
  const files = Array.from(payload._event.dataTransfer?.files ?? []);
  if (files.length > 0) {
    await addFrameFiles(deps, { files });
    return;
  }

  // An internal drag dropped after the last card moves the frame to the end.
  const dragEntryKey = store.selectDragEntryKey();
  if (!dragEntryKey) {
    return;
  }

  store.setDragEntryKey({ entryKey: undefined });
  store.moveEntry({
    entryKey: dragEntryKey,
    toIndex: store.selectSelectedClipEntryCount() - 1,
  });
  commitEdit(deps);
};

export const handleEntryDragStart = (deps, payload) => {
  const { store } = deps;
  const event = payload._event;
  const { entryKey } = event.currentTarget.dataset;
  store.setDragEntryKey({ entryKey });
  event.dataTransfer?.setData(INTERNAL_DRAG_TYPE, entryKey);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
};

export const handleEntryDragEnd = (deps) => {
  deps.store.setDragEntryKey({ entryKey: undefined });
  deps.render();
};

export const handleEntryDrop = async (deps, payload) => {
  const { store } = deps;
  const event = payload._event;
  const files = Array.from(event.dataTransfer?.files ?? []);
  // Pictures dropped on a frame go after it.
  if (files.length > 0) {
    await addFrameFiles(deps, {
      files,
      afterEntryKey: event.currentTarget.dataset.entryKey,
    });
    return;
  }

  const dragEntryKey = store.selectDragEntryKey();
  const toIndex = Number(event.currentTarget.dataset.entryIndex);
  store.setDragEntryKey({ entryKey: undefined });
  if (!dragEntryKey || !Number.isInteger(toIndex)) {
    return;
  }

  store.moveEntry({ entryKey: dragEntryKey, toIndex });
  commitEdit(deps);
};

// The frame's "..." button opens a menu to move it up or down or delete it.
export const handleEntryMenuClick = async (deps, payload) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  const button = payload._event.currentTarget;
  const { entryKey } = button.dataset;
  const index = Number(button.dataset.entryIndex);
  const rect = button.getBoundingClientRect();
  const result = await appService.showDropdownMenu({
    items: [
      {
        type: "item",
        label: copy.moveUpMenuItem,
        key: "move-up",
        disabled: index === 0,
      },
      {
        type: "item",
        label: copy.moveDownMenuItem,
        key: "move-down",
        disabled: index >= store.selectSelectedClipEntryCount() - 1,
      },
      { type: "separator" },
      { type: "item", label: copy.deleteMenuItem, key: "delete" },
    ],
    x: getInlineEndX(rect, appService.getDocumentDirection()),
    y: rect.bottom,
    place: "be",
  });

  const action = result?.item?.key;
  if (action === "move-up" || action === "move-down") {
    store.moveEntryBy({ entryKey, offset: action === "move-up" ? -1 : 1 });
  } else if (action === "delete") {
    store.removeEntry({ entryKey });
  } else {
    return;
  }

  commitEdit(deps);
};

export const handleEntryHoldChange = (deps, payload) => {
  const { render, store } = deps;
  const hold = payload._event.detail.value;
  if (hold === null || hold === undefined) {
    render();
    return;
  }

  store.setEntryHold({
    entryKey: payload._event.currentTarget.dataset.entryKey,
    hold,
  });
  commitEdit(deps);
};

export const handlePlayToggleClick = (deps) => {
  deps.store.togglePlaying();
  deps.render();
};

export const handleClipSelectChange = (deps, payload) => {
  const { render, store } = deps;
  store.setSelectedClipName({ clipName: payload._event.detail.value });
  render();
};

export const handleFpsChange = (deps, payload) => {
  const { render, store } = deps;
  const fps = normalizeSpritesheetFps(payload._event.detail.value);
  if (fps === undefined) {
    render();
    return;
  }

  store.setSelectedClipFps({ fps });
  commitEdit(deps, { preview: false });
};
