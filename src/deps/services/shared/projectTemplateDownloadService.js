import { SCHEMA_VERSION } from "@routevn/creator-model";
import { createImportPackageClient } from "../../clients/importPackageClient.js";
import { requireProjectResolution } from "../../../internal/projectResolution.js";
import {
  PROJECT_TEMPLATE_INVALID,
  PROJECT_TEMPLATE_TOO_LARGE,
  PROJECT_TEMPLATE_UNSUPPORTED,
} from "../../../internal/projectTemplateErrors.js";
import {
  PROJECT_TEMPLATE_FILE_ID_PATTERN,
  PROJECT_TEMPLATE_KIND,
  PROJECT_TEMPLATE_LIMITS,
  PROJECT_TEMPLATE_SCHEMA,
} from "../../../internal/projectTemplatePackage.js";
import { assertSupportedProjectState } from "./projectRepository.js";

// Reads a project template before a project is created from it: its
// package's manifest, `project-template.json`, and every file its repository
// lists, `files/<id>`. A store template is read by byte range from the
// package's signed URL; a template file on this device, a slice at a time.
// The whole template is checked and in memory before anything is created, so
// a template that fails to read leaves nothing behind.

export { PROJECT_TEMPLATE_KIND, PROJECT_TEMPLATE_SCHEMA };

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export class ProjectTemplateDownloadError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "ProjectTemplateDownloadError";
    this.code = code;
  }
}

const invalid = (message, cause) =>
  new ProjectTemplateDownloadError(PROJECT_TEMPLATE_INVALID, message, {
    cause,
  });

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isByteCount = (value) => Number.isSafeInteger(value) && value >= 0;

// The manifest's repository and its file records, after checking what the
// asset store checks of a package and what this Creator can open.
const readManifest = (manifest, { creatorModelSchema }) => {
  if (
    !isObject(manifest) ||
    manifest.schema !== PROJECT_TEMPLATE_SCHEMA ||
    !isObject(manifest.package) ||
    manifest.package.kind !== PROJECT_TEMPLATE_KIND
  ) {
    throw invalid("The package is not a project template.");
  }
  if (
    !Number.isInteger(manifest.creatorModelSchema) ||
    manifest.creatorModelSchema < 1
  ) {
    throw invalid("The template's Creator model schema is not valid.");
  }
  if (manifest.creatorModelSchema > creatorModelSchema) {
    throw new ProjectTemplateDownloadError(
      PROJECT_TEMPLATE_UNSUPPORTED,
      `The template needs Creator model schema ${manifest.creatorModelSchema}; this app has ${creatorModelSchema}.`,
    );
  }

  const { repository } = manifest;
  if (!isObject(repository) || !isObject(repository.files?.items)) {
    throw invalid("The template has no project state.");
  }
  try {
    requireProjectResolution(
      repository.project?.resolution,
      "The template's resolution",
    );
    assertSupportedProjectState(repository);
  } catch (error) {
    throw invalid("The template's project state is not valid.", error);
  }

  const records = Object.entries(repository.files.items);
  if (records.length > PROJECT_TEMPLATE_LIMITS.files) {
    throw invalid("The template has too many files.");
  }
  const files = records.map(([fileId, record]) => {
    if (
      !PROJECT_TEMPLATE_FILE_ID_PATTERN.test(fileId) ||
      record?.id !== fileId ||
      typeof record.mimeType !== "string" ||
      !isByteCount(record.size) ||
      !SHA256_PATTERN.test(record.sha256 ?? "")
    ) {
      throw invalid(`The template's file ${fileId} is not valid.`);
    }
    return {
      fileId,
      mimeType: record.mimeType,
      size: record.size,
      sha256: record.sha256,
    };
  });
  return { repository, files };
};

