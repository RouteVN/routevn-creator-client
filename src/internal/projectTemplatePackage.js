// A project template package: a project's current state, without its
// history, and the files that state uses. It is one ZIP of stored entries:
// `project-template.json`, the manifest, then `files/<id>` for each of its
// file records. The asset store accepts a package only within these limits,
// so an export is refused before it is written when it would break one.

export const PROJECT_TEMPLATE_SCHEMA = "routevn.project-template.v1";
export const PROJECT_TEMPLATE_KIND = "routevn.creator.project-template";
export const PROJECT_TEMPLATE_MANIFEST_ENTRY = "project-template.json";

const MIB = 1024 * 1024;

export const PROJECT_TEMPLATE_LIMITS = Object.freeze({
  files: 2000,
  fileBytes: 50 * MIB,
  totalBytes: 2048 * MIB,
  manifestBytes: 8 * MIB,
  resolution: 16384,
});

export const PROJECT_TEMPLATE_FILE_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// The file types a template can hold: the Creator's image, sound, font, data
// and video types the asset store accepts.
export const PROJECT_TEMPLATE_FILE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/mpeg",
  "audio/x-mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "font/ttf",
  "font/otf",
  "font/woff2",
  "application/json",
  "text/json",
  "video/mp4",
  "video/webm",
]);

export const PROJECT_TEMPLATE_TOO_MANY_FILES =
  "project_template_too_many_files";
export const PROJECT_TEMPLATE_FILE_TOO_LARGE =
  "project_template_file_too_large";
export const PROJECT_TEMPLATE_FILES_TOO_LARGE =
  "project_template_files_too_large";
export const PROJECT_TEMPLATE_STATE_TOO_LARGE =
  "project_template_state_too_large";
export const PROJECT_TEMPLATE_UNSUPPORTED_FILE =
  "project_template_unsupported_file";
export const PROJECT_TEMPLATE_UNSUPPORTED_FILE_ID =
  "project_template_unsupported_file_id";
export const PROJECT_TEMPLATE_UNSUPPORTED_RESOLUTION =
  "project_template_unsupported_resolution";

export class ProjectTemplateExportError extends Error {
  // `details` are what the message names, such as a file's type.
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProjectTemplateExportError";
    this.code = code;
    this.details = details;
  }
}

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isFolder = (record) => record?.type === "folder";

// Every string in `value`, keys included. A file is used when its ID is one of
// them: anything that refers to a file does so by its ID.
const collectStrings = (value, strings) => {
  if (typeof value === "string") {
    strings.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, strings));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    strings.add(key);
    collectStrings(child, strings);
  }
};

// The IDs in a collection's tree, depth first, as the Creator lists them.
const treeOrder = (nodes, ids = []) => {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (typeof node?.id === "string") ids.push(node.id);
    treeOrder(node?.children, ids);
  }
  return ids;
};

/**
 * The state a template carries: the project's `state` with only the files it
 * uses. Folders of files, and files nothing uses any more, such as one a
 * replaced sound left behind, are left out, so its files are a flat list in
 * the order the project lists them.
 */
export const createProjectTemplateRepository = (state) => {
  const repository = structuredClone(state);
  const items = repository.files?.items ?? {};
  const used = new Set();
  for (const [key, value] of Object.entries(repository)) {
    if (key !== "files") collectStrings(value, used);
  }
  const ordered = [
    ...new Set([...treeOrder(repository.files?.tree), ...Object.keys(items)]),
  ];
  const fileIds = ordered.filter(
    (fileId) => items[fileId] && !isFolder(items[fileId]) && used.has(fileId),
  );
  const files = { items: {}, tree: [] };
  for (const fileId of fileIds) {
    files.items[fileId] = items[fileId];
    files.tree.push({ id: fileId });
  }
  repository.files = files;
  return repository;
};

