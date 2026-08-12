import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleBeforeMount,
  handleVisible,
  handleVideoCanPlay,
} from "../../src/components/resource-import-preview-media/resource-import-preview-media.handlers.js";

const createVideo = () => ({
  defaultMuted: false,
  muted: false,
  play: vi.fn(() => Promise.resolve()),
});

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
    const store = {
      selectOperationId: vi.fn(() => "operation-1"),
      selectSrc: vi.fn(() => "blob:preview"),
      cancelLoading: vi.fn(),
    };
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const cleanup = handleBeforeMount({ projectService, store });
    cleanup();

    expect(projectService.cancelResourceImport).toHaveBeenCalledWith({
      operationId: "operation-1",
    });
    expect(store.cancelLoading).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
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

  it("retries muted playback when the video can play", () => {
    const video = createVideo();
    handleVideoCanPlay({}, { _event: { currentTarget: video } });

    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });
});
