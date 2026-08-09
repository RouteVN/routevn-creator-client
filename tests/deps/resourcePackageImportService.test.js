import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createResourcePackageImportService } from "../../src/deps/services/shared/resourcePackageImportService.js";

const manifest = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/import-packages/transforms.valid.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

const repositoryState = {
  transforms: {
    items: {
      "folder.transforms": {
        id: "folder.transforms",
        type: "folder",
        name: "Transforms",
      },
    },
    tree: [{ id: "folder.transforms" }],
  },
  images: {
    items: {
      "folder.images": {
        id: "folder.images",
        type: "folder",
        name: "Images",
      },
      "image.existing": {
        id: "image.existing",
        type: "image",
        name: "Existing",
        fileId: "file.existing",
      },
    },
    tree: [
      {
        id: "folder.images",
        children: [{ id: "image.existing" }],
      },
    ],
  },
  tags: {},
};

const createService = ({
  commitResult = { valid: true },
  stageResult,
} = {}) => {
  let id = 0;
  let currentProjectId = "project-one";
  const currentRepositoryState = structuredClone(repositoryState);
  const importClient = {
    limits: { totalBytes: 1_000_000, downloadConcurrency: 2 },
    fetchManifest: vi.fn(async () => ({
      manifest: manifest(),
      manifestUrl: "http://localhost:4179/manifests/transforms.json",
    })),
    downloadFile: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: "image/png",
    })),
  };
  const assetService = {
    stageResourceImportFile: vi.fn(async ({ fileId, thumbnailFileId }) =>
      stageResult
        ? stageResult({ fileId, thumbnailFileId })
        : {
            fileId,
            thumbnailFileId,
            dimensions: { width: 1, height: 1 },
            displayName: "Pixel",
            fileRecords: [
              {
                id: fileId,
                mimeType: "image/png",
                size: 3,
                sha256: "file-sha",
              },
              {
                id: thumbnailFileId,
                mimeType: "image/webp",
                size: 2,
                sha256: "thumb-sha",
              },
            ],
          },
    ),
    discardResourceImportFiles: vi.fn(async () => ({
      deletedFileIds: [],
      retainedFileIds: [],
    })),
    finalizeResourceImportFiles: vi.fn(),
  };
  const commandApi = {
    commitResourceImportPackage: vi.fn(async () => commitResult),
  };
  const service = createResourcePackageImportService({
    idGenerator: () => `generated-${++id}`,
    getCurrentProjectId: () => currentProjectId,
    getRepositoryState: () => currentRepositoryState,
    getRepositoryRevision: () => 5,
    assetService,
    commandApi,
    importClient,
  });
  return {
    service,
    importClient,
    assetService,
    commandApi,
    currentRepositoryState,
    setCurrentProjectId(projectId) {
      currentProjectId = projectId;
    },
  };
};

