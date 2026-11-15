import { formatDimensions, formatNumber } from "../../internal/dates.js";
import { withErrorDetails } from "../../internal/errorDetails.js";
import {
  areEditHistoryValuesEqual,
  createEditHistory,
  getEditHistoryChangeKey,
  getEditHistoryStep,
  moveEditHistoryStep,
  recordEditHistoryStep,
} from "../../internal/editHistory.js";
import {
  DEFAULT_SPRITESHEET_CLIP_FPS,
  FALLBACK_SPRITESHEET_CLIP_FPS,
} from "../../internal/spritesheets.js";
import {
  MAX_SPRITESHEET_FRAME_HOLD,
  SPRITESHEET_FRAMES_CLIP_NAME,
  clipsFromAnimations,
  getUnusedFrameKeys,
  moveArrayItem,
  normalizeFrameHold,
  resolveAutoFrameSize,
  selectClipFrames,
} from "../../internal/spritesheetFrames.js";
import {
  formatI18nCopy,
  formatPluralCopy,
  selectI18nCopy,
} from "../../internal/ui/i18nCopy.js";

const CHECKERBOARD_STYLE =
  "background-color: #eef2f7; background-image: linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0;";

const selectCopy = (i18n) => selectI18nCopy(i18n, ["spritesheetFramesEditor"]);

// The preview box has the frame's shape and fills its column, but stays
// short enough to fit on screen. Without `min-height: 0`, the canvas drawn
// for the previous frame size would stretch the box to its old shape.
const PREVIEW_MAX_HEIGHT = "65vh";
const EMPTY_PREVIEW_ASPECT = { width: 4, height: 3 };

// The number fields open a slider popover, as the layout editor's do.
const toNumberPresets = (values, dateTime) =>
  values.map((value) => ({ label: formatNumber(value, dateTime), value }));

const buildHoldField = (dateTime) => ({
  defaultValue: 1,
  step: 1,
  fastStep: 4,
  min: 1,
  max: MAX_SPRITESHEET_FRAME_HOLD,
  range: { min: 1, max: 12 },
  presets: toNumberPresets([1, 2, 3, 4, 6, 8, 12], dateTime),
});

const buildFpsField = (dateTime) => ({
  defaultValue: DEFAULT_SPRITESHEET_CLIP_FPS,
  step: 1,
  fastStep: 4,
  min: 1,
  max: 120,
  range: { min: 1, max: 30 },
  presets: toNumberPresets([6, 8, 10, 12, 15, 24, 30, 60], dateTime),
});

const buildPreviewBoxStyle = ({ width, height }) =>
  `width: min(100cqw, calc(${PREVIEW_MAX_HEIGHT} * ${width} / ${height})); aspect-ratio: ${width} / ${height}; min-height: 0; flex-shrink: 0;`;

// `signature` says which pictures the preview sheet holds and where, so an
// edit that only changes the animations can reuse its image.
const createEmptyPreview = () => ({
  url: undefined,
  atlas: undefined,
  animations: {},
  error: undefined,
  signature: undefined,
});

export const createInitialState = () => ({
  status: "empty",
  sourceKind: "pictures",
  frames: [],
  clips: [],
  keepFrameKeys: [],
  defaultFps: DEFAULT_SPRITESHEET_CLIP_FPS,
  selectedClipName: undefined,
  savedContent: undefined,
  editHistory: createEditHistory(),
  editHistoryBaseline: undefined,
  isPlaying: true,
  nextKey: 0,
  loadRevision: 0,
  previewRevision: 0,
  preview: createEmptyPreview(),
  dragEntryKey: undefined,
});

const createKey = (state, prefix) => {
  state.nextKey += 1;
  return `${prefix}${state.nextKey}`;
};

// What an edit changes and undo puts back: the clips, with their frames,
// holds, and FPS. Frames themselves are never dropped while the editor is
// open, so an undo can bring a removed frame back.
const selectContent = (state) => ({
  clips: state.clips,
});

const selectClip = (state) =>
  state.clips.find((clip) => clip.name === state.selectedClipName);

const ensureSelectedClip = (state) => {
  let clip = selectClip(state);
  if (clip) {
    return clip;
  }

  clip = state.clips[0];
  if (!clip) {
    clip = {
      name: SPRITESHEET_FRAMES_CLIP_NAME,
      entries: [],
      fps: state.defaultFps,
      loop: true,
    };
    state.clips.push(clip);
  }

  state.selectedClipName = clip.name;
  return state.clips.find((item) => item.name === clip.name);
};

