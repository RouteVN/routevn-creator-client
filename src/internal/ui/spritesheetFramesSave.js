import { formatDimensions } from "../dates.js";
import {
  parseSpritesheetAtlasFile,
  parseSpritesheetImport,
} from "../spritesheetAtlas.js";
import {
  buildAnimationsFromSourceIndexes,
  getSpritesheetFramesDraftError,
} from "../spritesheetFrames.js";
import { resolveSpritesheetSize } from "../spritesheets.js";
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

const getMissingImagesMessage = (i18n, missingImages = []) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  return missingImages.length > 0
    ? formatI18nCopy(copy.missingSheetImagesMessage, {
        names: missingImages.join(", "),
      })
    : copy.singleSheetImageMessage;
};

// What to tell the user about picked spritesheet files they can fix, or
// undefined for any other failure.
const getSourceFilesMessage = (i18n, error) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  if (error?.code === "spritesheet_images_missing") {
    return getMissingImagesMessage(i18n, error.missingImages);
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

// The PNG files a JSON for several images still needs, when it was picked
// before them. That JSON stays picked while they are chosen.
export const getAwaitedSpritesheetImages = ({ error, pngFiles = [] } = {}) =>
  error?.code === "spritesheet_images_missing" && pngFiles.length === 0
    ? error.missingImages
    : undefined;

// Tells the user which PNG files the picked JSON still needs.
export const showMissingSpritesheetImages = ({
  appService,
  i18n,
  missingImages,
} = {}) => {
  showWarning({
    appService,
    message: getMissingImagesMessage(i18n, missingImages),
    i18n,
  });
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

// A default width and height the import filled in follow the frames when a
// save changes their size. A size set by hand stays.
const followImportedDefaultSize = ({ existingItem, data }) => {
  const { width, height } = existingItem ?? {};
  if (width === undefined || height === undefined) {
    return;
  }

  const sizeBefore = resolveSpritesheetSize({
    jsonData: existingItem.jsonData,
    animations: existingItem.animations,
    sheetWidth: existingItem.sheetWidth,
    sheetHeight: existingItem.sheetHeight,
  });
  if (width !== sizeBefore.width || height !== sizeBefore.height) {
    return;
  }

  const sizeAfter = resolveSpritesheetSize({
    jsonData: data.jsonData ?? existingItem.jsonData,
    animations: data.animations ?? existingItem.animations,
    sheetWidth: data.sheetWidth ?? existingItem.sheetWidth,
    sheetHeight: data.sheetHeight ?? existingItem.sheetHeight,
  });
  if (sizeAfter.width !== width || sizeAfter.height !== height) {
    data.width = sizeAfter.width;
    data.height = sizeAfter.height;
  }
};

// Turns a frames editor draft into spritesheet fields to save. Returns
// `{ ok: true, data, fileRecords, fileIdByFrameKey, sourceIndexByFrameKey }`,
// or `{ ok: false, message, error }` after telling the user why it cannot
// save, unless `notify` is false. `error` is set only when building the
// sheet failed, as opposed to a draft that is not ready to save.
//
// Only new pictures need a new sheet image. Edits that keep to the frames
// already in the sheet save just the animations, which keeps the sheet, its
// files, and a spritesheet that was uploaded as PNG and JSON as they are.
// Such a save has no `sourceIndexByFrameKey`.
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

  const animations = existingItem?.fileId
    ? buildAnimationsFromSourceIndexes(draft)
    : undefined;
  if (animations) {
    const data = { animations };
    followImportedDefaultSize({ existingItem, data });
    return { ok: true, data, fileRecords: [], fileIdByFrameKey: {} };
  }

  try {
    const result = await projectService.buildSpritesheetFromFrames({
      frames: draft.frames,
      clips: draft.clips,
      keepFrameKeys: draft.keepFrameKeys,
      name,
    });
    const data = { ...result.data };
    followImportedDefaultSize({ existingItem, data });
    return {
      ok: true,
      data,
      fileRecords: result.fileRecords,
      fileIdByFrameKey: result.fileIdByFrameKey,
      sourceIndexByFrameKey: result.sourceIndexByFrameKey,
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

// An empty spritesheet gets its sheet as a PNG and its JSON together.
// Returns which of the two is missing, or undefined.
export const getEmptySpritesheetMissingSource = ({
  existingItem,
  sourceFiles,
} = {}) => {
  if (!existingItem || existingItem.fileId) {
    return undefined;
  }

  const hasPng = Boolean(sourceFiles?.pngFile);
  const hasJson = Boolean(sourceFiles?.atlasFile);
  if (hasPng === hasJson) {
    return undefined;
  }

  return hasPng ? "json" : "png";
};

// Asks before a new sheet file replaces the pictures a spritesheet was made
// from. The editor then cuts its frames from the new sheet.
export const confirmReplaceSpritesheetFrames = ({ appService, i18n }) => {
  const copy = selectSpritesheetFramesCopy(i18n);
  return appService.showDialog({
    title: copy.replaceFramesTitle,
    message: copy.replaceFramesMessage,
    confirmText: copy.replaceFramesConfirmButton,
    cancelText: copy.cancelButton,
  });
};
