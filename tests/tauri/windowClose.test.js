import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  calls: [],
  closeRequested: undefined,
  appWindow: undefined,
  flushDesktopErrors: undefined,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocked.appWindow,
}));
vi.mock("../../src/deps/clients/tauri/errorReporting.js", () => ({
  flushDesktopErrors: (...args) => mocked.flushDesktopErrors(...args),
}));

const { QUIT_SAVE_TIMEOUT_MS, setupCloseListener } = await import(
  "../../src/deps/clients/tauri/windowClose.js"
);

const createHarness = ({ confirmQuit = true, saveBeforeSuspend } = {}) => {
  const appService = {
    saveBeforeSuspend: vi.fn(
      saveBeforeSuspend ??
        (async () => {
          mocked.calls.push("save");
        }),
    ),
  };
  const globalUI = {
    showConfirm: vi.fn(async () => {
      mocked.calls.push("confirm");
      return confirmQuit;
    }),
  };
  return { appService, globalUI };
};

// Closing the window asks the app first, like Tauri's close request.
const requestClose = async () => {
  const event = { preventDefault: vi.fn() };
  await mocked.closeRequested(event);
  return event;
};

beforeEach(() => {
  mocked.calls = [];
  mocked.appWindow = {
    onCloseRequested: vi.fn(async (callback) => {
      mocked.closeRequested = callback;
      return () => {};
    }),
    close: vi.fn(async () => {
      mocked.calls.push("close");
    }),
  };
  mocked.flushDesktopErrors = vi.fn(async () => {
    mocked.calls.push("flush errors");
  });
});

afterEach(() => vi.useRealTimers());

describe("desktop window close", () => {
  it("saves the open page after the user confirms and before the window closes", async () => {
    const { appService, globalUI } = createHarness();
    await setupCloseListener({ appService, globalUI });

    const event = await requestClose();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(appService.saveBeforeSuspend).toHaveBeenCalledWith("quit");
    expect(mocked.calls).toEqual(["confirm", "save", "flush errors", "close"]);
  });

  it("saves nothing and keeps the window open when the user cancels", async () => {
    const { appService, globalUI } = createHarness({ confirmQuit: false });
    await setupCloseListener({ appService, globalUI });

    await requestClose();

    expect(appService.saveBeforeSuspend).not.toHaveBeenCalled();
    expect(mocked.appWindow.close).not.toHaveBeenCalled();
  });

  it("does not wait for a save that hangs forever", async () => {
    vi.useFakeTimers();
    const { appService, globalUI } = createHarness({
      saveBeforeSuspend: () => new Promise(() => {}),
    });
    await setupCloseListener({ appService, globalUI });

    const closing = requestClose();
    await vi.advanceTimersByTimeAsync(QUIT_SAVE_TIMEOUT_MS - 1);
    expect(mocked.appWindow.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await closing;

    expect(mocked.appWindow.close).toHaveBeenCalledOnce();
  });

  it("still closes when saving fails", async () => {
    const { appService, globalUI } = createHarness({
      saveBeforeSuspend: async () => {
        throw new Error("Storage is full");
      },
    });
    await setupCloseListener({ appService, globalUI });

    await requestClose();

    expect(mocked.appWindow.close).toHaveBeenCalledOnce();
  });

  it("lets the close it started through without asking again", async () => {
    const { appService, globalUI } = createHarness();
    await setupCloseListener({ appService, globalUI });
    mocked.appWindow.close.mockImplementation(async () => {
      mocked.calls.push("close");
      await mocked.closeRequested({ preventDefault: vi.fn() });
    });

    await requestClose();

    expect(globalUI.showConfirm).toHaveBeenCalledOnce();
    expect(appService.saveBeforeSuspend).toHaveBeenCalledOnce();
  });

  it("ignores another close request while asking or saving, and still saves before closing", async () => {
    let finishSave;
    const { appService, globalUI } = createHarness({
      saveBeforeSuspend: () =>
        new Promise((resolve) => {
          finishSave = () => {
            mocked.calls.push("save");
            resolve();
          };
        }),
    });
    await setupCloseListener({ appService, globalUI });

    const first = requestClose();
    await vi.waitFor(() =>
      expect(appService.saveBeforeSuspend).toHaveBeenCalledOnce(),
    );
    const second = await requestClose();

    // The second request is held back too, without asking again, so the
    // window cannot close under the save.
    expect(second.preventDefault).toHaveBeenCalled();
    expect(globalUI.showConfirm).toHaveBeenCalledOnce();
    expect(mocked.appWindow.close).not.toHaveBeenCalled();

    finishSave();
    await first;
    expect(mocked.calls).toEqual(["confirm", "save", "flush errors", "close"]);
  });

  it("lets its own close through when that request arrives after close() resolved", async () => {
    const { appService, globalUI } = createHarness();
    await setupCloseListener({ appService, globalUI });

    await requestClose();
    expect(mocked.appWindow.close).toHaveBeenCalledOnce();
    const ownClose = await requestClose();

    expect(ownClose.preventDefault).not.toHaveBeenCalled();
    expect(globalUI.showConfirm).toHaveBeenCalledOnce();
  });

  it("asks again after the user cancelled", async () => {
    const { appService, globalUI } = createHarness({ confirmQuit: false });
    await setupCloseListener({ appService, globalUI });

    await requestClose();
    const second = await requestClose();

    expect(second.preventDefault).toHaveBeenCalled();
    expect(globalUI.showConfirm).toHaveBeenCalledTimes(2);
    expect(appService.saveBeforeSuspend).not.toHaveBeenCalled();
  });

  it("asks again when the window could not close", async () => {
    const { appService, globalUI } = createHarness();
    await setupCloseListener({ appService, globalUI });
    mocked.appWindow.close.mockRejectedValueOnce(new Error("IPC failed"));

    await expect(requestClose()).rejects.toThrow("IPC failed");
    const second = await requestClose();

    expect(second.preventDefault).toHaveBeenCalled();
    expect(globalUI.showConfirm).toHaveBeenCalledTimes(2);
  });
});
