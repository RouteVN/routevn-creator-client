import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppShellService } from "../../src/deps/services/shared/appShellService.js";

const createService = () => {
  const dialog = { close: vi.fn() };
  const globalUI = { showProgressDialog: vi.fn(() => dialog) };
  const service = createAppShellService({
    router: { getPayload: () => ({}) },
    subject: { dispatch: vi.fn() },
    globalUI,
  });
  return { service, globalUI, dialog };
};

// A before-navigation save that finishes when `finish` is called.
const registerSlowSave = (service) => {
  let finish;
  const waiting = new Promise((resolve) => {
    finish = resolve;
  });
  service.registerBeforeNavigation(() => waiting);
  return finish;
};

describe("leaving a page while its saves finish", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says so once the wait is noticeable, and closes the message when it ends", async () => {
    const { service, globalUI, dialog } = createService();
    const finishSave = registerSlowSave(service);

    const leaving = service.prepareNavigation({ path: "/projects" });
    await vi.advanceTimersByTimeAsync(299);
    expect(globalUI.showProgressDialog).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(globalUI.showProgressDialog).toHaveBeenCalledExactlyOnceWith({
      title: "Saving your changes…",
      message: "Please wait while your changes are saved.",
      progress: {},
    });
    expect(dialog.close).not.toHaveBeenCalled();

    finishSave();
    await leaving;
    expect(dialog.close).toHaveBeenCalledOnce();
  });

  it("uses the app's language", async () => {
    const { service, globalUI } = createService();
    service.setAppCopyProvider(() => ({
      savingChangesTitle: "Guardando tus cambios…",
      savingChangesMessage: "Espera mientras se guardan tus cambios.",
    }));
    const finishSave = registerSlowSave(service);

    const leaving = service.prepareNavigation({ path: "/projects" });
    await vi.advanceTimersByTimeAsync(300);
    expect(globalUI.showProgressDialog).toHaveBeenCalledExactlyOnceWith({
      title: "Guardando tus cambios…",
      message: "Espera mientras se guardan tus cambios.",
      progress: {},
    });

    finishSave();
    await leaving;
  });

  it("shows nothing when the saves finish quickly", async () => {
    const { service, globalUI } = createService();
    const finishSave = registerSlowSave(service);

    const leaving = service.prepareNavigation({ path: "/projects" });
    await vi.advanceTimersByTimeAsync(100);
    finishSave();
    await leaving;
    await vi.advanceTimersByTimeAsync(1000);

    expect(globalUI.showProgressDialog).not.toHaveBeenCalled();
  });

  it("shows nothing when the app goes to the background or quits, which has no destination", async () => {
    const { service, globalUI } = createService();
    const finishSave = registerSlowSave(service);

    const saving = service.prepareNavigation({ reason: "background" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(globalUI.showProgressDialog).not.toHaveBeenCalled();

    finishSave();
    await saving;
  });

  it("closes the message and passes the failure on when a save throws", async () => {
    const { service, dialog } = createService();
    let fail;
    service.registerBeforeNavigation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );

    const leaving = service.prepareNavigation({ path: "/projects" });
    const outcome = expect(leaving).rejects.toThrow("save failed");
    await vi.advanceTimersByTimeAsync(500);
    fail(new Error("save failed"));
    await outcome;

    expect(dialog.close).toHaveBeenCalledOnce();
  });

  it("works where no dialog can be shown", async () => {
    const service = createAppShellService({
      router: { getPayload: () => ({}) },
      subject: { dispatch: vi.fn() },
    });
    const finishSave = registerSlowSave(service);

    const leaving = service.prepareNavigation({ path: "/projects" });
    await vi.advanceTimersByTimeAsync(1000);
    finishSave();

    await expect(leaving).resolves.toBeUndefined();
  });
});
