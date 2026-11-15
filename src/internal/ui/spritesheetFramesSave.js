import { formatDimensions } from "../dates.js";
import {
  parseSpritesheetAtlasFile,
  parseSpritesheetImport,
} from "../spritesheetAtlas.js";
import { getSpritesheetFramesDraftError } from "../spritesheetFrames.js";
import { formatI18nCopy, selectI18nCopy } from "./i18nCopy.js";
import { showResourcePageError } from "./resourcePages/resourcePageErrors.js";

export const selectSpritesheetFramesCopy = (i18n) =>
  selectI18nCopy(i18n, ["spritesheetFramesEditor"]);

// How a new spritesheet starts: empty, to fill in the spritesheet editor, or
// from a PNG spritesheet and its JSON file.
export const SPRITESHEET_CREATE_SOURCES = Object.freeze({
  EMPTY: "empty",
  FILE: "file",
});

// The page fills this form slot with its PNG and JSON file pickers.
export const SPRITESHEET_CREATE_FILES_SLOT = "spritesheet-files";

// The create form's source choice, then a slot for the PNG and JSON files.
// The slot stays in the form and the page shows the file pickers in it only
// for a spritesheet made from files. Showing them as two `$when` slot fields
// instead crashed the WebView2 and Edge renderer while DevTools was open.
export const createSpritesheetCreateSourceFields = (i18n) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  return [
    {
      name: "source",
      type: "select",
      label: copy.createSourceLabel,
      options: [
        {
          value: SPRITESHEET_CREATE_SOURCES.EMPTY,
          label: copy.createEmptyOption,
        },
        {
          value: SPRITESHEET_CREATE_SOURCES.FILE,
          label: copy.sourceFileOption,
        },
      ],
      clearable: false,
    },
    {
      type: "slot",
      slot: SPRITESHEET_CREATE_FILES_SLOT,
    },
  ];
};

// What the PNG and JSON file pickers of the create form show.
export const selectSpritesheetCreateFileLabels = (
  i18n,
  { source, sourceFiles = {} } = {},
) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  return {
    show: source === SPRITESHEET_CREATE_SOURCES.FILE,
    pngFileLabel: copy.pngFileLabel,
    jsonFileLabel: copy.jsonFileLabel,
    pngFileName: (sourceFiles.pngFiles ?? [])
      .map((file) => file.name)
      .join(", "),
    jsonFileName: sourceFiles.atlasFile?.name ?? "",
    noFileSelected: copy.noFileSelected,
    chooseFileButton: copy.chooseFileButton,
  };
};

const showWarning = ({ appService, message, i18n }) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  appService.showAlert({
    message,
    title: copy.warningTitle,
  });
};

const PNG_FILE_PATTERN = /\.png$/i;
const JSON_FILE_PATTERN = /\.json$/i;

// Dropped files that make a spritesheet: one JSON and the PNG files it uses.
export const resolveSpritesheetImportFiles = (files = []) => {
  const pngFiles = files.filter((file) => PNG_FILE_PATTERN.test(file.name));
  const atlasFiles = files.filter((file) => JSON_FILE_PATTERN.test(file.name));
  if (
    pngFiles.length === 0 ||
    atlasFiles.length !== 1 ||
    pngFiles.length + 1 !== files.length
  ) {
    return undefined;
  }

  return { pngFiles, atlasFile: atlasFiles[0] };
};

// Reads the picked PNG files and JSON. A sheet split over several images is
// merged into one PNG, which is the `pngFile` to upload.
export const readSpritesheetSourceFiles = async ({
  projectService,
  pngFiles = [],
  atlasFile,
} = {}) => {
  if (!atlasFile) {
    return { pngFile: pngFiles[0] };
  }

  if (pngFiles.length === 0) {
    return { importData: await parseSpritesheetAtlasFile({ atlasFile }) };
  }

  const combined = await projectService.combineSpritesheetSourceFiles({
    pngFiles,
    atlasFile,
  });
  return {
    pngFile: combined.pngFile,
    importData: await parseSpritesheetImport(combined),
  };
};

// What to tell the user about picked spritesheet files they can fix, or
// undefined for any other failure.
const getSourceFilesMessage = (i18n, error) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  if (error?.code === "spritesheet_images_missing") {
    return error.missingImages.length > 0
      ? formatI18nCopy(copy.missingSheetImagesMessage, {
          names: error.missingImages.join(", "),
        })
      : copy.singleSheetImageMessage;
  }

  if (error?.code === "spritesheet_too_large") {
    return formatI18nCopy(copy.mergedSheetTooLargeMessage, {
      size: formatDimensions(
        error.sheetWidth,
        error.sheetHeight,
        i18n.dateTime,
      ),
      limit: String(error.limit),
    });
  }

  return undefined;
};