// Every file of the template, read from `source` and checked against its
// record, up to `concurrency` at once; the first failure stops the rest.
// `onProgress({stage, current, total})` follows the files' bytes.
const readTemplateFiles = async ({
  source,
  files,
  concurrency,
  stage,
  onProgress,
  signal,
}) => {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const controller = new AbortController();
  const stop = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", stop, { once: true });
  const read = [];
  let next = 0;
  let received = 0;
  onProgress?.({ stage, current: 0, total });
  const readNext = async () => {
    while (next < files.length) {
      const index = next;
      next += 1;
      const file = files[index];
      const { bytes } = await source.readFile({
        descriptor: {
          source: { url: `files/${file.fileId}` },
          mimeType: file.mimeType,
          size: file.size,
          sha256: file.sha256,
        },
        signal: controller.signal,
      });
      read[index] = { fileId: file.fileId, mimeType: file.mimeType, bytes };
      received += file.size;
      onProgress?.({ stage, current: received, total });
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, files.length) }, () =>
        readNext().catch((error) => {
          controller.abort();
          throw error;
        }),
      ),
    );
  } finally {
    signal?.removeEventListener("abort", stop);
  }
  return read;
};

const assertTotalSize = (files, maxBytes, message) => {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > maxBytes) {
    throw new ProjectTemplateDownloadError(PROJECT_TEMPLATE_TOO_LARGE, message);
  }
};

// What a template file's card shows: its package's name, or else the file's.
const getTemplateFileTitle = (manifest, file) =>
  typeof manifest.package.name === "string" && manifest.package.name.trim()
    ? manifest.package.name.trim()
    : `${file.name ?? ""}`.replace(/\.zip$/i, "");

export const createProjectTemplateDownloadService = ({
  assetStore,
  importClient = createImportPackageClient(),
  creatorModelSchema = SCHEMA_VERSION,
} = {}) => ({
  /**
   * The store template `templateId`, ready to create a project from: `{id,
   * repository, files}`, each file `{fileId, mimeType, bytes}`, its bytes
   * matching the record's size and SHA-256. Asking for the package counts one
   * download. `onProgress({stage: "downloading", current, total})` follows
   * the files' bytes.
   */
  async downloadProjectTemplate({ templateId, onProgress, signal } = {}) {
    const getZip = ({ countDownload = false } = {}) =>
      assetStore.getProjectTemplateDownload({
        projectTemplateId: templateId,
        countDownload,
      });
    const zip = await getZip({ countDownload: true });
    const source = importClient.openProjectTemplatePackage({
      id: templateId,
      zip,
      getZip,
    });
    const { manifest } = await source.readManifest({ signal });
    const { repository, files } = readManifest(manifest, {
      creatorModelSchema,
    });
    assertTotalSize(
      files,
      importClient.limits.totalBytes,
      "The template is larger than the app can download.",
    );
    const downloaded = await readTemplateFiles({
      source,
      files,
      concurrency: importClient.limits.downloadConcurrency,
      stage: "downloading",
      onProgress,
      signal,
    });
    return { id: templateId, repository, files: downloaded };
  },

  /**
   * What the Create Project form shows of the template file `file`, a
   * template's package ZIP on this device, after checking its manifest:
   * `{title, resolution}`. Throws as a store template's download does when
   * it is not a template this app can open.
   */
  async readProjectTemplateFileInfo({ file, signal } = {}) {
    const source = importClient.openProjectTemplateFile({ file });
    const { manifest } = await source.readManifest({ signal });
    const { repository } = readManifest(manifest, { creatorModelSchema });
    const { width, height } = repository.project.resolution;
    return {
      title: getTemplateFileTitle(manifest, file),
      resolution: { width, height },
    };
  },

  /**
   * The template file `file`, ready to create a project from: `{repository,
   * files}`, as a store template's download gives it. It may be as large as
   * the asset store accepts a template, since nothing is downloaded.
   * `onProgress({stage: "extracting", current, total})` follows the files'
   * bytes.
   */
  async readProjectTemplateFile({ file, onProgress, signal } = {}) {
    const source = importClient.openProjectTemplateFile({ file });
    const { manifest } = await source.readManifest({ signal });
    const { repository, files } = readManifest(manifest, {
      creatorModelSchema,
    });
    assertTotalSize(
      files,
      PROJECT_TEMPLATE_LIMITS.totalBytes,
      "The template is larger than a template can be.",
    );
    return {
      repository,
      files: await readTemplateFiles({
        source,
        files,
        concurrency: 1,
        stage: "extracting",
        onProgress,
        signal,
      }),
    };
  },
});
