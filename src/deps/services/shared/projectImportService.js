import { parseProjectImportUrl } from "../../../internal/projectImportUrl.js";
import {
  PROJECT_IMPORT_LIMITS,
  planArchiveExtraction,
  planFolderFileRenames,
} from "../../../internal/projectImportPlan.js";

const ARCHIVE_PATH = "archive.zip";
const EXTRACTED_PATH = "extracted";

// The import sequence for every platform: put the zip in a staging folder
// (download it or copy a picked file), read its entry table, extract only what
// the plan asks for, then hand the extracted folder to the platform's `finish`
// step, which stores and registers it. The staging folder is removed however
// the import ends.
//
// `host` is the platform's small adapter over its native operations:
//   createStaging({ parent }) -> staging
//   removeStaging(staging)
//   download(staging, { url, path, maxBytes, onProgress }) -> { finalUrl, contentDisposition }
//   copyFile(staging, { uri, path, maxBytes })
//   listArchive(staging, { path, maxEntries }) -> [{ name, size, isDirectory }]
//   extractArchive(staging, { path, destination, files, maxBytes, onProgress })
// `onProgress` receives `{ stage, current, total }` with stage "downloading",
// "extracting" or "finishing".
export const createProjectImportService = ({
  host,
  limits = PROJECT_IMPORT_LIMITS,
}) => {
  const importFromStagedArchive = async ({
    parent,
    acquire,
    finish,
    onProgress,
  }) => {
    const staging = await host.createStaging({ parent });
    try {
      const meta = await acquire({ staging });
      const entries = await host.listArchive(staging, {
        path: ARCHIVE_PATH,
        maxEntries: limits.maxArchiveEntries,
      });
      const { files } = planArchiveExtraction({ entries, limits });
      await host.extractArchive(staging, {
        path: ARCHIVE_PATH,
        destination: EXTRACTED_PATH,
        files,
        maxBytes: limits.maxExtractedBytes,
        onProgress: ({ current, total }) => {
          onProgress?.({ stage: "extracting", current, total });
        },
      });
      onProgress?.({ stage: "finishing", current: 0, total: 0 });
      return await finish({ staging, path: EXTRACTED_PATH, meta });
    } finally {
      try {
        await host.removeStaging(staging);
      } catch (error) {
        // The platform sweeps stale staging folders, so a failed cleanup must
        // not hide the import's own result.
        console.error("Failed to remove import staging folder:", error);
      }
    }
  };

  return {
    // Download a zip from `url` (Google Drive links are rewritten first).
    // `finish({ staging, path, meta })` receives the extracted project folder
    // and `meta`, the download's `{ finalUrl, contentDisposition }`.
    importFromUrl: async ({ url, parent, finish, onProgress }) => {
      const normalizedUrl = parseProjectImportUrl(url);
      return importFromStagedArchive({
        parent,
        finish,
        onProgress,
        acquire: ({ staging }) =>
          host.download(staging, {
            url: normalizedUrl,
            path: ARCHIVE_PATH,
            maxBytes: limits.maxArchiveBytes,
            onProgress: ({ current, total }) => {
              onProgress?.({ stage: "downloading", current, total });
            },
          }),
      });
    },

    // Import a zip file the user picked on the device.
    importFromArchive: async ({ uri, parent, finish, onProgress }) => {
      return importFromStagedArchive({
        parent,
        finish,
        onProgress,
        acquire: async ({ staging }) => {
          await host.copyFile(staging, {
            uri,
            path: ARCHIVE_PATH,
            maxBytes: limits.maxArchiveBytes,
          });
          return {};
        },
      });
    },

    // The renames a project folder needs before it can be imported. `list(path)`
    // returns the `{ name, kind }` entries of a folder inside the project.
    planFolderFileRenames,
  };
};
