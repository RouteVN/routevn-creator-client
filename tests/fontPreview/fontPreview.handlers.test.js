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
});
