import JSZip from "jszip";
import { SCHEMA_VERSION } from "@routevn/creator-model";
import { computeSha256 } from "../../clients/sha256.js";
import {
  checkProjectTemplateFileSize,
  checkProjectTemplateRepository,
  checkProjectTemplateTotalSize,
  createProjectTemplateManifest,
  createProjectTemplateRepository,
  encodeProjectTemplateManifest,
  PROJECT_TEMPLATE_MANIFEST_ENTRY,
} from "../../../internal/projectTemplatePackage.js";
import {
  getPackageFilePath,
  readProjectFile,
} from "./assetPackageExportService.js";

// Exports the open project as a project template package: its current state
// and the files that state uses, without its history. See
// `projectTemplatePackage.js` for the package and its limits.

// A file's record as the package lists it: what its bytes are, read from them.
const createFileRecord = (record, bytes, sha256) => {
  const fileRecord = { id: record.id };
  if (record.type !== undefined) fileRecord.type = record.type;
  fileRecord.mimeType = record.mimeType;
  fileRecord.size = bytes.byteLength;
  fileRecord.sha256 = sha256;
  return fileRecord;
};

/**
 * The whole state of the open project's `repository`. Its state holds the
 * lines of the scene being edited only, so every scene's lines are loaded
 * with it.
 */
export const readProjectStateWithAllScenes = async (repository) => {
  const state = repository.getState();
  const sceneIds = Object.entries(state.scenes?.items ?? {})
    .filter(([, scene]) => scene?.type !== "folder")
    .map(([sceneId]) => sceneId);
  if (sceneIds.length === 0) return state;
  return repository.getContextState({ sceneIds });
};

export const createProjectTemplateExportService = ({
  getFileContent,
  getRepository,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  creatorModelSchema = SCHEMA_VERSION,
}) => ({
  /**
   * The open project's state as a template carries it, checked against the
   * package's limits from what the project records of its files. Throws a
   * `ProjectTemplateExportError` when it cannot be a template, before any
   * file is read.
   */
  async prepareProjectTemplate({ name, description } = {}) {
    const repository = createProjectTemplateRepository(
      await readProjectStateWithAllScenes(getRepository()),
    );
    checkProjectTemplateRepository(repository);
    encodeProjectTemplateManifest(
      createProjectTemplateManifest({
        repository,
        creatorModelSchema,
        name,
        description,
      }),
    );
    return { repository };
  },

  /**
   * The package ZIP of `repository`, from `prepareProjectTemplate`: every
   * file read, its size and SHA-256 taken from its bytes, and each entry
   * stored uncompressed. `onProgress({current, total})` follows the bytes
   * read.
   */
  async createProjectTemplateBundle({
    repository,
    name,
    description,
    onProgress,
  }) {
    const records = Object.values(repository.files.items);
    const total = records.reduce((sum, record) => sum + record.size, 0);
    const files = [];
    // A file's bytes can differ from what the project recorded of them, so
    // the limits are checked again as they are read.
    let current = 0;
    onProgress?.({ current, total });
    for (const record of records) {
      const bytes = new Uint8Array(
        await readProjectFile({
          fileId: record.id,
          getFileContent,
          fetchImpl,
        }),
      );
      checkProjectTemplateFileSize(bytes.byteLength);
      current += bytes.byteLength;
      checkProjectTemplateTotalSize(current);
      files.push({ record, bytes });
      onProgress?.({ current: Math.min(current, total), total });
    }

    const exported = structuredClone(repository);
    for (const { record, bytes } of files) {
      exported.files.items[record.id] = createFileRecord(
        record,
        bytes,
        await computeSha256(bytes, cryptoImpl),
      );
    }
    const manifestBytes = encodeProjectTemplateManifest(
      createProjectTemplateManifest({
        repository: exported,
        creatorModelSchema,
        name,
        description,
      }),
    );

    // The manifest, then each file as `files/<id>`, all stored.
    const zip = new JSZip();
    zip.file(PROJECT_TEMPLATE_MANIFEST_ENTRY, manifestBytes);
    for (const { record, bytes } of files) {
      zip.file(getPackageFilePath(record.id), bytes);
    }
    return zip.generateAsync({
      type: "blob",
      mimeType: "application/zip",
      compression: "STORE",
    });
  },
});
