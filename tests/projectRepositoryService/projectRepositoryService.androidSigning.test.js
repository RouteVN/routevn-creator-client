import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";

const KEY_ONE = "a".repeat(64);
const KEY_TWO = "b".repeat(64);

const createService = (initialValues = {}) => {
  const values = new Map(Object.entries(structuredClone(initialValues)));
  values.set("creatorVersion", 1);
  const store = {
    app: {
      get: vi.fn(async (key) => structuredClone(values.get(key))),
      set: vi.fn(async (key, value) => {
        values.set(key, structuredClone(value));
      }),
    },
  };
  const service = createProjectRepositoryService({
    router: { getPayload: () => ({ p: "project-1" }) },
    db: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    creatorVersion: 1,
    storageAdapter: {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: "/projects/project-one",
        cacheKey: "/projects/project-one",
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    },
    collabAdapter: {
      beforeCreateRepository: async () => undefined,
      afterCreateRepository: async () => undefined,
    },
  });
  return { service, values };
};

const keyOne = {
  certificateSha256: KEY_ONE,
  certificate: "Y2VydGlmaWNhdGUgb25l",
  privateKey: "a2V5IG9uZQ==",
  origin: "created",
  addedAt: 1,
};

describe("projectRepositoryService androidSigning", () => {
  it("stores the project's keys in its app store", async () => {
    const { service, values } = createService();
    expect(
      await service.getAndroidSigningByProjectId("project-1"),
    ).toBeUndefined();

    const signing = { currentKey: KEY_ONE, keys: [keyOne] };
    await service.setAndroidSigningByProjectId("project-1", signing);
    expect(values.get("androidSigning")).toEqual(signing);
    expect(await service.getAndroidSigningByProjectId("project-1")).toEqual(
      signing,
    );
  });

  it("returns the stored record as written, with keys Creator cannot read", async () => {
    const stored = {
      currentKey: KEY_TWO,
      keys: [
        keyOne,
        { ...keyOne, certificateSha256: KEY_TWO, privateKey: "not base64!" },
        {
          ...keyOne,
          certificateSha256: KEY_TWO,
          label: "From a later Creator",
        },
      ],
    };
    const { service } = createService({ androidSigning: stored });
    expect(await service.getAndroidSigningByProjectId("project-1")).toEqual(
      stored,
    );
  });

  it("keeps the keys when Platform Details are edited", async () => {
    const { service, values } = createService({
      androidSigning: { currentKey: KEY_ONE, keys: [keyOne] },
      "platformDetails.android": {
        applicationName: "Project One",
        applicationIdentifier: "com.example.project_one",
        iconFileId: "icon-1",
        iconBackgroundColor: "#FFFFFF",
        splashBackgroundColor: "#000000",
      },
    });
    await service.updateCurrentPlatformDetails("android", {
      applicationIdentifier: "com.example.project_two",
    });
    expect(values.get("platformDetails.android")).not.toHaveProperty("keys");
    expect(await service.getAndroidSigningByProjectId("project-1")).toEqual({
      currentKey: KEY_ONE,
      keys: [keyOne],
    });
  });
});
