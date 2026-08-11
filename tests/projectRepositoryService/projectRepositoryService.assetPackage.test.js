import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";

const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);

const createHarness = ({ assetPackage: initialAssetPackage } = {}) => {
  let assetPackage = clone(initialAssetPackage);
  const store = {
    app: {
      get: vi.fn(async (key) => {
        if (key === "creatorVersion") {
          return 1;
        }
        if (key === "assetPackage") {
          return clone(assetPackage);
        }
        return undefined;
      }),
      set: vi.fn(async (key, value) => {
        if (key === "assetPackage") {
          assetPackage = clone(value);
        }
      }),
    },
  };
  const service = createProjectRepositoryService({
    router: {
      getPayload: () => ({ p: "project-1" }),
    },
    db: {
      get: vi.fn(async () => []),
      set: vi.fn(async () => undefined),
    },
    creatorVersion: 1,
    storageAdapter: {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/projects/${projectId}`,
        cacheKey: `/projects/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    },
    collabAdapter: {
      beforeCreateRepository: async () => undefined,
      afterCreateRepository: async () => undefined,
    },
  });

  return {
    getAssetPackage: () => clone(assetPackage),
    service,
    store,
  };
};

describe("projectRepositoryService asset package", () => {
  it("returns an empty normalized package when the KV entry is absent", async () => {
    const harness = createHarness();

    await expect(harness.service.getCurrentAssetPackage()).resolves.toEqual({
      schemaVersion: 1,
      metadata: {
        id: "",
        name: "",
        version: "",
        description: "",
      },
      resources: [],
    });
    expect(harness.store.app.get).toHaveBeenCalledWith("assetPackage");
  });

  it("strictly validates and saves the package under the singular KV key", async () => {
    const harness = createHarness();
    const assetPackage = {
      schemaVersion: 1,
      metadata: {
        id: "example.asset-package",
        name: "Example Asset Package",
        version: "1.0.0",
        description: "Example resources.",
      },
      resources: [
        {
          resourceType: "videos",
          folderIds: ["video-folder"],
        },
        {
          resourceType: "images",
          folderIds: ["image-folder"],
        },
      ],
    };

    await expect(
      harness.service.updateCurrentAssetPackage(assetPackage),
    ).resolves.toEqual(assetPackage);
    expect(harness.store.app.set).toHaveBeenCalledWith(
      "assetPackage",
      assetPackage,
    );
    expect(harness.getAssetPackage()).toEqual(assetPackage);
  });

  it.each([
    ["a missing schema version", { resources: [] }],
    ["an unsupported schema version", { schemaVersion: 2, resources: [] }],
    [
      "an unknown top-level field",
      { schemaVersion: 1, resources: [], extra: true },
    ],
    ["a non-array resource list", { schemaVersion: 1, resources: {} }],
    [
      "incomplete metadata",
      {
        schemaVersion: 1,
        metadata: {
          id: "example.asset-package",
          name: "Example Asset Package",
          version: "1.0.0",
        },
        resources: [],
      },
    ],
    [
      "non-text metadata",
      {
        schemaVersion: 1,
        metadata: {
          id: "example.asset-package",
          name: "Example Asset Package",
          version: 1,
          description: "",
        },
        resources: [],
      },
    ],
    [
      "an unsupported resource type",
      {
        schemaVersion: 1,
        resources: [{ resourceType: "unsupported", folderIds: ["folder-1"] }],
      },
    ],
    [
      "duplicate resource types",
      {
        schemaVersion: 1,
        resources: [
          { resourceType: "images", folderIds: ["folder-1"] },
          { resourceType: "images", folderIds: ["folder-2"] },
        ],
      },
    ],
    [
      "an empty folder list",
      {
        schemaVersion: 1,
        resources: [{ resourceType: "images", folderIds: [] }],
      },
    ],
    [
      "a malformed folder id",
      {
        schemaVersion: 1,
        resources: [{ resourceType: "images", folderIds: [""] }],
      },
    ],
    [
      "duplicate folder ids",
      {
        schemaVersion: 1,
        resources: [
          {
            resourceType: "images",
            folderIds: ["folder-1", "folder-1"],
          },
        ],
      },
    ],
    [
      "an unknown resource field",
      {
        schemaVersion: 1,
        resources: [
          {
            resourceType: "images",
            folderIds: ["folder-1"],
            extra: true,
          },
        ],
      },
    ],
  ])("rejects %s without writing it", async (_label, assetPackage) => {
    const initialAssetPackage = {
      schemaVersion: 1,
      resources: [{ resourceType: "videos", folderIds: ["folder-original"] }],
    };
    const harness = createHarness({ assetPackage: initialAssetPackage });

    await expect(
      harness.service.updateCurrentAssetPackage(assetPackage),
    ).rejects.toMatchObject({
      name: "AssetPackageValidationError",
      code: "invalid_asset_package",
    });
    expect(harness.store.app.set).not.toHaveBeenCalled();
    expect(harness.getAssetPackage()).toEqual(initialAssetPackage);
  });

  it("rejects an invalid stored package instead of silently repairing it", async () => {
    const harness = createHarness({
      assetPackage: {
        schemaVersion: 1,
        resources: [
          { resourceType: "images", folderIds: ["folder-1", "folder-1"] },
        ],
      },
    });

    await expect(
      harness.service.getCurrentAssetPackage(),
    ).rejects.toMatchObject({
      name: "AssetPackageValidationError",
      code: "invalid_asset_package",
      path: "assetPackage.resources[0].folderIds[1]",
    });
  });
});