const findEntryIndex = (clip, entryKey) =>
  (clip?.entries ?? []).findIndex((entry) => entry.key === entryKey);

// The frame size of the clip shown: its largest picture's width and height,
// so every picture fits without scaling.
const resolveFrameSize = (state) =>
  resolveAutoFrameSize(
    selectClipFrames({ frames: state.frames, clip: selectClip(state) }),
  );

// Revisions keep counting across resets so a load or preview that finishes
// after a reset can never pass for a current one.
export const resetDraft = ({ state }, _payload = {}) => {
  const loadRevision = state.loadRevision + 1;
  const previewRevision = state.previewRevision + 1;
  const nextKey = state.nextKey;
  Object.assign(state, createInitialState());
  state.loadRevision = loadRevision;
  state.previewRevision = previewRevision;
  state.nextKey = nextKey;
};

export const startLoading = ({ state }, _payload = {}) => {
  state.status = "loading";
};

export const setLoadFailed = ({ state }, _payload = {}) => {
  state.status = "error";
};

export const loadDraft = (
  { state },
  { frames = [], animations, sourceKind, defaultFps } = {},
) => {
  state.defaultFps = defaultFps ?? DEFAULT_SPRITESHEET_CLIP_FPS;
  state.frames = frames.map((frame) => ({
    ...frame,
    key: createKey(state, "frame"),
  }));
  const frameKeys = state.frames.map((frame) => frame.key);
  state.clips = clipsFromAnimations({
    animations,
    frameKeys,
    createEntryKey: () => createKey(state, "entry"),
    // A saved clip without fps keeps the speed it plays at.
    missingClipFps: FALLBACK_SPRITESHEET_CLIP_FPS,
  });

  if (state.clips.length === 0 && frameKeys.length > 0) {
    state.clips.push({
      name: SPRITESHEET_FRAMES_CLIP_NAME,
      entries: frameKeys.map((frameKey) => ({
        key: createKey(state, "entry"),
        frameKey,
        hold: 1,
      })),
      fps: state.defaultFps,
      loop: true,
    });
  }

  state.keepFrameKeys = getUnusedFrameKeys({
    frames: state.frames,
    clips: state.clips,
  });
  state.selectedClipName = state.clips[0]?.name;
  state.sourceKind = sourceKind ?? "pictures";
  state.status = state.frames.length > 0 ? "ready" : "empty";
  state.savedContent = selectContent(state);
  state.editHistory = createEditHistory();
  state.editHistoryBaseline = state.savedContent;
};

// New pictures go after the frame `afterEntryKey`, or at the end.
export const addFrames = ({ state }, { frames = [], afterEntryKey } = {}) => {
  if (frames.length === 0) {
    return;
  }

  const clip = ensureSelectedClip(state);
  const afterIndex = findEntryIndex(clip, afterEntryKey);
  const insertIndex = afterIndex >= 0 ? afterIndex + 1 : clip.entries.length;
  const newEntries = frames.map((frame) => {
    const key = createKey(state, "frame");
    state.frames.push({ ...frame, key });
    return {
      key: createKey(state, "entry"),
      frameKey: key,
      hold: 1,
    };
  });

  clip.entries.splice(insertIndex, 0, ...newEntries);
  state.status = "ready";
};

export const setSelectedClipName = ({ state }, { clipName } = {}) => {
  if (!state.clips.some((clip) => clip.name === clipName)) {
    return;
  }

  state.selectedClipName = clipName;
};

export const moveEntry = ({ state }, { entryKey, toIndex } = {}) => {
  const clip = selectClip(state);
  const fromIndex = findEntryIndex(clip, entryKey);
  const nextEntries = moveArrayItem(clip?.entries ?? [], fromIndex, toIndex);
  if (nextEntries === clip?.entries) {
    return;
  }

  clip.entries = nextEntries;
};

export const moveEntryBy = ({ state }, { entryKey, offset } = {}) => {
  const fromIndex = findEntryIndex(selectClip(state), entryKey);
  if (fromIndex < 0) {
    return;
  }

  moveEntry({ state }, { entryKey, toIndex: fromIndex + offset });
};

export const setEntryHold = ({ state }, { entryKey, hold } = {}) => {
  const entry = selectClip(state)?.entries.find(
    (item) => item.key === entryKey,
  );
  const nextHold = normalizeFrameHold(hold);
  if (entry && nextHold !== entry.hold) {
    entry.hold = nextHold;
  }
};

