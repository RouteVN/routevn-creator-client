import { Channel, invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import {
  copyFile,
  mkdir,
  readDir,
  remove,
  rename,
  stat,
} from "@tauri-apps/plugin-fs";
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
// the Tauri fs plugin for everything else, including copying a picked zip. Staging is a temporary folder inside
// the chosen destination, so the extracted project can be moved into place
// without leaving the volume. Its name has no leading dot because the fs
// plugin's scope does not match hidden names.
export const createTauriProjectImportHost = () => ({
  createStaging: async ({ parent }) => {
    const name = `routevn-import-${generateId()}`;
    const dir = await join(parent, name);
    await mkdir(dir);
    return { dir, name };
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

  // Copies a picked zip into staging. The picker adds the file to the fs
  // scope; the size is checked first, as the download is.
  copyFile: async ({ dir }, { uri, path, maxBytes }) => {
    const { size } = await stat(uri);
    if (size > maxBytes) {
      throw new Error(
        `tooLarge: The archive is ${size} bytes, over the ${maxBytes} byte limit.`,
      );
    }
    await copyFile(uri, await join(dir, path));
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
    // Native extraction only creates the folders its files need, but a project
    // always has a `files` folder, even when it has no assets (Android and iOS
    // create it natively).
    await mkdir(await join(destinationPath, "files"), { recursive: true });
  },

  // Moves everything in the extracted project folder out of staging into
  // `folder`, the destination staging was created in, which must hold nothing
  // else. Nothing is ever replaced or merged into. If a move fails, the
  // entries already moved are moved back before the error is thrown.
  moveIntoEmptyFolder: async ({ staging, path, folder }) => {
    const others = (await readDir(folder)).filter(
      (entry) => entry.name !== staging.name,
    );
    if (others.length > 0) {
      throw new Error("importFailed: The destination folder is not empty.");
    }

    const source = await join(staging.dir, path);
    const moved = [];
    try {
      for (const { name } of await readDir(source)) {
        await rename(await join(source, name), await join(folder, name));
        moved.push(name);
      }
    } catch (error) {
      for (const name of moved.reverse()) {
        try {
          await rename(await join(folder, name), await join(source, name));
        } catch (rollbackError) {
          console.error(
            "Failed to move an imported entry back:",
            rollbackError,
          );
        }
      }
      throw new Error(
        `importFailed: Failed to move the project into the destination folder. ${error}`,
      );
    }
  },

  // Removes everything in `folder` except the staging folder, leaving it as
  // empty as it was before the import moved the project in.
  emptyFolder: async ({ folder, staging }) => {
    for (const { name } of await readDir(folder)) {
      if (name !== staging.name) {
        await remove(await join(folder, name), { recursive: true });
      }
    }
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
