import { JSDOM } from "jsdom";
import { NEVER } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRouteTransitionRunner,
  handleBeforeMount,
  handleWindowPop,
  maybePromptLinuxAppImageDesktopIntegration,
} from "../../src/pages/app/app.handlers.js";

describe("app route transitions", () => {
  it("awaits page preparation before changing route history", async () => {
    let finishPreparation;
    const appService = {
      prepareNavigation: vi.fn(
        () =>
          new Promise((resolve) => {
            finishPreparation = resolve;
          }),
      ),
      redirect: vi.fn(),
      replace: vi.fn(),
      getCurrentProjectId: vi.fn(() => ""),
      refreshCurrentProjectEntry: vi.fn(async () => {}),
      getPlatform: vi.fn(() => "web"),
    };
    const deps = {
      appService,
      projectService: {
        getEnsuredProjectId: vi.fn(() => undefined),
      },
      store: {
        setCurrentRoute: vi.fn(),
        closeMobileSheet: vi.fn(),
        setRepositoryLoading: vi.fn(),
      },
      render: vi.fn(),
      i18n: {},
    };
    const runRouteTransition = createRouteTransitionRunner(deps);

    const transition = runRouteTransition({
      path: "/projects",
      payload: {},
      historyMode: "push",
    });
    await vi.waitFor(() =>
      expect(appService.prepareNavigation).toHaveBeenCalledOnce(),
    );

    expect(appService.redirect).not.toHaveBeenCalled();
    finishPreparation();
    await transition;
    expect(appService.redirect).toHaveBeenCalledWith(
      "/projects",
      {},
      {
        state: undefined,
      },
    );
  });

  it("does not prepare a route twice when back navigation was prepared", async () => {
    const appService = {
      prepareNavigation: vi.fn(async () => {}),
      redirect: vi.fn(),
      replace: vi.fn(),
      getCurrentProjectId: vi.fn(() => ""),
      refreshCurrentProjectEntry: vi.fn(async () => {}),
      getPlatform: vi.fn(() => "web"),
    };
    const deps = {
      appService,
      projectService: {
        getEnsuredProjectId: vi.fn(() => undefined),
      },
      store: {
        setCurrentRoute: vi.fn(),
        closeMobileSheet: vi.fn(),
        setRepositoryLoading: vi.fn(),
      },
      render: vi.fn(),
      i18n: {},
    };

    await createRouteTransitionRunner(deps)({
      path: "/projects",
      payload: {},
      navigationPrepared: true,
    });

    expect(appService.prepareNavigation).not.toHaveBeenCalled();
  });

  it("prepares browser back navigation in the rendered route context", async () => {
    let currentPath = "/projects";
    let currentPayload = {};
    const calls = [];
    const appService = {
      getPath: vi.fn(() => currentPath),
      getPayload: vi.fn(() => ({ ...currentPayload })),
      getHistoryState: vi.fn(() => ({ entry: "destination" })),
      replace: vi.fn((path, payload) => {
        currentPath = path;
        currentPayload = { ...payload };
        calls.push(`replace:${path}:${payload?.p ?? "none"}`);
      }),
      prepareNavigation: vi.fn(async () => {
        calls.push(`prepare:${currentPath}:${currentPayload.p}`);
      }),
      showToast: vi.fn(),
    };
    const subject = {
      dispatch: vi.fn(() => calls.push("dispatch")),
    };
    const deps = {
      appService,
      store: {
        selectCurrentRoute: vi.fn(() => "/project/scene-editor"),
        selectCurrentRoutePayload: vi.fn(() => ({
          p: "project-1",
          s: "scene-1",
        })),
      },
      subject,
    };

    await handleWindowPop(deps);

    expect(calls).toEqual([
      "replace:/project/scene-editor:project-1",
      "prepare:/project/scene-editor:project-1",
      "replace:/projects:none",
      "dispatch",
    ]);
    expect(subject.dispatch).toHaveBeenCalledWith("app.route.request", {
      path: "/projects",
      payload: {},
      navigationPrepared: true,
      shouldUpdateHistory: false,
    });
  });
});

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

