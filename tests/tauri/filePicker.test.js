import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.open,
  save: mocks.save,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: mocks.writeFile,
}));

import { createTauriFilePicker } from "../../src/deps/clients/tauri/filePicker.js";

describe("Tauri file picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes Blob content to the path chosen in the save dialog", async () => {
    mocks.save.mockResolvedValue("/exports/Project One - Canvas.png");
    const blob = new Blob(["canvas"], { type: "image/png" });

    const selectedPath = await createTauriFilePicker().saveFilePicker(
      blob,
      "Project One - Canvas.png",
      {
        title: "Save canvas image",
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      },
    );

    expect(selectedPath).toBe("/exports/Project One - Canvas.png");
    expect(mocks.save).toHaveBeenCalledWith({
      title: "Save canvas image",
      filters: [{ name: "PNG Image", extensions: ["png"] }],
      defaultPath: "Project One - Canvas.png",
    });
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.writeFile.mock.calls[0][0]).toBe(
      "/exports/Project One - Canvas.png",
    );
    expect(mocks.writeFile.mock.calls[0][1]).toEqual(
      new TextEncoder().encode("canvas"),
    );
  });

  it("does not write when the save dialog is cancelled", async () => {
    mocks.save.mockResolvedValue(null);

    await expect(
      createTauriFilePicker().saveFilePicker(
        new Blob(["canvas"], { type: "image/png" }),
        "Project One - Canvas.png",
      ),
    ).resolves.toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
