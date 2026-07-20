import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createSquareCroppedImageFile: vi.fn(),
}));

vi.mock("../../src/deps/clients/web/fileProcessors.js", () => ({
  createSquareCroppedImageFile: mocked.createSquareCroppedImageFile,
}));

import { handleGetCroppedFile } from "../../src/components/squareImageCropper/squareImageCropper.handlers.js";

describe("squareImageCropper handlers", () => {
  beforeEach(() => {
    mocked.createSquareCroppedImageFile.mockReset();
  });

  it("uses an explicitly requested output size", async () => {
    const file = new Blob(["image"], { type: "image/png" });
    const croppedFile = new Blob(["cropped"], { type: "image/png" });
    mocked.createSquareCroppedImageFile.mockResolvedValue(croppedFile);

    await expect(
      handleGetCroppedFile({
        props: { file, outputSize: 512 },
        store: {
          selectCropSelection: () => ({
            sourceX: 10,
            sourceY: 20,
            sourceSize: 300,
            outputSize: 256,
          }),
        },
      }),
    ).resolves.toBe(croppedFile);

    expect(mocked.createSquareCroppedImageFile).toHaveBeenCalledWith({
      file,
      sourceX: 10,
      sourceY: 20,
      sourceSize: 300,
      outputSize: 512,
    });
  });

  it("keeps the cropper-selected output size by default", async () => {
    const file = new Blob(["image"], { type: "image/png" });
    mocked.createSquareCroppedImageFile.mockResolvedValue(file);

    await handleGetCroppedFile({
      props: { file },
      store: {
        selectCropSelection: () => ({
          sourceX: 0,
          sourceY: 0,
          sourceSize: 256,
          outputSize: 256,
        }),
      },
    });

    expect(mocked.createSquareCroppedImageFile).toHaveBeenCalledWith(
      expect.objectContaining({ outputSize: 256 }),
    );
  });
});
