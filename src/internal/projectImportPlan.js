// Pure rules for importing a project from a folder or a zip archive. Native
// code only moves bytes; these functions decide what a project is, which zip
// entries to extract and where, and which files to rename. Every failure is an
// Error whose message starts with a stable code (`invalidArchive`,
// `unsafeArchiveEntry`, `archiveTooLarge`, `invalidFileName`,
// `fileNameConflict`) so the app can show a localized message.

export const PROJECT_IMPORT_LIMITS = Object.freeze({
  maxArchiveEntries: 50_000,
  // A downloaded or picked zip file.
  maxArchiveBytes: 4 * 1024 ** 3,
  // Bytes actually written when the zip is extracted.
  maxExtractedBytes: 8 * 1024 ** 3,
});

const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const EXPORT_INCOMPLETE_MARKER_NAME = "ROUTEVN_EXPORT_INCOMPLETE.txt";
const DATABASE_FILE_NAMES = new Set([
  "project.db",
  "project.db-wal",
  "project.db-shm",
  "project.db-journal",
]);
const UNSAFE_NAME_PATTERN = /[\\\0:]/;

const importError = (code, detail) => new Error(`${code}: ${detail}`);

// The file id of a name directly inside `files/`: the part before the first
// dot, or the whole name when it has none. Names starting with a dot are not
// project files.
export const getFileIdForName = (name) => {
  const dotIndex = name.indexOf(".");
  return dotIndex === -1 ? name : name.slice(0, dotIndex);
};

// Rule A. Every regular file directly inside `files/` must be stored under its
// file id, so `abc.png` becomes `abc`. `entries` are `{ name, kind }` with kind
// `file`, `directory`, `symlink` or `other`. Directories, links and special
// entries are never renamed but keep their name, so `abc.png` next to a
// directory called `abc` is a conflict. Returns `[{ from, to }]` and renames
// nothing itself; it throws before anything is changed.
export const planFileRenames = (entries) => {
  // Lowercase names already taken: macOS and Windows treat `ABC` and `abc` as
  // the same file.
  const owners = new Map();
  for (const { name, kind } of entries) {
    if (kind !== "file") {
      owners.set(name.toLowerCase(), name);
    }
  }

  const renames = [];
  for (const { name, kind } of entries) {
    if (kind !== "file" || name.startsWith(".")) {
      continue;
    }
    const fileId = getFileIdForName(name);
    if (!FILE_ID_PATTERN.test(fileId)) {
      throw importError("invalidFileName", name);
    }
    const key = fileId.toLowerCase();
    const owner = owners.get(key);
    if (owner !== undefined) {
      throw importError(
        "fileNameConflict",
        `${owner} and ${name} both map to ${fileId}`,
      );
    }
    owners.set(key, name);
    if (fileId !== name) {
      renames.push({ from: name, to: fileId });
    }
  }
  return renames;
};

// Renames needed by a project folder that is already on disk. `list(path)`
// returns the `{ name, kind }` entries of a folder relative to the project
// folder. A `files` folder that is itself a link is refused, because a rename
// inside it would change files outside the project.
export const planFolderFileRenames = async ({ list }) => {
  const root = await list("");
  const filesEntry = root.find((entry) => entry.name === "files");
  if (!filesEntry) {
    return [];
  }
  if (filesEntry.kind === "symlink") {
    throw importError(
      "importFailed",
      "The project's files folder must not be a link.",
    );
  }
  return planFileRenames(await list("files"));
};

const assertSafeEntryName = ({ rawName, segments }) => {
  if (
    UNSAFE_NAME_PATTERN.test(rawName) ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw importError("unsafeArchiveEntry", rawName);
  }
};

