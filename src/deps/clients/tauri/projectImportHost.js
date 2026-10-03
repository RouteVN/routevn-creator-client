import { Channel, invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, remove, rename } from "@tauri-apps/plugin-fs";
import { generateId } from "../../../internal/id.js";

const createProgressChannel = (onProgress) => {
  const channel = new Channel();
  channel.onmessage = (event) => {
    onProgress?.(event);
  };
  return channel;
};

const toEntry = (entry) => {
  let kind = "other";
  if (entry.isSymlink) {
    kind = "symlink";
  } else if (entry.isDirectory) {
    kind = "directory";
  } else if (entry.isFile) {
    kind = "file";
  }
  return { name: entry.name, kind };
};

// Desktop uses three native commands (download, list a zip, extract a zip) and
// the Tauri fs plugin for everything else. Staging is a temporary folder inside
// the chosen destination, so the extracted project can be moved into place
// without leaving the volume. Its name has no leading dot because the fs
// plugin's scope does not match hidden names.
export const createTauriProjectImportHost = () => ({
  createStaging: async ({ parent }) => {
    const dir = await join(parent, `routevn-import-${generateId()}`);
    await mkdir(dir);
    return { dir };
  },

  removeStaging: async ({ dir }) => {
    await remove(dir, { recursive: true });
  },

  download: async ({ dir }, { url, path, maxBytes, onProgress }) => {
    return invoke("download_file", {
      url,
      destination: await join(dir, path),
      maxBytes,
      onProgress: createProgressChannel(onProgress),
    });
  },

  copyFile: async () => {
    throw new Error("importFailed: Importing a local zip is not supported.");
  },

  listArchive: async ({ dir }, { path, maxEntries }) => {
    const result = await invoke("list_archive", {
      archive: await join(dir, path),
      maxEntries,
    });
    return result.entries;
  },

  extractArchive: async (
    { dir },
    { path, destination, files, maxBytes, onProgress },
  ) => {
    const destinationPath = await join(dir, destination);
    await mkdir(destinationPath);
    await invoke("extract_archive", {
      archive: await join(dir, path),
      destination: destinationPath,
      files,
      maxBytes,
      onProgress: createProgressChannel(onProgress),
    });
  },

  // Moves the extracted project folder out of staging into `parent`, under
  // `name` or the first of `name 2`, `name 3`, ... that is free, and returns
  // its path. An existing folder is never replaced or merged into.
  moveToAvailableFolder: async ({ staging, path, parent, name }) => {
    const source = await join(staging.dir, path);
    for (let attempt = 1; ; attempt += 1) {
      const candidate = await join(
        parent,
        attempt === 1 ? name : `${name} ${attempt}`,
      );
      if (!(await exists(candidate))) {
        await rename(source, candidate);
        return candidate;
      }
    }
  },

  removeFolder: async (folderPath) => {
    await remove(folderPath, { recursive: true });
  },

  // The `{ name, kind }` entries of a folder inside a project folder.
  createFolderLister: (projectPath) => async (relativePath) => {
    const folderPath = relativePath
      ? await join(projectPath, relativePath)
      : projectPath;
    return (await readDir(folderPath)).map(toEntry);
  },

  // Applies planned `{ from, to }` renames inside `directory`. If one fails,
  // the renames already made are undone before the error is thrown.
  applyFileRenames: async ({ directory, renames }) => {
    const applied = [];
    try {
      for (const { from, to } of renames) {
        await rename(await join(directory, from), await join(directory, to));
        applied.push({ from, to });
      }
    } catch (error) {
      for (const { from, to } of applied.reverse()) {
        try {
          await rename(await join(directory, to), await join(directory, from));
        } catch (rollbackError) {
          console.error("Failed to undo a file rename:", rollbackError);
        }
      }
      throw new Error(
        `importFailed: Failed to rename a project file. ${error}`,
      );
    }
  },
});
