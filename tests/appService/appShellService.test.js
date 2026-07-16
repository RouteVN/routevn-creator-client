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
  it("awaits registered work before navigation continues", async () => {
    const deps = createDeps();
    const service = createAppShellService(deps);
    const calls = [];
    let finishPreparation;
    const unregister = service.registerBeforeNavigation(async ({ path }) => {
      calls.push(`start:${path}`);
      await new Promise((resolve) => {
        finishPreparation = resolve;
      });
      calls.push(`end:${path}`);
    });

    const preparation = service.prepareNavigation({ path: "/project/scenes" });
    await Promise.resolve();

    expect(calls).toEqual(["start:/project/scenes"]);
    finishPreparation();
    await preparation;
    expect(calls).toEqual(["start:/project/scenes", "end:/project/scenes"]);

    unregister();
    await service.prepareNavigation({ path: "/projects" });
    expect(calls).toHaveLength(2);
  });

  it("prepares the previous route before changing the router stack", async () => {
    const deps = createDeps();
    const target = {
      path: "/project/scene-editor",
      payload: { p: "project-1", s: "scene-1" },
      historyState: {},
    };
    deps.router.getBackTarget = vi.fn(() => target);
    deps.router.back.mockImplementation(() => {
      expect(preparationFinished).toBe(true);
      return true;
    });
    const service = createAppShellService(deps);
    let preparationFinished = false;
    service.registerBeforeNavigation(async (payload) => {
      expect(payload).toEqual(target);
      await Promise.resolve();
      preparationFinished = true;
    });

    await expect(service.back()).resolves.toBe(true);

    expect(deps.router.getBackTarget).toHaveBeenCalledOnce();
    expect(deps.router.back).toHaveBeenCalledOnce();
  });

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

  it("forwards payload update options to the router", () => {
    const deps = createDeps();
    const service = createAppShellService(deps);
    const payload = {
      p: "project-1",
      sectionId: "section-1",
      lineId: "line-1",
    };

    service.setPayload(payload, { throttleMs: 250 });

    expect(deps.router.setPayload).toHaveBeenCalledWith(payload, {
      throttleMs: 250,
    });
  });

  it("blurs the active element and asks the virtual keyboard to hide", () => {
    const deps = createDeps();
    const service = createAppShellService(deps);
    const activeElement = {
      blur: vi.fn(),
    };
    const hideKeyboard = vi.fn();
    const root = {
      activeElement,
      defaultView: {
        navigator: {
          virtualKeyboard: {
            hide: hideKeyboard,
          },
        },
      },
    };

    service.blurActiveElement(root);

    expect(activeElement.blur).toHaveBeenCalled();
    expect(hideKeyboard).toHaveBeenCalled();
  });

  it("shows a toast when opening an external URL fails", async () => {
    const deps = createDeps();
    deps.openUrl.mockRejectedValue(new Error("blocked"));
    const service = createAppShellService(deps);

    await service.openUrl("https://routevn.com/en/creator/docs/test");

    expect(deps.openUrl).toHaveBeenCalledWith(
      "https://routevn.com/en/creator/docs/test",
    );
    expect(deps.globalUI.showToast).toHaveBeenCalledWith({
      title: "Error",
      message: "Failed to open link.",
      status: "error",
    });
  });
});
