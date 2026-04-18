import { describe, expect, it, vi } from "vitest";
import { createProjectAssetService } from "../../src/deps/services/shared/projectAssetService.js";

describe("projectAssetService", () => {
  it("delegates getFileByProjectId through the stable file-adapter contract", async () => {
    const fileBlob = new Blob(["icon"], { type: "image/png" });
    const getStoreByProject = vi.fn();
    const getFileByProjectId = vi.fn(async () => fileBlob);
    const service = createProjectAssetService({
      idGenerator: () => "generated-id",
      fileAdapter: {
        storeFile: vi.fn(),
        getFileContent: vi.fn(),
        getFileByProjectId,
      },
      getCurrentStore: vi.fn(),
      getCurrentReference: vi.fn(),
      getStoreByProject,
    });

    await expect(
      service.getFileByProjectId("project-1", "file-1"),
    ).resolves.toBe(fileBlob);
    expect(getFileByProjectId).toHaveBeenCalledWith({
      projectId: "project-1",
      fileId: "file-1",
      getStoreByProject,
    });
  });
});
