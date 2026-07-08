import { assertSafeIOSStorageSegment } from "../../clients/ios/storagePaths.js";
import { assertSafeProjectFileId } from "../../../internal/projectFileIds.js";

const PROJECT_FILE_EXTENSION_BY_MIME_TYPE = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const getProjectFileExtension = (mimeType) => {
  const normalizedMimeType = String(mimeType ?? "")
    .trim()
    .toLowerCase();
  return PROJECT_FILE_EXTENSION_BY_MIME_TYPE[normalizedMimeType];
};

export const getIOSProjectFileUrl = ({ projectId, fileId, mimeType }) => {
  const safeProjectId = assertSafeIOSStorageSegment(projectId, {
    label: "iOS project id",
  });
  const safeFileId = assertSafeProjectFileId(fileId);
  const extension = getProjectFileExtension(mimeType);
  if (extension) {
    return `routevn://app/ios-files/projects/${safeProjectId}/typed-files/${safeFileId}/asset.${extension}`;
  }

  return `routevn://app/ios-files/projects/${safeProjectId}/files/${safeFileId}`;
};
