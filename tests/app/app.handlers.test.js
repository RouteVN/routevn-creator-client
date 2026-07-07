import { describe, expect, it, vi } from "vitest";
import { maybePromptLinuxAppImageDesktopIntegration } from "../../src/pages/app/app.handlers.js";

const createDeps = ({
  distribution = "direct",
  status = {
    available: true,
    integrated: false,
    appimagePath: "/home/user/Downloads/routevn-creator_1.7.2_amd64.AppImage",
    installedAppimagePath: "/home/user/Applications/RouteVN-Creator.AppImage",
  },
  installStatus = {
    available: true,
    integrated: true,
    appimagePath: "/home/user/Downloads/routevn-creator_1.7.2_amd64.AppImage",
    installedAppimagePath: "/home/user/Applications/RouteVN-Creator.AppImage",
  },
  shouldInstall = true,
  restartLinuxAppImageFromDesktopIntegration = vi.fn(async () => {}),
} = {}) => {
  const appService = {
    getDistribution: vi.fn(() => distribution),
    getLinuxAppImageDesktopIntegrationStatus: vi.fn(async () => status),
    installLinuxAppImageDesktopIntegration: vi.fn(async () => installStatus),
    showAlert: vi.fn(async () => {}),
    showDialog: vi.fn(async () => shouldInstall),
    showToast: vi.fn(),
    restartLinuxAppImageFromDesktopIntegration,
  };

  return {
    appService,
    i18n: {
      appPage: {
        errorTitle: "Error",
        linuxDesktopIntegrationCancel: "Not Now",
        linuxDesktopIntegrationConfirm: "Add to Applications",
        linuxDesktopIntegrationFailed:
          "Could not add RouteVN Creator to Applications: {message}",
        linuxDesktopIntegrationMessage: "Install launcher?",
        linuxDesktopIntegrationRestartFailed:
          "Installed, but restart failed: {message}",
        linuxDesktopIntegrationTitle: "Add app?",
      },
    },
  };
};

describe("app Linux AppImage desktop integration", () => {
  it("prompts and installs desktop integration for direct AppImage builds", async () => {
    const deps = createDeps();

    const result = await maybePromptLinuxAppImageDesktopIntegration(deps);

    expect(deps.appService.showDialog).toHaveBeenCalledWith({
      title: "Add app?",
      message: "Install launcher?",
      confirmText: "Add to Applications",
      cancelText: "Not Now",
    });
    expect(
      deps.appService.installLinuxAppImageDesktopIntegration,
    ).toHaveBeenCalled();
    expect(
      deps.appService.restartLinuxAppImageFromDesktopIntegration,
    ).toHaveBeenCalled();
    expect(deps.appService.showToast).not.toHaveBeenCalled();
    expect(result).toEqual({ skipAutomaticUpdateChecks: true });
  });

  it("does not persist cancellation when the user chooses not now", async () => {
    const deps = createDeps({ shouldInstall: false });

    const result = await maybePromptLinuxAppImageDesktopIntegration(deps);

    expect(deps.appService.showDialog).toHaveBeenCalled();
    expect(
      deps.appService.installLinuxAppImageDesktopIntegration,
    ).not.toHaveBeenCalled();
    expect(
      deps.appService.restartLinuxAppImageFromDesktopIntegration,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ skipAutomaticUpdateChecks: false });
  });

  it("skips automatic update checks when restart fails after install", async () => {
    const deps = createDeps({
      restartLinuxAppImageFromDesktopIntegration: vi.fn(async () => {
        throw new Error("spawn failed");
      }),
    });

    const result = await maybePromptLinuxAppImageDesktopIntegration(deps);

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message: "Installed, but restart failed: spawn failed",
      status: "error",
    });
    expect(result).toEqual({ skipAutomaticUpdateChecks: true });
  });

  it("shows an alert when install fails", async () => {
    const deps = createDeps({
      installStatus: undefined,
    });
    deps.appService.installLinuxAppImageDesktopIntegration = vi.fn(async () => {
      throw new Error("copy failed");
    });

    const result = await maybePromptLinuxAppImageDesktopIntegration(deps);

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message: "Could not add RouteVN Creator to Applications: copy failed",
      status: "error",
    });
    expect(
      deps.appService.restartLinuxAppImageFromDesktopIntegration,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ skipAutomaticUpdateChecks: false });
  });

  it("does not prompt for Steam builds", async () => {
    const deps = createDeps({ distribution: "steam" });

    const result = await maybePromptLinuxAppImageDesktopIntegration(deps);

    expect(
      deps.appService.getLinuxAppImageDesktopIntegrationStatus,
    ).not.toHaveBeenCalled();
    expect(deps.appService.showDialog).not.toHaveBeenCalled();
    expect(result).toEqual({ skipAutomaticUpdateChecks: false });
  });

  it("does not prompt without restart support", async () => {
    const deps = createDeps();
    deps.appService.restartLinuxAppImageFromDesktopIntegration = undefined;

    const result = await maybePromptLinuxAppImageDesktopIntegration(deps);

    expect(
      deps.appService.getLinuxAppImageDesktopIntegrationStatus,
    ).not.toHaveBeenCalled();
    expect(deps.appService.showDialog).not.toHaveBeenCalled();
    expect(result).toEqual({ skipAutomaticUpdateChecks: false });
  });

  it("skips automatic update checks when a different installed AppImage already exists", async () => {
    const deps = createDeps({
      status: {
        available: true,
        integrated: true,
        appimagePath:
          "/home/user/Downloads/routevn-creator_1.7.2_amd64.AppImage",
        installedAppimagePath:
          "/home/user/Applications/RouteVN-Creator.AppImage",
      },
    });

    const result = await maybePromptLinuxAppImageDesktopIntegration(deps);

    expect(deps.appService.showDialog).not.toHaveBeenCalled();
    expect(result).toEqual({ skipAutomaticUpdateChecks: true });
  });
});
