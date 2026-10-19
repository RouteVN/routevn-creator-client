import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileSelectionService } from "../../src/deps/services/shared/fileSelectionService.js";
import { formatI18nCopy } from "../../src/internal/ui/i18nCopy.js";
import { EN_I18N, FR_I18N, JA_I18N } from "../support/i18n.js";

const IMAGE_SIZES = {
  "icon.png": { width: 512, height: 512 },
  "small.png": { width: 300, height: 200 },
  "wide.png": { width: 600, height: 512 },
};

// Loads the size listed for the object URL, which is the file name here, and
// fails for any other file, as a browser does for a file it cannot decode.
class FakeImage {
  set src(url) {
    const size = IMAGE_SIZES[url];
    queueMicrotask(() => {
      if (!size) {
        this.onerror();
        return;
      }
      this.naturalWidth = size.width;
      this.naturalHeight = size.height;
      this.onload();
    });
  }
}

const MIN_SIZE_VALIDATIONS = [
  { type: "image-min-size", minWidth: 512, minHeight: 512 },
];

const pickFile = async ({ name, validations, copy = EN_I18N.appPage }) => {
  const globalUI = { showAlert: vi.fn() };
  const service = createFileSelectionService({
    globalUI,
    filePicker: {},
    projectService: {},
    platformAdapter: { selectFiles: async () => ({ name }) },
    getAppCopy: () => copy,
  });
  const file = await service.pickFiles({ validations });
  return { file, globalUI };
};

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(URL, "createObjectURL").mockImplementation((file) => file.name);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fileSelectionService.pickFiles validations", () => {
  it("returns an image that passes its validations", async () => {
    const { file, globalUI } = await pickFile({
      name: "icon.png",
      validations: MIN_SIZE_VALIDATIONS,
    });

    expect(file).toEqual({ name: "icon.png" });
    expect(globalUI.showAlert).not.toHaveBeenCalled();
  });

  it("names the minimum and the current size of an image that is too small", async () => {
    const { file, globalUI } = await pickFile({
      name: "small.png",
      validations: MIN_SIZE_VALIDATIONS,
    });

    expect(file).toBeNull();
    expect(globalUI.showAlert).toHaveBeenCalledWith({
      message:
        "Image size must be at least 512 × 512 pixels. Current size: 300 × 200.",
      title: "Error",
    });
  });

  it("words a rejected image in the app language", async () => {
    const copy = FR_I18N.appPage;
    const { globalUI } = await pickFile({
      name: "small.png",
      validations: MIN_SIZE_VALIDATIONS,
      copy,
    });

    expect(globalUI.showAlert).toHaveBeenCalledWith({
      message: formatI18nCopy(copy.filePickerImageTooSmall, {
        minWidth: 512,
        minHeight: 512,
        width: 300,
        height: 200,
      }),
      title: copy.errorTitle,
    });
    expect(copy.filePickerImageTooSmall).not.toBe(
      EN_I18N.appPage.filePickerImageTooSmall,
    );
  });

  it("explains square and unreadable image failures", async () => {
    const square = await pickFile({
      name: "wide.png",
      validations: [{ type: "square" }],
    });
    const unreadable = await pickFile({
      name: "broken.png",
      validations: MIN_SIZE_VALIDATIONS,
      copy: JA_I18N.appPage,
    });

    expect(square.globalUI.showAlert).toHaveBeenCalledWith({
      message: "Image must be square. Current size: 600 × 512.",
      title: "Error",
    });
    expect(unreadable.globalUI.showAlert).toHaveBeenCalledWith({
      message: JA_I18N.appPage.filePickerImageUnreadable,
      title: JA_I18N.appPage.errorTitle,
    });
  });
});