// Reads an archive's entry table and decides what to extract. `entries` are
// `{ name, size, isDirectory }` straight from the zip. A zip is accepted when
// its root, or its single top-level folder, holds `project.db`. Only
// `project.db` and its sidecars, `files/<name>` and `file-metadata/<name>` are
// extracted; `__MACOSX/` and dot-entries are ignored. The result is the list
// of `{ entry, path }` to extract, with Rule A already applied to `files/`.
export const planArchiveExtraction = ({
  entries,
  limits = PROJECT_IMPORT_LIMITS,
}) => {
  if (entries.length > limits.maxArchiveEntries) {
    throw importError("invalidArchive", "The archive has too many entries.");
  }

  const seen = new Set();
  const items = [];
  for (const entry of entries) {
    const isDirectory = entry.isDirectory === true || entry.name.endsWith("/");
    const trimmedName = isDirectory
      ? entry.name.replace(/\/$/, "")
      : entry.name;
    const segments = trimmedName.split("/");
    if (segments[0] === "__MACOSX") {
      continue;
    }
    assertSafeEntryName({ rawName: entry.name, segments });

    // Two entries whose paths differ only by case would be the same file on
    // macOS and Windows, so one could silently replace the other.
    const key = trimmedName.toLowerCase();
    if (seen.has(key)) {
      throw importError("invalidArchive", `Duplicate entry ${entry.name}.`);
    }
    seen.add(key);

    if (segments.some((segment) => segment.startsWith("."))) {
      continue;
    }
    items.push({
      entry: entry.name,
      segments,
      isDirectory,
      size: Math.max(0, Number(entry.size) || 0),
    });
  }

  const hasFileAt = (...path) =>
    items.some(
      (item) =>
        !item.isDirectory &&
        item.segments.length === path.length &&
        item.segments.every((segment, index) => segment === path[index]),
    );

  let prefix;
  if (hasFileAt("project.db")) {
    prefix = [];
  } else {
    const topLevelNames = new Set(items.map((item) => item.segments[0]));
    if (topLevelNames.size === 1) {
      const [topLevelName] = topLevelNames;
      if (hasFileAt(topLevelName, "project.db")) {
        prefix = [topLevelName];
      }
    }
  }
  if (!prefix) {
    throw importError(
      "invalidArchive",
      "The archive does not contain project.db.",
    );
  }

  const databaseFiles = [];
  const assetCandidates = [];
  const assetEntries = [];
  const metadataFiles = [];
  for (const item of items) {
    const relative = item.segments.slice(prefix.length);
    if (relative.length === 0) {
      continue;
    }
    if (relative[0] === EXPORT_INCOMPLETE_MARKER_NAME) {
      throw importError("invalidArchive", "The project export is incomplete.");
    }
    if (
      relative.length === 1 &&
      !item.isDirectory &&
      DATABASE_FILE_NAMES.has(relative[0])
    ) {
      databaseFiles.push({
        entry: item.entry,
        path: relative[0],
        size: item.size,
      });
    } else if (relative.length === 2 && relative[0] === "files") {
      assetEntries.push({
        name: relative[1],
        kind: item.isDirectory ? "directory" : "file",
      });
      if (!item.isDirectory) {
        assetCandidates.push({
          entry: item.entry,
          name: relative[1],
          size: item.size,
        });
      }
    } else if (
      relative.length === 2 &&
      relative[0] === "file-metadata" &&
      !item.isDirectory
    ) {
      metadataFiles.push({
        entry: item.entry,
        path: `file-metadata/${relative[1]}`,
        size: item.size,
      });
    }
  }

  const newNames = new Map(
    planFileRenames(assetEntries).map(({ from, to }) => [from, to]),
  );
  const assetFiles = assetCandidates.map((candidate) => ({
    entry: candidate.entry,
    path: `files/${newNames.get(candidate.name) ?? candidate.name}`,
    size: candidate.size,
  }));

  const selected = [...databaseFiles, ...assetFiles, ...metadataFiles];
  const totalBytes = selected.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > limits.maxExtractedBytes) {
    throw importError(
      "archiveTooLarge",
      "The archive is too large to extract.",
    );
  }

  return {
    files: selected.map(({ entry, path }) => ({ entry, path })),
    totalBytes,
  };
};
