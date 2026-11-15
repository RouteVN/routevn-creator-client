import { getMaxTextureSize } from "../../clients/web/imageTexture.js";
import {
  cropSpritesheetFrames,
  readImageSizeFromUrl,
  renderSpritesheetImage,
} from "../../clients/web/spritesheetCanvas.js";
import { processWithConcurrency } from "../../../internal/processWithConcurrency.js";
import {
  getSpritesheetAtlasImageNames,
  getSpritesheetDisplayName,
  getSpritesheetFrameDisplayName,
  matchSpritesheetImageFiles,
  mergeSpritesheetAtlasPages,
} from "../../../internal/spritesheetAtlas.js";
import {
  SPRITESHEET_FRAME_PADDING,
  buildSpritesheetFramesOutput,
  getSpritesheetFrameCrops,
  getSpritesheetSizeLimitError,
} from "../../../internal/spritesheetFrames.js";

const PNG_MIME_TYPE = "image/png";
// Frame pictures are read a few at a time: in parallel, without opening
// hundreds of files at once.
const FRAME_READ_CONCURRENCY = 8;

const createSpritesheetFramesError = (code, message, details = {}) => {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
};

const readDeviceTextureLimit = () => {
  try {
    return getMaxTextureSize();
  } catch {
    return undefined;
  }
};

