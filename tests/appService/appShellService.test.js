import { describe, expect, it, vi } from "vitest";
import { createAppShellService } from "../../src/deps/services/shared/appShellService.js";

const createDeps = () => {
  return {
    router: {
      getPayload: vi.fn(() => ({ p: "project-1" })),
      getPathName: vi.fn(() => "/projects"),
      redirect: vi.fn(),
      replace: vi.fn(),
      setPayload: vi.fn(),
      back: vi.fn(),
    },
    subject: {
      dispatch: vi.fn(),
    },
    globalUI: {
      showConfirm: vi.fn(() => Promise.resolve(true)),
      showAlert: vi.fn(() => Promise.resolve()),
      showToast: vi.fn(() => Promise.resolve()),
      showFormDialog: vi.fn(),
      showComponentDialog: vi.fn(),
      closeAll: vi.fn(),
      showDropdownMenu: vi.fn(),
    },
    filePicker: {
      openFolderPicker: vi.fn(),
      openFilePicker: vi.fn(),
      saveFilePicker: vi.fn(),
    },
    openUrl: vi.fn(),
    appVersion: "1.0.0",
    platform: "web",
    updater: {},
    audioService: {},
  };
};

describe("appShellService", () => {
  it("forwards alert dialogs through showAlert", async () => {
    const deps = createDeps();
    const service = createAppShellService(deps);
    const options = {
      message: "Upload failed",
      title: "Error",
      size: "sm",
    };

    await service.showAlert(options);

    expect(deps.globalUI.showAlert).toHaveBeenCalledWith(options);
  });

  it("forwards toasts through showToast", async () => {
    const deps = createDeps();
    const service = createAppShellService(deps);
    const options = {
      message: "Layout preview saved.",
      status: "success",
    };

    await service.showToast(options);

    expect(deps.globalUI.showToast).toHaveBeenCalledWith(options);
  });

  it("forwards confirm dialogs through showDialog", async () => {
    const deps = createDeps();
    const service = createAppShellService(deps);
    const options = {
      title: "Logout",
      message: "Are you sure?",
      confirmText: "Logout",
      cancelText: "Cancel",
    };

    const result = await service.showDialog(options);

    expect(result).toBe(true);
    expect(deps.globalUI.showConfirm).toHaveBeenCalledWith(options);
  });
});
