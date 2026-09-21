import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ copy: {} }));
vi.mock("../../src/deps/services/shared/appServiceCore.js", () => ({
  createAppServiceCore: ({ platformAdapter, filePicker }) => ({
    getAppCopy: () => state.copy,
    pickFiles: (options = {}) =>
      platformAdapter.selectFiles({
        options,
        multiple: options.multiple ?? false,
        filePicker,
      }),
  }),
}));
import { createAppService } from "../../src/deps/services/android/appService.js";

describe("Android media source dialog", () => {
  let dialog;
  let filePicker;
  let service;
  beforeEach(() => {
    state.copy = {};
    dialog = vi.fn();
    filePicker = { openFilePicker: vi.fn().mockResolvedValue([]) };
    service = createAppService({
      globalUI: { showFormDialog: dialog },
      filePicker,
      appActivity: {},
    });
  });
  it.each(["gallery", "files"])(
    "opens %s from the JS dialog with vertical buttons",
    async (source) => {
      dialog.mockResolvedValue({ actionId: source });
      await service.pickFiles({
        accept: "image/png,.jpg,.webp",
        multiple: true,
      });
      expect(dialog).toHaveBeenCalledWith({
        size: "sm",
        form: {
          title: "Choose source",
          fields: [],
          actions: {
            layout: "vertical",
            buttons: [
              { id: "gallery", label: "Gallery", variant: "se" },
              { id: "files", label: "File picker", variant: "se" },
            ],
          },
        },
      });
      expect(filePicker.openFilePicker).toHaveBeenCalledWith({
        accept: "image/png,.jpg,.webp",
        multiple: true,
        source,
      });
    },
  );
  it.each([false, true])(
    "dismisses without launching either picker, multiple=%s",
    async (multiple) => {
      dialog.mockResolvedValue(null);
      expect(await service.pickFiles({ accept: "image/*", multiple })).toEqual(
        multiple ? [] : undefined,
      );
      expect(filePicker.openFilePicker).not.toHaveBeenCalled();
    },
  );
  it.each(["", "audio/mpeg", ".png,.json", "*/*", ".png,.unknown"])(
    "keeps non-media/mixed requests in Files: %s",
    async (accept) => {
      await service.pickFiles({ accept });
      expect(dialog).not.toHaveBeenCalled();
      expect(filePicker.openFilePicker).toHaveBeenCalledWith({
        accept,
        multiple: false,
        source: "files",
      });
    },
  );
  it("uses the current app locale and supports extension filters and video", async () => {
    state.copy = {
      filePickerSourceTitle: "选择来源",
      filePickerGallery: "相册",
      filePickerFiles: "文件选择器",
    };
    dialog.mockResolvedValue({ actionId: "gallery" });
    await service.pickFiles({ filters: [{ extensions: ["mp4"] }] });
    expect(dialog.mock.calls[0][0].form).toMatchObject({
      title: "选择来源",
      actions: { buttons: [{ label: "相册" }, { label: "文件选择器" }] },
    });
    expect(filePicker.openFilePicker).toHaveBeenCalledWith({
      filters: [{ extensions: ["mp4"] }],
      multiple: false,
      source: "gallery",
    });
  });
});