// Tells the user why the picked PNG and JSON files cannot be read.
export const showSpritesheetSourceFilesError = ({
  appService,
  i18n,
  error,
  fallbackMessage,
  title,
} = {}) => {
  const message = getSourceFilesMessage(i18n, error);
  if (message) {
    showWarning({ appService, message, i18n });
    return;
  }

  showResourcePageError({
    appService,
    errorOrResult: error,
    fallbackMessage,
    title,
  });
};

const getDraftBlockedMessage = (draft, copy) => {
  if (draft.status === "loading") {
    return copy.framesStillLoadingMessage;
  }

  if (draft.status === "error") {
    return copy.loadFramesFailedMessage;
  }

  const draftError = getSpritesheetFramesDraftError(draft);
  if (draftError === "noFrames") {
    return copy.noFramesMessage;
  }

  if (draftError === "emptyClip") {
    return copy.emptyClipMessage;
  }

  return undefined;
};

// Clip FPS edits on a spritesheet whose frames did not change.
const mergeDraftFps = (animations = {}, clips = []) => {
  const nextAnimations = structuredClone(animations);
  for (const clip of clips) {
    if (nextAnimations[clip.name]) {
      nextAnimations[clip.name].fps = clip.fps;
    }
  }

  return nextAnimations;
};

// Turns a frames editor draft into spritesheet fields to save. Returns
// `{ ok: true, data, fileRecords, fileIdByFrameKey }`, or `{ ok: false,
// message, error }` after telling the user why it cannot save, unless
// `notify` is false. `error` is set only when building the sheet failed, as
// opposed to a draft that is not ready to save.
export const buildSpritesheetDataFromFramesDraft = async ({
  appService,
  projectService,
  i18n,
  draft,
  name,
  existingItem,
  notify = true,
} = {}) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  const fail = (message, error) => {
    if (notify && error) {
      showResourcePageError({
        appService,
        errorOrResult: error,
        fallbackMessage: message,
      });
    } else if (notify) {
      showWarning({ appService, message, i18n });
    }
    return { ok: false, message, error };
  };

  const blockedMessage = getDraftBlockedMessage(draft, copy);
  if (blockedMessage) {
    return fail(blockedMessage);
  }

  // Saved frames that did not change keep the current sheet.
  if (
    existingItem?.frameSource &&
    draft.sourceKind === "frames" &&
    !draft.framesChanged
  ) {
    const data = {};
    if (draft.fpsChanged) {
      data.animations = mergeDraftFps(existingItem.animations, draft.clips);
    }
    return {
      ok: true,
      data,
      fileRecords: [],
      fileIdByFrameKey: Object.fromEntries(
        draft.frames
          .filter((frame) => frame.fileId)
          .map((frame) => [frame.key, frame.fileId]),
      ),
    };
  }

  try {
    const result = await projectService.buildSpritesheetFromFrames({
      frames: draft.frames,
      clips: draft.clips,
      keepFrameKeys: draft.keepFrameKeys,
      frameWidth: draft.frameWidth,
      frameHeight: draft.frameHeight,
      name,
    });
    return {
      ok: true,
      data: result.data,
      fileRecords: result.fileRecords,
      fileIdByFrameKey: result.fileIdByFrameKey,
    };
  } catch (error) {
    if (error?.code === "spritesheet_too_large") {
      return fail(
        formatI18nCopy(copy.sheetTooLargeMessage, {
          size: formatDimensions(
            error.sheetWidth,
            error.sheetHeight,
            i18n.dateTime,
          ),
          limit: String(error.limit),
        }),
      );
    }

    return fail(copy.failedBuildSpritesheetMessage, error);
  }
};

// Asks before a new sheet file replaces the frames a spritesheet was made
// from, because the frames cannot be edited afterwards.
export const confirmReplaceSpritesheetFrames = ({ appService, i18n }) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  return appService.showDialog({
    title: copy.replaceFramesTitle,
    message: copy.replaceFramesMessage,
    confirmText: copy.replaceFramesConfirmButton,
    cancelText: copy.cancelButton,
  });
};