describe("resourcePackageImportService", () => {
  it("uses an existing image substitution without downloading package media", async () => {
    const { service, importClient, assetService, commandApi } = createService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
      operationId: "plan-operation",
    });
    expect(planned.plan.images[0].previewUrl).toBe(
      "http://localhost:4179/files/pixel.png",
    );
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      operationId: "execute-operation",
      resourceParentId: "folder.transforms",
      resourceChoices: {
        "image.pixel": {
          mode: "existing",
          projectResourceId: "image.existing",
        },
      },
      resourceDescriptions: {
        "transform.primary": "Updated primary description",
      },
    });
    expect(result.valid).toBe(true);
    expect(importClient.downloadFile).not.toHaveBeenCalled();
    expect(assetService.stageResourceImportFile).not.toHaveBeenCalled();
    expect(commandApi.commitResourceImportPackage).toHaveBeenCalledTimes(1);
    const commit = commandApi.commitResourceImportPackage.mock.calls[0][0];
    expect(commit.images).toEqual([]);
    expect(commit.existingImageIds).toEqual(["image.existing"]);
    expect(commit.resources[0].data.preview.background.imageId).toBe(
      "image.existing",
    );
    expect(commit.resources[0].data.description).toBe(
      "Updated primary description",
    );
    expect(commit.resources[1].data.preview.target.imageId).toBe(
      "image.existing",
    );
  });

  it("uses stable planned ids when creating destination folders", async () => {
    const { service, commandApi } = createService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      resourceDestination: { mode: "create", name: " Imported Transforms " },
      imageDestination: { mode: "create", name: " Imported Images " },
    });

    expect(result.valid).toBe(true);
    const commit = commandApi.commitResourceImportPackage.mock.calls[0][0];
    expect(commit.resourceDestination).toEqual({
      mode: "create",
      name: "Imported Transforms",
      ...planned.plan.destinationFolders.resource,
    });
    expect(commit.imageDestination).toEqual({
      mode: "create",
      name: "Imported Images",
      ...planned.plan.destinationFolders.images,
    });
  });

  it("cleans every staged blob when the atomic command batch is rejected", async () => {
    const { service, assetService } = createService({
      commitResult: {
        valid: false,
        error: { code: "validation_failed", message: "Rejected" },
      },
    });
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      resourceParentId: "folder.transforms",
      imageParentId: "folder.images",
    });
    expect(result.valid).toBe(false);
    expect(assetService.discardResourceImportFiles).toHaveBeenCalledTimes(1);
    expect(
      assetService.discardResourceImportFiles.mock.calls[0][0].fileIds,
    ).toHaveLength(2);
  });

  it("requests plan cleanup when staging fails before returning file records", async () => {
    const { service, assetService, commandApi } = createService();
    assetService.stageResourceImportFile.mockRejectedValue(
      new Error("thumbnail generation failed"),
    );
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      resourceParentId: "folder.transforms",
      imageParentId: "folder.images",
    });
    expect(result.valid).toBe(false);
    expect(commandApi.commitResourceImportPackage).not.toHaveBeenCalled();
    expect(assetService.discardResourceImportFiles).toHaveBeenCalledWith({
      planId: planned.plan.planId,
      fileIds: [],
    });
  });

  it("rejects package images outside the supported upload image formats", async () => {
    const { service, importClient, assetService, commandApi } = createService();
    const unsupportedManifest = manifest();
    unsupportedManifest.repository.files.items["file.pixel"].mimeType =
      "image/gif";
    importClient.fetchManifest.mockResolvedValue({
      manifest: unsupportedManifest,
      manifestUrl: "http://localhost:4179/manifests/transforms.json",
    });
    importClient.downloadFile.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: "image/gif",
    });
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      resourceParentId: "folder.transforms",
      imageParentId: "folder.images",
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "file_type_unsupported" },
    });
    expect(assetService.stageResourceImportFile).not.toHaveBeenCalled();
    expect(commandApi.commitResourceImportPackage).not.toHaveBeenCalled();
  });

  it("cancels an active manifest request", async () => {
    const { service, importClient } = createService();
    importClient.fetchManifest.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              const error = new Error("cancelled");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        }),
    );
    const pending = service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
      operationId: "cancel-me",
    });
    expect(service.cancelResourceImport({ operationId: "cancel-me" })).toEqual({
      cancelled: true,
    });
    const result = await pending;
    expect(result.valid).toBe(false);
  });

  it("rejects execution when the current project changed after review", async () => {
    const {
      service,
      importClient,
      assetService,
      commandApi,
      setCurrentProjectId,
    } = createService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
    });
    setCurrentProjectId("project-two");
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      resourceParentId: "folder.transforms",
      imageParentId: "folder.images",
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "project_changed" },
    });
    expect(importClient.downloadFile).not.toHaveBeenCalled();
    expect(assetService.stageResourceImportFile).not.toHaveBeenCalled();
    expect(commandApi.commitResourceImportPackage).not.toHaveBeenCalled();
  });

  it("retains staged blobs when commit confirmation has an unknown outcome", async () => {
    const { service, assetService, commandApi } = createService();
    const unknownOutcome = new Error("confirmation interrupted");
    unknownOutcome.commitOutcome = "unknown";
    commandApi.commitResourceImportPackage.mockRejectedValue(unknownOutcome);
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      resourceParentId: "folder.transforms",
      imageParentId: "folder.images",
    });
    expect(result).toMatchObject({
      valid: false,
      error: { code: "commit_outcome_unknown", retryable: true },
    });
    expect(assetService.discardResourceImportFiles).not.toHaveBeenCalled();
  });

  it("recovers an unknown commit without downloading or deleting its blobs again", async () => {
    const {
      service,
      assetService,
      commandApi,
      importClient,
      currentRepositoryState,
    } = createService();
    const unknownOutcome = new Error("confirmation interrupted");
    unknownOutcome.commitOutcome = "unknown";
    commandApi.commitResourceImportPackage.mockRejectedValueOnce(
      unknownOutcome,
    );
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/transforms.json",
      expectedResourceType: "transforms",
    });
    const execution = {
      planId: planned.plan.planId,
      resourceParentId: "folder.transforms",
      imageParentId: "folder.images",
    };
    const firstResult = await service.executeResourceImportPlan(execution);
    expect(firstResult.valid).toBe(false);

    for (const resource of planned.plan.resources) {
      currentRepositoryState.transforms.items[resource.destinationId] = {
        id: resource.destinationId,
        ...resource.data,
      };
    }
    for (const image of planned.plan.images) {
      currentRepositoryState.images.items[image.destinationId] = {
        id: image.destinationId,
        type: "image",
      };
    }
    const secondResult = await service.executeResourceImportPlan(execution);

    expect(secondResult).toMatchObject({
      valid: true,
      recoveredFromPreviousCommit: true,
    });
    expect(importClient.downloadFile).toHaveBeenCalledTimes(1);
    expect(commandApi.commitResourceImportPackage).toHaveBeenCalledTimes(1);
    expect(assetService.discardResourceImportFiles).not.toHaveBeenCalled();
    expect(assetService.finalizeResourceImportFiles).toHaveBeenCalledWith({
      planId: planned.plan.planId,
    });
  });
});
