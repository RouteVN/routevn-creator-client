import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleBeforeMount,
  handleVisible,
} from "../../src/components/resource-import-preview-media/resource-import-preview-media.handlers.js";

describe("resource-import-preview-media.handlers", () => {
  it("loads preview bytes through the project service", async () => {
    const store = {
      selectLoadRequested: vi.fn(() => false),
      selectOperationId: vi.fn(),
      selectSrc: vi.fn(),
      startLoading: vi.fn(({ operationId }) => {
        store.selectOperationId.mockReturnValue(operationId);
      }),
      setPreview: vi.fn(),
    };
    const projectService = {
      loadResourceImportPreview: vi.fn(async () => ({
        valid: true,
        preview: {
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "video/webm",
          kind: "video",
        },
      })),
    };
    const render = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");

    await handleAfterMount({
      projectService,
      props: { planId: "plan-1", sourceFileId: "file-preview" },
      store,
      render,
    });

    expect(projectService.loadResourceImportPreview).toHaveBeenCalledWith({
      planId: "plan-1",
      sourceFileId: "file-preview",
      operationId: expect.any(String),
    });
    expect(store.setPreview).toHaveBeenCalledWith({
      src: "blob:preview",
      kind: "video",
      operationId: expect.any(String),
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("cancels loading and revokes its object URL when unmounted", () => {
    const projectService = { cancelResourceImport: vi.fn() };
    const audioService = { stop: vi.fn() };
    const store = {
      selectOperationId: vi.fn(() => "operation-1"),
      selectSrc: vi.fn(() => "blob:preview"),
      selectKind: vi.fn(() => "image"),
      cancelLoading: vi.fn(),
    };
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const cleanup = handleBeforeMount({ projectService, audioService, store });
    cleanup();

    expect(projectService.cancelResourceImport).toHaveBeenCalledWith({
      operationId: "operation-1",
    });
    expect(store.cancelLoading).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(audioService.stop).not.toHaveBeenCalled();
  });

  it("stops a sound when its preview is unmounted", () => {
    const audioService = { stop: vi.fn() };
    const store = {
      selectOperationId: vi.fn(),
      selectSrc: vi.fn(() => "blob:sound"),
      selectKind: vi.fn(() => "audio"),
      cancelLoading: vi.fn(),
    };
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const cleanup = handleBeforeMount({
      projectService: { cancelResourceImport: vi.fn() },
      audioService,
      store,
    });
    cleanup();

    expect(audioService.stop).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:sound");
  });

  it("waits until a lazy preview is visible before loading it", async () => {
    const store = {
      selectLoadRequested: vi.fn(() => false),
      selectOperationId: vi.fn(),
      selectSrc: vi.fn(),
      startLoading: vi.fn(({ operationId }) => {
        store.selectLoadRequested.mockReturnValue(true);
        store.selectOperationId.mockReturnValue(operationId);
      }),
      setPreview: vi.fn(),
    };
    const projectService = {
      loadResourceImportPreview: vi.fn(async () => ({
        valid: true,
        preview: {
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "video/webm",
          kind: "video",
        },
      })),
    };
    const deps = {
      projectService,
      props: {
        lazy: true,
        planId: "plan-1",
        sourceFileId: "file-thumbnail",
      },
      store,
      render: vi.fn(),
    };

    await handleAfterMount(deps);
    expect(projectService.loadResourceImportPreview).not.toHaveBeenCalled();

    await handleVisible(deps);
    expect(projectService.loadResourceImportPreview).toHaveBeenCalledTimes(1);
  });
});
