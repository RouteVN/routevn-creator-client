import { afterEach, describe, expect, it, vi } from "vitest";
import { filter } from "rxjs";
import Subject from "../../src/deps/subject.js";
import AndroidRouter from "../../src/deps/clients/android/router.js";
import { createAppShellService } from "../../src/deps/services/shared/appShellService.js";
import { createNativeBackHandler } from "../../src/deps/clients/nativeBack.js";

const createOverlays = ({ dialog = false, panel = false } = {}) => ({
  closeTopmostDialog: vi.fn(() => dialog),
  closeTopmostPanel: vi.fn(() => panel),
});

const createHarness = ({
  path = "/project/images",
  canGoBack = false,
  overlays = createOverlays(),
  openProjectsFromProject = true,
} = {}) => {
  const subject = new Subject();
  const appService = {
    canGoBack: vi.fn(() => canGoBack),
    back: vi.fn(async () => true),
    getPath: vi.fn(() => path),
    backToProjects: vi.fn(),
    getAppCopy: vi.fn(() => ({
      errorTitle: "Error",
      failedGoBack: "Could not go back. Please try again.",
    })),
    showToast: vi.fn(),
  };
  const notifyBackState = vi.fn();
  const back = createNativeBackHandler({
    subject,
    appService,
    overlays,
    notifyBackState,
    openProjectsFromProject,
    platformName: "Android",
  });

  return { subject, appService, overlays, notifyBackState, back };
};

// As the preview does: it consumes Back while it is mounted.
const mountPreview = (subject) => {
  const closePreview = vi.fn();
  const subscription = subject
    .pipe(filter(({ action }) => action === "app.nativeBack"))
    .subscribe(({ payload }) => {
      payload.handle();
      closePreview();
    });
  return { closePreview, unmount: () => subscription.unsubscribe() };
};

const expectNoNavigation = (appService) => {
  expect(appService.back).not.toHaveBeenCalled();
  expect(appService.backToProjects).not.toHaveBeenCalled();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("native back", () => {
  it("closes the topmost dialog, popover, or menu before anything else", () => {
    const { subject, appService, overlays, notifyBackState, back } =
      createHarness({
        canGoBack: true,
        overlays: createOverlays({ dialog: true, panel: true }),
      });
    const preview = mountPreview(subject);

    expect(back()).toBe(true);
    expect(overlays.closeTopmostDialog).toHaveBeenCalledTimes(1);
    expect(preview.closePreview).not.toHaveBeenCalled();
    expect(overlays.closeTopmostPanel).not.toHaveBeenCalled();
    expectNoNavigation(appService);
    expect(notifyBackState).toHaveBeenCalledTimes(1);
  });

  it("lets the preview close before sheets and panels below it", () => {
    const { subject, appService, overlays, back } = createHarness({
      canGoBack: true,
      overlays: createOverlays({ panel: true }),
    });
    const preview = mountPreview(subject);

    expect(back()).toBe(true);
    expect(preview.closePreview).toHaveBeenCalledTimes(1);
    expect(overlays.closeTopmostPanel).not.toHaveBeenCalled();
    expectNoNavigation(appService);
  });

  it("closes the topmost sheet or panel when nothing above it is open", () => {
    const { subject, appService, overlays, back } = createHarness({
      canGoBack: true,
      overlays: createOverlays({ panel: true }),
    });
    mountPreview(subject).unmount();

    expect(back()).toBe(true);
    expect(overlays.closeTopmostPanel).toHaveBeenCalledTimes(1);
    expectNoNavigation(appService);
  });

  it("goes back in the route stack when nothing is open", async () => {
    const { appService, notifyBackState, back } = createHarness({
      canGoBack: true,
    });
    let finishBack;
    appService.back.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishBack = resolve;
        }),
    );

    expect(back()).toBe(true);
    // A second press while the first is still saving does not go back twice.
    expect(back()).toBe(true);
    expect(appService.back).toHaveBeenCalledTimes(1);
    expect(appService.backToProjects).not.toHaveBeenCalled();

    finishBack(true);
    await vi.waitFor(() => expect(notifyBackState).toHaveBeenCalledTimes(1));
    expect(back()).toBe(true);
    expect(appService.back).toHaveBeenCalledTimes(2);
  });

  it("shows a localized error when going back fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { appService, notifyBackState, back } = createHarness({
      canGoBack: true,
    });
    appService.back.mockRejectedValue(new Error("Save failed"));

    expect(back()).toBe(true);

    await vi.waitFor(() =>
      expect(appService.showToast).toHaveBeenCalledWith({
        title: "Error",
        message: "Could not go back. Please try again.",
        status: "error",
      }),
    );
    await vi.waitFor(() => expect(notifyBackState).toHaveBeenCalledTimes(1));
  });

  it("opens the Projects list from a project with nothing behind it", () => {
    const { appService, back } = createHarness({ path: "/project" });

    expect(back()).toBe(true);
    expect(appService.backToProjects).toHaveBeenCalledTimes(1);
    expect(appService.back).not.toHaveBeenCalled();
  });

  it("leaves the app from the Projects list with nothing behind it", () => {
    const { appService, notifyBackState, back } = createHarness({
      path: "/projects",
    });

    expect(back()).toBe(false);
    expectNoNavigation(appService);
    expect(notifyBackState).toHaveBeenCalledTimes(1);
  });

  it("only closes overlays on a shell that does not open Projects (iOS)", () => {
    const { appService, overlays, back } = createHarness({
      path: "/project/scenes",
      openProjectsFromProject: false,
      overlays: createOverlays({ dialog: true }),
    });

    expect(back()).toBe(true);
    expect(overlays.closeTopmostDialog).toHaveBeenCalledTimes(1);

    overlays.closeTopmostDialog.mockReturnValue(false);
    expect(back()).toBe(false);
    expectNoNavigation(appService);
  });

  it("sends the same redirect as Back to Projects through the real router and app service", () => {
    const router = new AndroidRouter({ initialPath: "/projects" });
    // Projects opens a project in place of its own route entry.
    router.replace("/project", { p: "project-1" });
    const subject = new Subject();
    const redirects = [];
    subject
      .pipe(filter(({ action }) => action === "redirect"))
      .subscribe(({ payload }) => redirects.push(payload));
    const appService = createAppShellService({
      router,
      subject,
      globalUI: {},
      filePicker: {},
      openUrl: vi.fn(),
      appVersion: "1.0.0",
      platform: "android",
    });
    const back = createNativeBackHandler({
      subject,
      appService,
      overlays: createOverlays(),
      notifyBackState: vi.fn(),
      openProjectsFromProject: true,
      platformName: "Android",
    });

    expect(back()).toBe(true);
    expect(redirects).toEqual([
      expect.objectContaining({
        path: "/projects",
        payload: undefined,
        historyMode: "replace",
        historyState: { preserveProjectsEntryOnProjectOpen: true },
      }),
    ]);
  });
});
