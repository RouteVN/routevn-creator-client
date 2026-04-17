import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  commandApi: {
    getState: vi.fn(),
    deleteImages: vi.fn(),
    deleteSounds: vi.fn(),
    deleteVideos: vi.fn(),
  },
}));

vi.mock("../../src/deps/services/shared/commandApi.js", () => ({
  createCommandApi: vi.fn(() => mocked.commandApi),
}));

import { createProjectCollabCore } from "../../src/deps/services/shared/projectCollabCore.js";

describe("createProjectCollabCore deleteIfUnused", () => {
  beforeEach(() => {
    mocked.commandApi.getState.mockReset();
    mocked.commandApi.deleteImages.mockReset();
    mocked.commandApi.deleteSounds.mockReset();
    mocked.commandApi.deleteVideos.mockReset();
  });

  it("returns deleted false when the delete command fails validation", async () => {
    mocked.commandApi.getState.mockReturnValue({
      scenes: {},
      sections: {},
      lines: {},
      layouts: {},
      controls: {},
    });
    mocked.commandApi.deleteImages.mockResolvedValue({
      valid: false,
      error: {
        message: "cannot delete image",
      },
    });

    const collabCore = createProjectCollabCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: undefined,
      getCurrentRepository: async () => undefined,
      getCachedRepository: () => undefined,
      getRepositoryByProject: async () => undefined,
      getAdapterByProject: () => undefined,
      createSessionForProject: async () => undefined,
      createTransport: () => undefined,
      onEnsureLocalSession: undefined,
      onSessionCleared: undefined,
      onSessionTransportUpdated: undefined,
    });

    const result = await collabCore.deleteImageIfUnused({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts"],
    });

    expect(result).toEqual({
      deleted: false,
      usage: {
        inProps: {},
        isUsed: false,
        count: 0,
      },
      deleteResult: {
        valid: false,
        error: {
          message: "cannot delete image",
        },
      },
    });
  });
});