const toSafeFileBaseName = (name) =>
  String(name ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .slice(0, 80) || "spritesheet";

// An unreadable JSON is left for the import to report.
const readAtlasJson = async (atlasFile) => {
  try {
    return JSON.parse(await atlasFile.text());
  } catch {
    return undefined;
  }
};

// Every picture is copied into a blob URL the caller owns, so canvas reads
// never depend on where a platform serves project files from. A picture of
// unknown size is decoded to read it.
const createOwnedFrame = async ({ blob, name, file, fileId, size }) => {
  const url = URL.createObjectURL(blob);
  try {
    const { width, height } = size ?? (await readImageSizeFromUrl(url));
    return { name, file, fileId, url, width, height };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

export const createSpritesheetFramesService = ({
  getFileContent,
  uploadFiles,
} = {}) => {
  const readFileIdBlob = async (fileId) => {
    const content = await getFileContent(fileId);
    try {
      const response = await fetch(content.url);
      if (!response.ok) {
        throw new Error(`Unable to read file ${fileId}`);
      }
      return await response.blob();
    } finally {
      content.revoke?.();
    }
  };

  const getSizeLimitError = ({ sheetWidth, sheetHeight }) =>
    getSpritesheetSizeLimitError({
      sheetWidth,
      sheetHeight,
      maxTextureSize: readDeviceTextureLimit(),
    });

  const renderOutputImage = (output) =>
    renderSpritesheetImage({
      sheetWidth: output.sheetWidth,
      sheetHeight: output.sheetHeight,
      frames: output.frames,
      placements: output.placements,
    });

  return {
    // Reads picked or dropped pictures. Pictures that cannot be read are
    // returned in `failedFiles` instead of stopping the others.
    async readSpritesheetFrameFiles({ files = [] } = {}) {
      const results = await processWithConcurrency(
        files,
        async (file) => {
          try {
            return {
              frame: await createOwnedFrame({
                blob: file,
                file,
                name: getSpritesheetFrameDisplayName(file.name),
              }),
            };
          } catch {
            return { failedFile: file };
          }
        },
        { concurrency: FRAME_READ_CONCURRENCY },
      );

      return {
        frames: results.map((result) => result.frame).filter(Boolean),
        failedFiles: results.map((result) => result.failedFile).filter(Boolean),
      };
    },

    async loadSpritesheetFrameFileIds({ fileIds = [] } = {}) {
      const loadedFrames = [];
      try {
        return await processWithConcurrency(
          fileIds,
          async (fileId) => {
            const frame = await createOwnedFrame({
              blob: await readFileIdBlob(fileId),
              fileId,
            });
            loadedFrames.push(frame);
            return frame;
          },
          { concurrency: FRAME_READ_CONCURRENCY, stopOnError: true },
        );
      } catch (error) {
        for (const frame of loadedFrames) {
          URL.revokeObjectURL(frame.url);
        }
        throw error;
      }
    },

    // Cuts an existing sheet into one PNG file per atlas frame, at each
    // frame's original size.
    async extractSpritesheetFrames({ fileId, jsonData } = {}) {
      const crops = getSpritesheetFrameCrops(jsonData);
      if (crops.length === 0) {
        throw createSpritesheetFramesError(
          "spritesheet_has_no_frames",
          "The spritesheet JSON has no frames.",
        );
      }

      const sheetUrl = URL.createObjectURL(await readFileIdBlob(fileId));
      const frames = [];
      try {
        const blobs = await cropSpritesheetFrames({ url: sheetUrl, crops });
        for (const [index, crop] of crops.entries()) {
          const name = getSpritesheetFrameDisplayName(crop.name) || crop.name;
          const file = new File(
            [blobs[index]],
            `${toSafeFileBaseName(name)}.png`,
            { type: PNG_MIME_TYPE },
          );
          frames.push(
            await createOwnedFrame({
              blob: file,
              file,
              name,
              size: { width: crop.outputWidth, height: crop.outputHeight },
            }),
          );
        }
      } catch (error) {
        for (const frame of frames) {
          URL.revokeObjectURL(frame.url);
        }
        throw error;
      } finally {
        URL.revokeObjectURL(sheetUrl);
      }

      return frames;
    },

    // Renders the sheet of a `buildSpritesheetFramesOutput` result, for the
    // editor preview.
    async renderSpritesheetFramesPreview(output) {
      const limitError = getSizeLimitError(output);
      if (limitError) {
        return { limitError };
      }

      return { blob: await renderOutputImage(output) };
    },

    // Pairs the picked PNG files with the JSON and returns `{ pngFile,
    // atlasFile }`. A sheet split over several images is merged into one PNG
    // and one JSON first, so the import reads it as a single sheet.
    async combineSpritesheetSourceFiles({ pngFiles = [], atlasFile } = {}) {
      const atlas = await readAtlasJson(atlasFile);
      const imageNames = atlas ? getSpritesheetAtlasImageNames(atlas) : [];
      if (!atlas || (imageNames.length <= 1 && pngFiles.length <= 1)) {
        return { pngFile: pngFiles[0], atlasFile };
      }

      const imageFiles = matchSpritesheetImageFiles({ imageNames, pngFiles });
      const missingImages = imageNames.filter(
        (_imageName, index) => !imageFiles[index],
      );
      if (imageNames.length === 0 || missingImages.length > 0) {
        throw createSpritesheetFramesError(
          "spritesheet_images_missing",
          `The JSON needs these images: ${missingImages.join(", ")}`,
          { missingImages },
        );
      }

      if (imageFiles.length === 1) {
        return { pngFile: imageFiles[0], atlasFile };
      }

      const urls = imageFiles.map((file) => URL.createObjectURL(file));
      try {
        const pageSizes = await Promise.all(urls.map(readImageSizeFromUrl));
        const baseName = toSafeFileBaseName(
          getSpritesheetDisplayName(atlasFile.name),
        );
        const merged = mergeSpritesheetAtlasPages({
          atlas,
          pageSizes,
          imageName: `${baseName}.png`,
          padding: SPRITESHEET_FRAME_PADDING,
        });
        const limitError = getSizeLimitError(merged);
        if (limitError) {
          throw createSpritesheetFramesError(
            limitError.code,
            `The merged spritesheet would be ${merged.sheetWidth} × ${merged.sheetHeight}, larger than ${limitError.limit} pixels.`,
            limitError,
          );
        }

        const sheetBlob = await renderSpritesheetImage({
          sheetWidth: merged.sheetWidth,
          sheetHeight: merged.sheetHeight,
          frames: urls.map((url) => ({ url })),
          placements: merged.placements,
        });
        return {
          pngFile: new File([sheetBlob], `${baseName}.png`, {
            type: PNG_MIME_TYPE,
          }),
          atlasFile: new File([JSON.stringify(merged.atlas)], atlasFile.name, {
            type: "application/json",
          }),
        };
      } finally {
        urls.forEach((url) => URL.revokeObjectURL(url));
      }
    },

    // Renders the sheet, uploads the new frame pictures and the sheet, and
    // returns the spritesheet fields to save with the file records to add.
    // `sourceIndexByFrameKey` is each frame's index in the new sheet.
    async buildSpritesheetFromFrames({
      frames,
      clips,
      keepFrameKeys,
      name,
    } = {}) {
      const baseName = toSafeFileBaseName(name);
      const output = buildSpritesheetFramesOutput({
        frames,
        clips,
        keepFrameKeys,
        imageName: `${baseName}.png`,
      });
      const limitError = getSizeLimitError(output);
      if (limitError) {
        throw createSpritesheetFramesError(
          limitError.code,
          `The spritesheet would be ${output.sheetWidth} × ${output.sheetHeight}, larger than ${limitError.limit} pixels.`,
          limitError,
        );
      }

      const sheetBlob = await renderOutputImage(output);
      const sheetFile = new File([sheetBlob], `${baseName}.png`, {
        type: PNG_MIME_TYPE,
      });
      const newFrames = output.frames.filter((frame) => !frame.fileId);
      const frameUploads =
        newFrames.length > 0
          ? await uploadFiles(
              newFrames.map((frame) => frame.file),
              { skipImageThumbnail: true },
            )
          : [];
      const [sheetUpload] = await uploadFiles([sheetFile]);

      const uploadedFileIdByFile = new Map(
        frameUploads.map((result) => [result.file, result.fileId]),
      );
      const frameFileIds = output.frames.map(
        (frame) => frame.fileId ?? uploadedFileIdByFile.get(frame.file),
      );
      if (!sheetUpload?.fileId || frameFileIds.some((fileId) => !fileId)) {
        throw createSpritesheetFramesError(
          "spritesheet_frames_upload_failed",
          "Some spritesheet pictures could not be saved.",
        );
      }

      const data = {
        fileId: sheetUpload.fileId,
        sheetWidth: output.sheetWidth,
        sheetHeight: output.sheetHeight,
        frameCount: output.frameCount,
        jsonData: output.jsonData,
        animations: output.animations,
        frameSource: {
          frameWidth: output.frameWidth,
          frameHeight: output.frameHeight,
          frames: frameFileIds.map((fileId) => ({ fileId })),
        },
      };
      if (sheetUpload.thumbnailFileId) {
        data.thumbnailFileId = sheetUpload.thumbnailFileId;
      }

      return {
        data,
        fileIdByFrameKey: Object.fromEntries(
          output.frames.map((frame, index) => [frame.key, frameFileIds[index]]),
        ),
        sourceIndexByFrameKey: Object.fromEntries(
          output.frames.map((frame, index) => [frame.key, index]),
        ),
        fileRecords: [
          ...frameUploads.flatMap((result) => result.fileRecords ?? []),
          ...(sheetUpload.fileRecords ?? []),
        ],
      };
    },
  };
};
