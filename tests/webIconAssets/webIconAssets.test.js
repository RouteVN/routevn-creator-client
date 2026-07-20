import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createSquareCroppedImageFile: vi.fn(),
}));

vi.mock("../../src/deps/clients/web/fileProcessors.js", () => ({
  createSquareCroppedImageFile: mocked.createSquareCroppedImageFile,
}));

import { createWebIconAssets } from "../../src/deps/clients/web/webIconAssets.js";

describe("Web icon assets", () => {
  beforeEach(() => {
    mocked.createSquareCroppedImageFile.mockReset();
    mocked.createSquareCroppedImageFile.mockImplementation(
      async ({ outputSize }) =>
        new Blob([Uint8Array.from([outputSize === 192 ? 192 : 255])], {
          type: "image/png",
        }),
    );
  });

  it("creates each requested PNG size from one project icon", async () => {
    const variants = [
      { fileName: "app-icon-192.png", size: 192 },
      { fileName: "app-icon-512.png", size: 512 },
    ];

    await expect(
      createWebIconAssets({
        sourceBytes: Uint8Array.from([1, 2, 3]),
        variants,
      }),
    ).resolves.toEqual([
      {
        fileName: "app-icon-192.png",
        bytes: Uint8Array.from([192]),
      },
      {
        fileName: "app-icon-512.png",
        bytes: Uint8Array.from([255]),
      },
    ]);

    expect(mocked.createSquareCroppedImageFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ outputSize: 192 }),
    );
    expect(mocked.createSquareCroppedImageFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ outputSize: 512 }),
    );
  });
});