// Takes a frame out of the clip. The picture stays in the editor, so undo can
// put it back.
export const removeEntry = ({ state }, { entryKey } = {}) => {
  const clip = selectClip(state);
  const index = findEntryIndex(clip, entryKey);
  if (index >= 0) {
    clip.entries.splice(index, 1);
  }
};

export const togglePlaying = ({ state }, _payload = {}) => {
  state.isPlaying = !state.isPlaying;
};

// Records a save. `content` is what the save was made from; edits made while
// it ran are still unsaved. A save that made a new sheet passes each frame's
// index in it, `sourceIndexByFrameKey`, and the files the frames were saved
// as, so the next save uploads only pictures added since. A frame left out of
// the new sheet, kept so undo can bring it back, has no index. A save that
// only changed the animations keeps the sheet and its frames as they are.
export const markSaved = (
  { state },
  { fileIdByFrameKey = {}, sourceIndexByFrameKey, content } = {},
) => {
  if (sourceIndexByFrameKey) {
    for (const frame of state.frames) {
      frame.sourceIndex = sourceIndexByFrameKey[frame.key];
      const fileId = fileIdByFrameKey[frame.key];
      if (fileId) {
        frame.fileId = fileId;
        delete frame.file;
      }
    }
    state.sourceKind = "frames";
  }
  state.savedContent = content;
};

// Records the clips and frame size as they are now against the last
// recorded version. Repeated edits to the same values less than a second
// apart, such as typing a hold, are one step. An edit that changes nothing
// is not a step.
export const recordEdit = ({ state }, { time } = {}) => {
  const before = state.editHistoryBaseline;
  if (!before) {
    return;
  }

  const after = selectContent(state);
  if (areEditHistoryValuesEqual(before, after)) {
    return;
  }

  recordEditHistoryStep(state.editHistory, {
    before: { content: before, clipName: state.selectedClipName },
    after: { content: after, clipName: state.selectedClipName },
    mergeKey: getEditHistoryChangeKey(before, after),
    time,
  });
  state.editHistoryBaseline = after;
};

export const selectEditHistoryStep = ({ state }, { direction } = {}) =>
  getEditHistoryStep(state.editHistory, direction);

// Undoes or redoes the latest step and shows the clip it changed.
export const applyEditHistoryStep = ({ state }, { direction } = {}) => {
  const step = getEditHistoryStep(state.editHistory, direction);
  if (!step) {
    return;
  }

  const { content, clipName } = direction === "undo" ? step.before : step.after;
  moveEditHistoryStep(state.editHistory, direction);
  state.clips = content.clips;
  state.editHistoryBaseline = content;
  if (state.clips.some((clip) => clip.name === clipName)) {
    state.selectedClipName = clipName;
  }
  if (state.frames.length > 0) {
    state.status = "ready";
  }
};

export const selectEditHistoryState = ({ state }) => ({
  canUndo: state.editHistory.undo.length > 0,
  canRedo: state.editHistory.redo.length > 0,
});

export const setSelectedClipFps = ({ state }, { fps } = {}) => {
  if (!(fps > 0)) {
    return;
  }

  // Before the first picture there is no clip yet; it starts at this FPS.
  const clip = selectClip(state);
  if (!clip) {
    state.defaultFps = fps;
    return;
  }

  clip.fps = fps;
};

export const setDragEntryKey = ({ state }, { entryKey } = {}) => {
  state.dragEntryKey = entryKey;
};

export const startPreviewBuild = ({ state }, _payload = {}) => {
  state.previewRevision += 1;
};

export const setPreview = (
  { state },
  { revision, url, atlas, animations, error, signature } = {},
) => {
  if (revision !== state.previewRevision) {
    return;
  }

  state.preview = {
    url,
    atlas,
    animations: animations ?? {},
    error,
    signature,
  };
};

export const selectLoadRevision = ({ state }) => state.loadRevision;

export const selectPreviewRevision = ({ state }) => state.previewRevision;

export const selectPreviewUrl = ({ state }) => state.preview.url;

export const selectPreviewSignature = ({ state }) => state.preview.signature;

export const selectFrameUrls = ({ state }) =>
  state.frames.map((frame) => frame.url);

export const selectFrames = ({ state }) => state.frames;

export const selectDragEntryKey = ({ state }) => state.dragEntryKey;

