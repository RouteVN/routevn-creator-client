import { describe, expect, it, vi } from "vitest";
import { handleAfterMount } from "../../src/components/fontPreview/fontPreview.handlers.js";

describe("fontPreview.handlers", () => {
  it("loads preview fonts with their aligned weight descriptors", async () => {
    const loadFontFile = vi.fn(async () => ({ success: true }));
    const deps = {
      props: {
        fileIds: ["font-400", "font-variable"],
        fontWeightDescriptors: ["400", "100 900"],
      },
      projectService: { loadFontFile },
      store: {
        startFontLoad: vi.fn(),
        finishFontLoad: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleAfterMount(deps);

    expect(loadFontFile).toHaveBeenNthCalledWith(1, {
      fontName: "font-400",
      fileId: "font-400",
      fontWeightDescriptor: "400",
    });
    expect(loadFontFile).toHaveBeenNthCalledWith(2, {
      fontName: "font-variable",
      fileId: "font-variable",
      fontWeightDescriptor: "100 900",
    });
  });

  it("loads every font file and names the ones that failed", async () => {
    const loadFontFile = vi.fn(async ({ fileId }) =>
      fileId === "font-missing"
        ? { success: false, error: "File font-missing is missing." }
        : { success: true },
    );
    const dispatchEvent = vi.fn();
    const deps = {
      props: {
        fileIds: ["font-400", "font-missing"],
        fontWeightDescriptors: ["400", ""],
      },
      projectService: { loadFontFile },
      store: {
        startFontLoad: vi.fn(),
        finishFontLoad: vi.fn(),
      },
      render: vi.fn(),
      dispatchEvent,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await handleAfterMount(deps);
    } finally {
      warn.mockRestore();
    }

    expect(loadFontFile).toHaveBeenCalledTimes(2);
    expect(deps.store.finishFontLoad).toHaveBeenCalledWith({
      key: expect.any(String),
      status: "error",
    });
    const [event] = dispatchEvent.mock.calls[0];
    expect(event.type).toBe("font-load-error");
    expect(event.detail.failures).toEqual([
      { fileId: "font-missing", error: expect.any(Error) },
    ]);
    expect(event.detail.failures[0].error.message).toBe(
      "File font-missing is missing.",
    );
  });
});