const isResolutionSide = (value) =>
  Number.isInteger(value) &&
  value >= 1 &&
  value <= PROJECT_TEMPLATE_LIMITS.resolution;

/**
 * Checks what a template holds before its files are read: its resolution, and
 * the IDs, types and recorded sizes of its files. Throws a
 * `ProjectTemplateExportError` for the first rule it breaks.
 */
export const checkProjectTemplateRepository = (repository) => {
  const resolution = repository.project?.resolution;
  if (
    !isResolutionSide(resolution?.width) ||
    !isResolutionSide(resolution?.height)
  ) {
    throw new ProjectTemplateExportError(
      PROJECT_TEMPLATE_UNSUPPORTED_RESOLUTION,
      "The project's resolution is outside what a template can hold.",
    );
  }
  const records = Object.values(repository.files.items);
  if (records.length > PROJECT_TEMPLATE_LIMITS.files) {
    throw new ProjectTemplateExportError(
      PROJECT_TEMPLATE_TOO_MANY_FILES,
      `The project uses ${records.length} files.`,
      { count: records.length },
    );
  }
  for (const record of records) {
    const mimeType = `${record.mimeType ?? ""}`.toLowerCase();
    if (!PROJECT_TEMPLATE_FILE_TYPES.has(mimeType)) {
      throw new ProjectTemplateExportError(
        PROJECT_TEMPLATE_UNSUPPORTED_FILE,
        `The file ${record.id} is ${record.mimeType}, a type a template cannot hold.`,
        { mimeType: `${record.mimeType ?? ""}` },
      );
    }
    // Files the Creator adds always have such IDs; one from elsewhere may not.
    if (!PROJECT_TEMPLATE_FILE_ID_PATTERN.test(record.id)) {
      throw new ProjectTemplateExportError(
        PROJECT_TEMPLATE_UNSUPPORTED_FILE_ID,
        `The file ID ${record.id} cannot be in a template.`,
      );
    }
  }
  records.forEach((record) => checkProjectTemplateFileSize(record.size));
  checkProjectTemplateTotalSize(
    records.reduce((total, record) => total + record.size, 0),
  );
};

/** Throws when one file of `size` bytes is over the file limit. */
export const checkProjectTemplateFileSize = (size) => {
  if (size > PROJECT_TEMPLATE_LIMITS.fileBytes) {
    throw new ProjectTemplateExportError(
      PROJECT_TEMPLATE_FILE_TOO_LARGE,
      `A file of ${size} bytes is over the template file limit.`,
    );
  }
};

/** Throws when files of `total` bytes in all are over the package limit. */
export const checkProjectTemplateTotalSize = (total) => {
  if (total > PROJECT_TEMPLATE_LIMITS.totalBytes) {
    throw new ProjectTemplateExportError(
      PROJECT_TEMPLATE_FILES_TOO_LARGE,
      `The files total ${total} bytes, over the template limit.`,
    );
  }
};

/**
 * The manifest of a template whose state is `repository`, written with
 * Creator model schema `creatorModelSchema`. The project's name and
 * description name the package.
 */
export const createProjectTemplateManifest = ({
  repository,
  creatorModelSchema,
  name,
  description,
}) => {
  const packageInfo = { kind: PROJECT_TEMPLATE_KIND };
  if (name) packageInfo.name = name;
  if (description) packageInfo.description = description;
  return {
    schema: PROJECT_TEMPLATE_SCHEMA,
    package: packageInfo,
    creatorModelSchema,
    repository,
  };
};

/** The manifest's bytes, as UTF-8 JSON; refused over its limit. */
export const encodeProjectTemplateManifest = (manifest) => {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (bytes.byteLength > PROJECT_TEMPLATE_LIMITS.manifestBytes) {
    throw new ProjectTemplateExportError(
      PROJECT_TEMPLATE_STATE_TOO_LARGE,
      `The project's state is ${bytes.byteLength} bytes, over the manifest limit.`,
    );
  }
  return bytes;
};