export const selectSelectedClipFps = ({ state }) => selectClip(state)?.fps;

export const selectSelectedClipEntryCount = ({ state }) =>
  selectClip(state)?.entries.length ?? 0;

export const selectStatus = ({ state }) => state.status;

export const selectDraft = ({ state }) => {
  const content = selectContent(state);

  return {
    status: state.status,
    sourceKind: state.sourceKind,
    frames: state.frames,
    clips: state.clips,
    keepFrameKeys: state.keepFrameKeys,
    hasChanges:
      Boolean(state.savedContent) &&
      !areEditHistoryValuesEqual(content, state.savedContent),
    content,
  };
};

const buildPreviewAnimation = (state, clip) => {
  const animation = state.preview.animations?.[clip?.name];
  if (!animation) {
    return undefined;
  }

  return {
    ...animation,
    fps: clip.fps,
  };
};

const buildPreviewErrorMessage = (error, copy, dateTime) => {
  if (!error) {
    return "";
  }

  if (error.code === "spritesheet_too_large") {
    return formatI18nCopy(copy.sheetTooLargeMessage, {
      size: formatDimensions(error.sheetWidth, error.sheetHeight, dateTime),
      limit: String(error.limit),
    });
  }

  return withErrorDetails(
    copy.previewFailedMessage,
    error.details,
    copy.errorDetailsLabel,
  );
};

export const selectViewData = ({ state, i18n = {} }) => {
  const copy = selectCopy(i18n);
  const clip = selectClip(state);
  const framesByKey = new Map(state.frames.map((frame) => [frame.key, frame]));
  const entries = (clip?.entries ?? []).map((entry, index) => {
    const frame = framesByKey.get(entry.frameKey);
    const number = String(index + 1);

    return {
      key: entry.key,
      index,
      number,
      url: frame?.url ?? "",
      name: frame?.name ?? "",
      sizeLabel: frame
        ? formatDimensions(frame.width, frame.height, i18n.dateTime)
        : "",
      hold: entry.hold,
      holdAriaLabel: `${copy.holdLabel} ${number}`,
      ariaLabel: formatI18nCopy(copy.frameAriaLabel, {
        number,
        name: frame?.name ?? "",
      }),
    };
  });
  const frameSize = resolveFrameSize(state);
  const frameCount = entries.length;
  const previewAnimation = buildPreviewAnimation(state, clip);
  const previewErrorMessage = buildPreviewErrorMessage(
    state.preview.error,
    copy,
    i18n.dateTime,
  );

  return {
    status: state.status,
    isLoading: state.status === "loading",
    isError: state.status === "error",
    // Pictures can only join frames that loaded.
    addPicturesDisabled: state.status === "loading" || state.status === "error",
    hasFrames: frameCount > 0,
    entries,
    showClipSelect: state.clips.length > 1,
    clipOptions: state.clips.map((item) => ({
      label: item.name,
      value: item.name,
    })),
    selectedClipName: clip?.name ?? "",
    fpsValue: clip?.fps ?? state.defaultFps,
    fpsField: buildFpsField(i18n.dateTime),
    holdField: buildHoldField(i18n.dateTime),
    framesTitle: formatPluralCopy(copy, "framesTitle", frameCount, {
      dateTime: i18n.dateTime,
      replacements: { count: String(frameCount) },
    }),
    frameSizeText: frameSize
      ? formatDimensions(frameSize.width, frameSize.height, i18n.dateTime)
      : "–",
    playToggleDisabled: frameCount === 0,
    previewBoxStyle: buildPreviewBoxStyle(frameSize ?? EMPTY_PREVIEW_ASPECT),
    showConversionNote: state.sourceKind === "sheet" && frameCount > 0,
    previewPlaceholderLabel:
      state.status === "loading"
        ? copy.loadingFramesLabel
        : copy.previewEmptyLabel,
    previewUrl: state.preview.url ?? "",
    previewAtlas: state.preview.atlas,
    previewAnimation,
    previewPaused: !state.isPlaying,
    previewKey: `${state.previewRevision}-${clip?.name ?? ""}-${clip?.fps ?? ""}`,
    previewErrorMessage,
    playToggleIcon: state.isPlaying ? "pause" : "play",
    playToggleLabel: state.isPlaying ? copy.pauseButton : copy.playButton,
    checkerboardStyle: CHECKERBOARD_STYLE,
    copy,
  };
};
