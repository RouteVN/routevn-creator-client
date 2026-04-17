import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectExportService } from "../../src/deps/services/shared/projectExportService.js";

const originalFetch = globalThis.fetch;

describe("projectExportService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("delegates promptDistributionZipPath through the stable file-adapter contract", async () => {
    const promptDistributionZipPath = vi.fn(async () => undefined);
    const service = createProjectExportService({
      fileAdapter: {
        downloadBundle: vi.fn(),
        createDistributionZip: vi.fn(),
        createDistributionZipStreamed: vi.fn(),
        promptDistributionZipPath,
        createDistributionZipStreamedToPath: vi.fn(),
      },
      filePicker: {
        saveFilePicker: vi.fn(),
      },
      getCurrentReference: vi.fn(),
      getFileContent: vi.fn(),
    });

    await expect(
      service.promptDistributionZipPath("project-one"),
    ).resolves.toBeUndefined();
    expect(promptDistributionZipPath).toHaveBeenCalledWith({
      zipName: "project-one",
      options: {},
      filePicker: {
        saveFilePicker: expect.any(Function),
      },
    });
  });

  it("delegates createDistributionZipStreamedToPath through the stable file-adapter contract", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
    }));
    const createDistributionZipStreamedToPath = vi.fn(
      async ({ outputPath }) => outputPath,
    );
    const getCurrentReference = vi.fn(() => ({
      projectPath: "/tmp/project-1",
    }));
    const getFileContent = vi.fn();
    const service = createProjectExportService({
      fileAdapter: {
        downloadBundle: vi.fn(),
        createDistributionZip: vi.fn(),
        createDistributionZipStreamed: vi.fn(),
        promptDistributionZipPath: vi.fn(),
        createDistributionZipStreamedToPath,
      },
      filePicker: {
        saveFilePicker: vi.fn(),
      },
      getCurrentReference,
      getFileContent,
    });

    await expect(
      service.createDistributionZipStreamedToPath(
        { project: { namespace: "project-one" } },
        ["file-1"],
        "/tmp/export.zip",
      ),
    ).resolves.toBe("/tmp/export.zip");
    expect(createDistributionZipStreamedToPath).toHaveBeenCalledWith({
      projectData: {
        project: {
          namespace: "project-one",
        },
      },
      fileIds: ["file-1"],
      outputPath: "/tmp/export.zip",
      staticFiles: {
        indexHtml: undefined,
        mainJs: undefined,
      },
      getCurrentReference,
      getFileContent,
    });
  });
});