const createNavigationShortcutHarness = () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("Element", dom.window.Element);

  const appService = {
    getPath: vi.fn(() => "/project/images"),
    getPayload: vi.fn(() => ({ p: "project-1" })),
    getPlatform: vi.fn(() => "web"),
    isInputFocused: vi.fn(() => true),
    navigate: vi.fn(),
    setAppCopyProvider: vi.fn(),
  };
  const deps = {
    appService,
    store: {
      setPlatform: vi.fn(),
      setUiConfig: vi.fn(),
    },
    subject: {
      dispatch: vi.fn(),
      pipe: vi.fn(() => NEVER),
    },
    uiConfig: {},
  };
  const cleanup = handleBeforeMount(deps);

  return {
    appService,
    cleanup,
    document: dom.window.document,
    KeyboardEvent: dom.window.KeyboardEvent,
  };
};

const navigationShortcutCases = [
  ["pr", "/project"],
  ["i", "/project/images"],
  ["sp", "/project/spritesheets"],
  ["ch", "/project/characters"],
  ["so", "/project/sounds"],
  ["tr", "/project/transforms"],
  ["an", "/project/animations"],
  ["pa", "/project/particles"],
  ["vi", "/project/videos"],
  ["co", "/project/colors"],
  ["f", "/project/fonts"],
  ["ts", "/project/text-styles"],
  ["l", "/project/layouts"],
  ["ct", "/project/controls"],
  ["va", "/project/variables"],
  ["sc", "/project/scenes"],
  ["r", "/project/releases/versions"],
  ["ws", "/project/releases/web-server"],
  ["ab", "/project/about"],
  ["ap", "/project/appearance"],
];

const createKeyboardScope = (harness) => {
  const keyboardScope = harness.document.createElement("div");
  keyboardScope.tabIndex = -1;
  harness.document.body.append(keyboardScope);
  keyboardScope.focus();
  return keyboardScope;
};

const dispatchKeyboardSequence = ({ harness, target, keys }) => {
  for (const key of keys) {
    target.dispatchEvent(
      new harness.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
      }),
    );
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app project navigation shortcuts", () => {
  it.each(navigationShortcutCases)(
    "navigates with g %s from a focused non-editable keyboard scope",
    (sequence, targetPath) => {
      const harness = createNavigationShortcutHarness();
      const keyboardScope = createKeyboardScope(harness);

      dispatchKeyboardSequence({
        harness,
        target: keyboardScope,
        keys: ["g", ...sequence],
      });

      expect(harness.appService.navigate).toHaveBeenCalledWith(
        targetPath,
        { p: "project-1" },
        { historyMode: "replace" },
      );
      harness.cleanup();
    },
  );

  it("normalizes uppercase shortcut keys", () => {
    const harness = createNavigationShortcutHarness();
    const keyboardScope = createKeyboardScope(harness);

    dispatchKeyboardSequence({
      harness,
      target: keyboardScope,
      keys: ["G", "C", "H"],
    });

    expect(harness.appService.navigate).toHaveBeenCalledWith(
      "/project/characters",
      { p: "project-1" },
      { historyMode: "replace" },
    );
    harness.cleanup();
  });

  it.each([
    ["ch", "/project/characters"],
    ["l", "/project/layouts"],
  ])(
    "resolves g %s before a focused page scope consumes h or l",
    (sequence, targetPath) => {
      const harness = createNavigationShortcutHarness();
      const keyboardScope = createKeyboardScope(harness);
      keyboardScope.addEventListener("keydown", (event) => {
        const key = String(event.key).toLowerCase();
        if (key === "h" || key === "l") {
          event.preventDefault();
          event.stopPropagation();
        }
      });

      dispatchKeyboardSequence({
        harness,
        target: keyboardScope,
        keys: ["g", ...sequence],
      });

      expect(harness.appService.navigate).toHaveBeenCalledWith(
        targetPath,
        { p: "project-1" },
        { historyMode: "replace" },
      );
      harness.cleanup();
    },
  );

  it.each(["p", "h", "c", "o", "y", "v", "t", "s", "n", "a"])(
    "does not retain the legacy g %s shortcut",
    (legacyKey) => {
      const harness = createNavigationShortcutHarness();
      const keyboardScope = createKeyboardScope(harness);

      dispatchKeyboardSequence({
        harness,
        target: keyboardScope,
        keys: ["g", legacyKey],
      });

      expect(harness.appService.navigate).not.toHaveBeenCalled();
      harness.cleanup();
    },
  );

  it("does not navigate while a text input is focused", () => {
    const harness = createNavigationShortcutHarness();
    const input = harness.document.createElement("input");
    harness.document.body.append(input);
    input.focus();

    dispatchKeyboardSequence({
      harness,
      target: input,
      keys: ["g", "c", "h"],
    });

    expect(harness.appService.navigate).not.toHaveBeenCalled();
    harness.cleanup();
  });
});

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
