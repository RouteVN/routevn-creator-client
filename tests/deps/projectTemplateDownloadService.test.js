import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createProjectTemplateDownloadService,
  PROJECT_TEMPLATE_KIND,
  PROJECT_TEMPLATE_SCHEMA,
} from "../../src/deps/services/shared/projectTemplateDownloadService.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";

const encoder = new TextEncoder();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const FILES = {
  imageOne: encoder.encode("image one"),
  imageTwo: encoder.encode("image two!"),
};

// A small project's state: two image files and its resolution.
const createRepository = () => {
  const repository = structuredClone(initialProjectData);
  repository.project.resolution = { width: 1280, height: 720 };
  for (const [fileId, bytes] of Object.entries(FILES)) {
    repository.files.items[fileId] = {
      id: fileId,
      type: "image",
      mimeType: "image/png",
      size: bytes.length,
      sha256: sha256(bytes),
    };
    repository.files.tree.push({ id: fileId });
  }
  return repository;
};

const createManifest = (overrides = {}) => ({
  schema: PROJECT_TEMPLATE_SCHEMA,
  package: { kind: PROJECT_TEMPLATE_KIND, id: "Tp1TemplateOne01" },
  creatorModelSchema: 21,
  repository: createRepository(),
  ...overrides,
});

const ZIP = {
  url: "https://files.example/template.zip?signature=1",
  expiresAt: Date.now() + 600_000,
  size: 2048,
  directoryOffset: 1900,
  directorySize: 148,
};

const createService = ({ manifest = createManifest(), readFile } = {}) => {
  const assetStore = {
    getProjectTemplateDownload: vi.fn(async () => ZIP),
  };
  const source = {
    readManifest: vi.fn(async () => ({ manifest })),
    readFile: vi.fn(
      readFile ??
        (async ({ descriptor }) => ({
          bytes: FILES[descriptor.source.url.slice("files/".length)],
        })),
    ),
  };
  const importClient = {
    limits: { totalBytes: 1024, downloadConcurrency: 2 },
    openProjectTemplatePackage: vi.fn(() => source),
  };
  return {
    assetStore,
    importClient,
    source,
    service: createProjectTemplateDownloadService({
      assetStore,
      importClient,
      creatorModelSchema: 21,
    }),
  };
};

describe("project template downloads", () => {
  it("downloads a template's state and files, counting one download", async () => {
    const { service, assetStore, importClient, source } = createService();
    const progress = [];

    const template = await service.downloadProjectTemplate({
      templateId: "Tp1TemplateOne01",
      onProgress: (event) => progress.push(event),
    });

    expect(assetStore.getProjectTemplateDownload).toHaveBeenCalledWith({
      projectTemplateId: "Tp1TemplateOne01",
      countDownload: true,
    });
    // A fresh URL, when the first one expires, counts none.
    const { getZip } = importClient.openProjectTemplatePackage.mock.calls[0][0];
    await getZip();
    expect(assetStore.getProjectTemplateDownload).toHaveBeenLastCalledWith({
      projectTemplateId: "Tp1TemplateOne01",
      countDownload: false,
    });
    expect(source.readFile).toHaveBeenCalledWith({
      descriptor: {
        source: { url: "files/imageOne" },
        mimeType: "image/png",
        size: FILES.imageOne.length,
        sha256: sha256(FILES.imageOne),
      },
      signal: expect.any(AbortSignal),
    });
    expect(template).toEqual({
      id: "Tp1TemplateOne01",
      repository: createRepository(),
      files: [
        { fileId: "imageOne", mimeType: "image/png", bytes: FILES.imageOne },
        { fileId: "imageTwo", mimeType: "image/png", bytes: FILES.imageTwo },
      ],
    });
    const total = FILES.imageOne.length + FILES.imageTwo.length;
    expect(progress[0]).toEqual({ stage: "downloading", current: 0, total });
    expect(progress.at(-1)).toEqual({
      stage: "downloading",
      current: total,
      total,
    });
  });

  it("refuses a template written with a newer Creator model", async () => {
    const { service, source } = createService({
      manifest: createManifest({ creatorModelSchema: 22 }),
    });

    await expect(
      service.downloadProjectTemplate({ templateId: "Tp1TemplateOne01" }),
    ).rejects.toMatchObject({ code: "project_template_unsupported" });
    expect(source.readFile).not.toHaveBeenCalled();
  });

  it.each([
    ["another package", createManifest({ schema: "routevn.asset-package.v1" })],
    [
      "a project the Creator model refuses",
      createManifest({
        repository: { ...createRepository(), scenes: "not a collection" },
      }),
    ],
    [
      "no resolution",
      createManifest({
        repository: { ...createRepository(), project: {} },
      }),
    ],
    [
      "a file record without a checksum",
      (() => {
        const manifest = createManifest();
        delete manifest.repository.files.items.imageOne.sha256;
        return manifest;
      })(),
    ],
  ])("refuses %s before downloading any file", async (_case, manifest) => {
    const { service, source } = createService({ manifest });

    await expect(
      service.downloadProjectTemplate({ templateId: "Tp1TemplateOne01" }),
    ).rejects.toMatchObject({ code: "project_template_invalid" });
    expect(source.readFile).not.toHaveBeenCalled();
  });

  it("refuses a template larger than the app downloads", async () => {
    const manifest = createManifest();
    manifest.repository.files.items.imageOne.size = 2000;
    const { service, source } = createService({ manifest });

    await expect(
      service.downloadProjectTemplate({ templateId: "Tp1TemplateOne01" }),
    ).rejects.toMatchObject({ code: "project_template_too_large" });
    expect(source.readFile).not.toHaveBeenCalled();
  });

  it("stops at the first file that fails", async () => {
    const failure = Object.assign(new Error("bad file"), {
      code: "integrity_mismatch",
    });
    const { service } = createService({
      readFile: async () => {
        throw failure;
      },
    });

    await expect(
      service.downloadProjectTemplate({ templateId: "Tp1TemplateOne01" }),
    ).rejects.toBe(failure);
  });
});
