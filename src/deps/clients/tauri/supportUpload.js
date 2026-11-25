import { Channel, invoke } from "@tauri-apps/api/core";

const createProgressChannel = (onProgress) => {
  const channel = new Channel();
  channel.onmessage = (event) => onProgress?.(event);
  return channel;
};

// Native packing and upload of a project sent to support. A packed project
// lives in a temporary folder under `archiveId` until `discardArchive`; the
// app chooses the ID, so it can cancel packing before it returns.
export const createTauriSupportUploadHost = ({ invokeImpl = invoke } = {}) => ({
  // `{ sizeBytes, sha256 }` of a zip holding the project's database, as one
  // consistent copy, and its `files` and `file-metadata` folders. Progress
  // events are `{ phase, current, total }`: `packing` counts the project's
  // bytes written, then `checking` the zip's bytes read for its SHA-256.
  createArchive({ archiveId, projectPath, onProgress }) {
    return invokeImpl("create_support_archive", {
      archiveId,
      projectPath,
      onProgress: createProgressChannel(onProgress),
    });
  },

  // Sends the zip with a PUT to `url`, with exactly `headers` and its length.
  // Resolves to `{ alreadyStored }`: true when storage refused the upload
  // because it already holds the file. Progress events are
  // `{ current, total }` bytes sent.
  uploadArchive({ archiveId, url, headers, onProgress }) {
    return invokeImpl("upload_support_archive", {
      archiveId,
      url,
      headers,
      onProgress: createProgressChannel(onProgress),
    });
  },

  // Makes the packing or upload under `archiveId` reject with `cancelled`.
  cancelArchive({ archiveId }) {
    return invokeImpl("cancel_support_archive", { archiveId });
  },

  // Deletes the packed project.
  discardArchive({ archiveId }) {
    return invokeImpl("discard_support_archive", { archiveId });
  },

  // What the system says of the device: `osVersion`, `model`, `arch`,
  // `webViewVersion`, `memoryBytes` and the `freeDiskBytes` on the drive that
  // holds the project, each left out when it can't be read.
  readNativeFacts({ projectPath }) {
    return invokeImpl("get_support_device_facts", { projectPath });
  },
});
