import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

const windowChromeSource = readFileSync(
  fileURLToPath(
    new URL("../../static/public/windowChrome.js", import.meta.url),
  ),
  "utf8",
);
const staticDirectory = fileURLToPath(
  new URL("../../static/", import.meta.url),
);
const testPermissionsHtml = readFileSync(
  fileURLToPath(new URL("../../static/test-permissions.html", import.meta.url)),
  "utf8",
);
const windowsPlayerIndexHtml = readFileSync(
  fileURLToPath(
    new URL(
      "../../scripts/player-templates/windows/index.html",
      import.meta.url,
    ),
  ),
  "utf8",
);
const tauriConfig = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../src-tauri/tauri.conf.json", import.meta.url)),
    "utf8",
  ),
);
const tauriWindowsConfig = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../src-tauri/tauri.windows.conf.json", import.meta.url),
    ),
    "utf8",
  ),
);
const defaultCapability = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../src-tauri/capabilities/default.json", import.meta.url),
    ),
    "utf8",
  ),
);
const packageJson = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf8",
  ),
);
const watchTauriScript = readFileSync(
  fileURLToPath(new URL("../../scripts/watch-tauri.sh", import.meta.url)),
  "utf8",
);
const tauriCargoToml = readFileSync(
  fileURLToPath(new URL("../../src-tauri/Cargo.toml", import.meta.url)),
  "utf8",
);
const tauriLibSource = readFileSync(
  fileURLToPath(new URL("../../src-tauri/src/lib.rs", import.meta.url)),
  "utf8",
);
const windowsSystemMenuSource = readFileSync(
  fileURLToPath(
    new URL("../../src-tauri/src/windows_system_menu.rs", import.meta.url),
  ),
  "utf8",
);
const windowsSystemMenuWindowsSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../src-tauri/src/windows_system_menu_windows.rs",
      import.meta.url,
    ),
  ),
  "utf8",
);
const playerBuildScript = readFileSync(
  fileURLToPath(
    new URL("../../scripts/build-windows-player-template.js", import.meta.url),
  ),
  "utf8",
);
const playerShellConfig = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../crates/routevn-packager/tauri-shell/src-tauri/tauri.conf.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);
const playerShellCapability = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../crates/routevn-packager/tauri-shell/src-tauri/capabilities/default.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);
const playerShellCargoToml = readFileSync(
  fileURLToPath(
    new URL(
      "../../crates/routevn-packager/tauri-shell/src-tauri/Cargo.toml",
      import.meta.url,
    ),
  ),
  "utf8",
);
const playerShellLibSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../crates/routevn-packager/tauri-shell/src-tauri/src/lib.rs",
      import.meta.url,
    ),
  ),
  "utf8",
);
const playerWindowsSystemMenuSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../crates/routevn-packager/tauri-shell/src-tauri/src/windows_system_menu.rs",
      import.meta.url,
    ),
  ),
  "utf8",
);
const playerWindowsSystemMenuWindowsSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../crates/routevn-packager/tauri-shell/src-tauri/src/windows_system_menu_windows.rs",
      import.meta.url,
    ),
  ),
  "utf8",
);

const openDocuments = new Set();

const flushTasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const collectIndexFiles = (directory) => {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return collectIndexFiles(entryPath);
    }
    return entry.name === "index.html" ? [entryPath] : [];
  });
};

const createWindowHarness = ({
  decorationsError,
  platform = "Win32",
  withTauri = true,
} = {}) => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body class="dark"><rvn-app></rvn-app></body></html>',
    {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "http://localhost/",
    },
  );
  openDocuments.add(dom);

  Object.defineProperty(dom.window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(dom.window.navigator, "userAgent", {
    configurable: true,
    value: platform.startsWith("Win")
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      : "Mozilla/5.0 (X11; Linux x86_64)",
  });

  let fullscreen = false;
  let maximized = false;
  let resizedHandler;
  let focusedHandler;
  const invoke = vi.fn(async () => {});
  const appWindow = {
    close: vi.fn(async () => {}),
    isFullscreen: vi.fn(async () => fullscreen),
    isMaximized: vi.fn(async () => maximized),
    minimize: vi.fn(async () => {}),
    onFocusChanged: vi.fn(async (handler) => {
      focusedHandler = handler;
      return vi.fn();
    }),
    onResized: vi.fn(async (handler) => {
      resizedHandler = handler;
      return vi.fn();
    }),
    setFullscreen: vi.fn(async (nextFullscreen) => {
      fullscreen = nextFullscreen;
    }),
    setDecorations: vi.fn(async () => {
      if (decorationsError) {
        throw decorationsError;
      }
    }),
    unmaximize: vi.fn(async () => {
      maximized = false;
    }),
  };

  if (withTauri) {
    dom.window.__TAURI__ = {
      core: {
        invoke,
      },
      window: {
        getCurrentWindow: () => appWindow,
      },
    };
  }

  dom.window.eval(windowChromeSource);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

  return {
    appWindow,
    dom,
    getFocusedHandler: () => focusedHandler,
    getResizedHandler: () => resizedHandler,
    invoke,
    setFullscreenState: (nextFullscreen) => {
      fullscreen = nextFullscreen;
    },
    setMaximized: (nextMaximized) => {
      maximized = nextMaximized;
    },
  };
};

afterEach(() => {
  openDocuments.forEach((dom) => dom.window.close());
  openDocuments.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("standalone window chrome", () => {
  it("is loaded directly by every desktop creator entry point", () => {
    const creatorEntryFiles = collectIndexFiles(staticDirectory).filter(
      (file) => {
        if (file.includes("/android/") || file.includes("/ios/")) {
          return false;
        }
        return readFileSync(file, "utf8").includes("<rvn-app");
      },
    );

    expect(creatorEntryFiles).toHaveLength(29);
    creatorEntryFiles.forEach((file) => {
      const html = readFileSync(file, "utf8");
      expect(html).toContain(
        '<script src="/public/windowChrome.js" defer></script>',
      );
      expect(html.indexOf("/public/windowChrome.js")).toBeLessThan(
        html.indexOf("/public/main.js"),
      );
    });
  });

  it("is loaded by the permissions-test document", () => {
    expect(testPermissionsHtml).toContain(
      '<script src="/public/windowChrome.js" defer></script>',
    );
  });

  it("is staged and loaded by the exported Windows player shell", () => {
    expect(windowsPlayerIndexHtml).toContain(
      '<script src="./windowChrome.js" defer></script>',
    );
    expect(windowsPlayerIndexHtml.indexOf("windowChrome.js")).toBeLessThan(
      windowsPlayerIndexHtml.indexOf("./main.js"),
    );
    expect(playerBuildScript).toContain(
      '"scripts/player-templates/windows/index.html"',
    );
    expect(playerBuildScript).toContain('"static/public/windowChrome.js"');
    expect(playerBuildScript).toContain(
      'path.join(shellDistDir, "windowChrome.js")',
    );
  });

  it("keeps a native fallback until runtime custom chrome can activate", () => {
    expect(tauriWindowsConfig.app.withGlobalTauri).toBe(true);
    expect(tauriWindowsConfig.app.windows[0].decorations).toBe(true);
    expect(defaultCapability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-close",
        "core:window:allow-minimize",
        "core:window:allow-set-decorations",
        "core:window:allow-set-fullscreen",
        "core:window:allow-start-dragging",
        "core:window:allow-unmaximize",
      ]),
    );
    expect(defaultCapability.permissions).not.toContain(
      "core:window:allow-toggle-maximize",
    );
  });

  it("uses the same default size for Creator and exported player windows", () => {
    for (const config of [tauriConfig, tauriWindowsConfig, playerShellConfig]) {
      expect(config.app.windows[0]).toMatchObject({
        width: 1600,
        height: 930,
      });
    }
  });

  it("keeps the exported player native frame until custom chrome activates", () => {
    expect(playerShellConfig.app.withGlobalTauri).toBe(true);
    expect(playerShellConfig.app.windows[0].decorations).toBe(true);
    expect(playerShellCapability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-close",
        "core:window:allow-minimize",
        "core:window:allow-set-decorations",
        "core:window:allow-set-fullscreen",
        "core:window:allow-start-dragging",
        "core:window:allow-unmaximize",
      ]),
    );
    expect(playerShellCapability.permissions).not.toContain(
      "core:window:allow-toggle-maximize",
    );
  });

  it("copies standalone assets before starting the Tauri watch server", () => {
    expect(packageJson.scripts["watch:tauri"]).toBe("./scripts/watch-tauri.sh");
    expect(watchTauriScript).toContain("cp -rf static/. _site/");
    expect(watchTauriScript).toContain(
      'exec "${RTGL_BIN}" fe watch -s src/setup.tauri.js',
    );
  });

  it("keeps static entry points on the packaged Rettangoli UI version", () => {
    const rettangoliUiVersion = packageJson.dependencies["@rettangoli/ui"];
    const rettangoliUiEntryFiles = collectIndexFiles(staticDirectory).filter(
      (file) => readFileSync(file, "utf8").includes("/public/@rettangoli/ui@"),
    );

    expect(rettangoliUiEntryFiles.length).toBeGreaterThan(0);
    rettangoliUiEntryFiles.forEach((file) => {
      expect(readFileSync(file, "utf8")).toContain(
        `/public/@rettangoli/ui@${rettangoliUiVersion}/dist/rettangoli-iife-ui.min.js`,
      );
    });
  });

  it("registers a native Windows system-menu command", () => {
    expect(tauriCargoToml).toContain('cfg(target_os = "windows")');
    expect(tauriCargoToml).toContain('"Win32_UI_WindowsAndMessaging"');
    expect(tauriLibSource).toContain("mod windows_system_menu;");
    expect(tauriLibSource).toContain(
      "windows_system_menu::show_windows_system_menu",
    );
    expect(windowsSystemMenuSource).toContain("windows_impl::show(hwnd)");
    expect(windowsSystemMenuWindowsSource).toContain("GetSystemMenu");
    expect(windowsSystemMenuWindowsSource).toContain("TrackPopupMenuEx");
    expect(windowsSystemMenuWindowsSource).toContain("WM_SYSCOMMAND");

    expect(playerShellCargoToml).toContain('cfg(target_os = "windows")');
    expect(playerShellCargoToml).toContain('"Win32_UI_WindowsAndMessaging"');
    expect(playerShellLibSource).toContain("mod windows_system_menu;");
    expect(playerShellLibSource).toContain(
      "windows_system_menu::show_windows_system_menu",
    );
    expect(playerWindowsSystemMenuSource).toContain("windows_impl::show(hwnd)");
    expect(playerWindowsSystemMenuWindowsSource).toContain("GetSystemMenu");
    expect(playerWindowsSystemMenuWindowsSource).toContain("TrackPopupMenuEx");
    expect(playerWindowsSystemMenuWindowsSource).toContain("WM_SYSCOMMAND");
  });

  it("does not mount without the Tauri window API", async () => {
    const webHarness = createWindowHarness({ withTauri: false });
    await flushTasks();

    expect(
      webHarness.dom.window.document.querySelector("#rvn-window-chrome"),
    ).toBeNull();
  });

  it("mounts from the Tauri API without relying on navigator platform", async () => {
    const harness = createWindowHarness({ platform: "Unknown" });
    await flushTasks();

    expect(harness.appWindow.setDecorations).toHaveBeenCalledWith(false);
    expect(
      harness.dom.window.document.querySelector("#rvn-window-chrome"),
    ).not.toBeNull();
  });

  it("tracks the exported project title and icon from document branding", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const title = document.querySelector(".rvn-window-chrome-title");
    const icon = document.querySelector(".rvn-window-chrome-icon");
    expect(title.textContent.trim()).toBe("RouteVN Creator");

    document.title = "Exported Project";
    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.href = "data:image/png;base64,cHJvamVjdA==";
    document.head.append(favicon);
    await flushTasks();

    expect(title.textContent).toBe("Exported Project");
    expect(icon.src).toBe("data:image/png;base64,cHJvamVjdA==");
  });

  it("leaves native chrome available when custom chrome cannot activate", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const harness = createWindowHarness({
      decorationsError: new Error("permission denied"),
    });
    await flushTasks();

    expect(harness.appWindow.setDecorations).toHaveBeenCalledWith(false);
    expect(
      harness.dom.window.document.querySelector("#rvn-window-chrome"),
    ).toBeNull();
    expect(
      harness.dom.window.document.querySelector("#rvn-window-chrome-styles"),
    ).toBeNull();
  });

  it("renders a continuous bar and reserves content space when windowed", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const styleElement = document.querySelector("#rvn-window-chrome-styles");
    const rules = new Map(
      [...styleElement.sheet.cssRules]
        .filter((rule) => rule.selectorText)
        .map((rule) => [rule.selectorText, rule.style]),
    );
    const chromeRule = rules.get("#rvn-window-chrome");
    const rootRule = rules.get(":root");
    const dragRegionRule = rules.get(
      "#rvn-window-chrome .rvn-window-chrome-drag-region",
    );
    const controlsRule = rules.get(
      "#rvn-window-chrome .rvn-window-chrome-controls",
    );
    const controlRule = rules.get(
      "#rvn-window-chrome .rvn-window-chrome-control",
    );
    const controlHoverRule = rules.get(
      "#rvn-window-chrome .rvn-window-chrome-control:hover",
    );
    const controlActiveRule = rules.get(
      "#rvn-window-chrome .rvn-window-chrome-control:active",
    );
    const customRootRule = rules.get(':root[data-rvn-window-chrome="custom"]');
    const windowedRootRule = rules.get(
      ':root[data-rvn-window-chrome="custom"][data-rvn-window-fullscreen="false"][data-rvn-window-maximized="false"]',
    );
    const maximizedHiddenRule = rules.get(
      '#rvn-window-chrome[data-revealed="false"]',
    );
    const bodyRule = rules.get(':root[data-rvn-window-chrome="custom"] body');

    expect(rootRule.getPropertyValue("--rvn-window-chrome-height")).toBe(
      "30px",
    );
    expect(chromeRule.getPropertyValue("background")).toBe("#202020");
    expect(chromeRule.getPropertyValue("border-bottom")).not.toBe("");
    expect(controlsRule.getPropertyValue("border-left")).toBe("");
    expect(controlRule.getPropertyValue("transition-property")).toBe(
      "background-color, color",
    );
    expect(controlRule.getPropertyValue("background-color")).toBe("#202020");
    expect(controlRule.getPropertyValue("transition-duration")).toBe("100ms");
    expect(controlRule.getPropertyValue("transition-timing-function")).toBe(
      "linear",
    );
    expect(controlHoverRule.getPropertyValue("background-color")).toBe(
      "#2d2d2d",
    );
    expect(controlHoverRule.getPropertyValue("transition-duration")).toBe(
      "0ms",
    );
    expect(controlActiveRule.getPropertyValue("background-color")).not.toBe("");
    expect(controlActiveRule.getPropertyValue("transition-duration")).toBe(
      "0ms",
    );
    expect(dragRegionRule.getPropertyValue("width")).toBe("100%");
    expect(dragRegionRule.getPropertyValue("gap")).toBe("6px");
    expect(dragRegionRule.getPropertyValue("padding")).toBe("0 8px");
    expect(
      windowedRootRule.getPropertyValue("--rvn-window-content-offset"),
    ).toBe("var(--rvn-window-chrome-height)");
    expect(customRootRule.getPropertyValue("--rvn-app-viewport-height")).toBe(
      "100vh",
    );
    expect(windowedRootRule.getPropertyValue("--rvn-app-viewport-height")).toBe(
      "calc(\n        100vh - var(--rvn-window-chrome-height)\n      )",
    );
    expect(bodyRule.getPropertyValue("top")).toBe(
      "var(--rvn-window-content-offset)",
    );
    expect(bodyRule.getPropertyValue("position")).toBe("fixed");
    expect(maximizedHiddenRule.getPropertyValue("transform")).toBe(
      "translateY(-100%)",
    );
    expect(maximizedHiddenRule.getPropertyValue("visibility")).toBe("hidden");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("false");
    expect(document.documentElement.dataset.rvnWindowMaximized).toBe("false");
  });

  it("uses centered, theme-independent Windows-style window control icons", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    const rules = [
      ...document.querySelector("#rvn-window-chrome-styles").sheet.cssRules,
    ];
    const chromeRule = rules.find(
      (rule) => rule.selectorText === "#rvn-window-chrome",
    );
    const unfocusedChromeRule = rules.find(
      (rule) =>
        rule.selectorText === '#rvn-window-chrome[data-focused="false"]',
    );
    const controlActiveRule = rules.find(
      (rule) =>
        rule.selectorText ===
        "#rvn-window-chrome .rvn-window-chrome-control:active",
    );
    const controlIconRule = rules.find(
      (rule) =>
        rule.selectorText ===
        "#rvn-window-chrome .rvn-window-chrome-control svg",
    );
    const minimizePath = chrome.querySelector(
      '[data-window-action="minimize"] path',
    );
    const appMenuButton = chrome.querySelector(".rvn-window-chrome-app-menu");
    const enterFullscreenRect = chrome.querySelector(
      ".rvn-window-chrome-icon-enter-fullscreen rect",
    );
    const exitFullscreenPath = chrome.querySelector(
      ".rvn-window-chrome-icon-exit-fullscreen path",
    );
    const exitFullscreenRect = chrome.querySelector(
      ".rvn-window-chrome-icon-exit-fullscreen rect",
    );

    expect(appMenuButton.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(chromeRule.style.getPropertyValue("color")).toBe("#f5f5f5");
    expect(unfocusedChromeRule.style.getPropertyValue("color")).not.toContain(
      "--foreground",
    );
    expect(
      controlActiveRule.style.getPropertyValue("background-color"),
    ).not.toContain("--foreground");
    expect(controlIconRule.style.getPropertyValue("stroke")).toBe(
      "currentColor",
    );
    expect(controlIconRule.style.getPropertyValue("stroke-width")).toBe("1");
    expect(minimizePath.getAttribute("d")).toBe("M1.5 6.5h9");
    expect(
      ["x", "y", "width", "height", "rx"].map((attribute) =>
        enterFullscreenRect.getAttribute(attribute),
      ),
    ).toEqual(["1.5", "1.5", "9", "9", "1"]);
    expect(exitFullscreenPath.getAttribute("d")).toBe(
      "M3.5 3.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1",
    );
    expect(
      ["x", "y", "width", "height", "rx"].map((attribute) =>
        exitFullscreenRect.getAttribute(attribute),
      ),
    ).toEqual(["1.5", "3.5", "7", "7", "1"]);
  });

  it("opens the system menu on click or context menu and closes on double click", async () => {
    vi.useFakeTimers();
    const harness = createWindowHarness();
    await vi.advanceTimersByTimeAsync(0);

    const appMenuButton = harness.dom.window.document.querySelector(
      ".rvn-window-chrome-app-menu",
    );
    appMenuButton.dispatchEvent(
      new harness.dom.window.MouseEvent("click", {
        bubbles: true,
        detail: 1,
      }),
    );
    await vi.advanceTimersByTimeAsync(499);
    expect(harness.invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.invoke).toHaveBeenCalledWith("show_windows_system_menu");

    await vi.advanceTimersByTimeAsync(0);
    harness.invoke.mockClear();
    const contextMenuEvent = new harness.dom.window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    appMenuButton.dispatchEvent(contextMenuEvent);
    await vi.advanceTimersByTimeAsync(0);
    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(harness.invoke).toHaveBeenCalledWith("show_windows_system_menu");

    harness.invoke.mockClear();
    appMenuButton.dispatchEvent(
      new harness.dom.window.MouseEvent("click", {
        bubbles: true,
        detail: 1,
      }),
    );
    appMenuButton.dispatchEvent(
      new harness.dom.window.MouseEvent("click", {
        bubbles: true,
        detail: 2,
      }),
    );
    appMenuButton.dispatchEvent(
      new harness.dom.window.MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        detail: 2,
      }),
    );
    await vi.advanceTimersByTimeAsync(500);

    expect(harness.appWindow.close).toHaveBeenCalledOnce();
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it("reveals maximized chrome within the expanded top-edge hover zone", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );
    const enterFullscreenIcon = chrome.querySelector(
      ".rvn-window-chrome-icon-enter-fullscreen",
    );
    const exitFullscreenIcon = chrome.querySelector(
      ".rvn-window-chrome-icon-exit-fullscreen",
    );
    harness.setMaximized(true);
    harness.getResizedHandler()();
    await flushTasks();

    expect(chrome.dataset.maximized).toBe("true");
    expect(chrome.dataset.expanded).toBe("true");
    expect(chrome.dataset.revealed).toBe("false");
    expect(fullscreenButton.getAttribute("aria-label")).toBe("Restore window");
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("true");
    expect(
      harness.dom.window.getComputedStyle(enterFullscreenIcon).display,
    ).toBe("none");
    expect(
      harness.dom.window.getComputedStyle(exitFullscreenIcon).display,
    ).toBe("block");
    expect(document.documentElement.dataset.rvnWindowMaximized).toBe("true");
    expect(document.documentElement.dataset.rvnWindowExpanded).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 12 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 46 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 47 }),
    );
    expect(chrome.dataset.revealed).toBe("false");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 12 }),
    );
    fullscreenButton.click();
    await flushTasks();
    expect(harness.appWindow.unmaximize).toHaveBeenCalledOnce();
    expect(harness.appWindow.setFullscreen).not.toHaveBeenCalled();
    expect(chrome.dataset.expanded).toBe("false");
    expect(chrome.dataset.revealed).toBe("true");
    expect(fullscreenButton.getAttribute("aria-label")).toBe(
      "Enter fullscreen",
    );
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.dataset.rvnWindowMaximized).toBe("false");
    expect(document.documentElement.dataset.rvnWindowExpanded).toBe("false");
  });

  it("uses one control surface for windowed and fullscreen states", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    const minimizeButton = chrome.querySelector(
      '[data-window-action="minimize"]',
    );
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );
    const closeButton = chrome.querySelector('[data-window-action="close"]');

    expect(chrome.dataset.fullscreen).toBe("false");
    expect(chrome.dataset.expanded).toBe("false");
    expect(harness.appWindow.setDecorations).toHaveBeenCalledWith(false);
    expect(chrome.querySelector('[data-window-action="maximize"]')).toBeNull();
    expect(chrome.querySelectorAll("[data-window-action]")).toHaveLength(3);
    chrome.querySelectorAll("[data-window-action]").forEach((button) => {
      expect(button.hasAttribute("title")).toBe(false);
    });

    fullscreenButton.click();
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenCalledWith(true);
    expect(chrome.dataset.fullscreen).toBe("true");
    expect(chrome.dataset.expanded).toBe("true");
    expect(chrome.dataset.revealed).toBe("false");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("true");
    expect(document.documentElement.dataset.rvnWindowExpanded).toBe("true");
    expect(fullscreenButton.getAttribute("aria-label")).toBe("Exit fullscreen");
    expect(fullscreenButton.hasAttribute("title")).toBe(false);
    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 12 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 46 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 47 }),
    );
    expect(chrome.dataset.revealed).toBe("false");

    minimizeButton.click();
    await flushTasks();
    expect(harness.appWindow.minimize).toHaveBeenCalledOnce();

    closeButton.click();
    await flushTasks();
    expect(harness.appWindow.close).toHaveBeenCalledOnce();
  });

  it("keeps state synchronized with window events and fullscreen shortcuts", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );

    harness.getFocusedHandler()({ payload: false });
    expect(chrome.dataset.focused).toBe("false");

    harness.setMaximized(true);
    harness.getResizedHandler()();
    await flushTasks();
    expect(chrome.dataset.maximized).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.KeyboardEvent("keydown", { key: "F11" }),
    );
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenLastCalledWith(true);
    expect(harness.appWindow.unmaximize).not.toHaveBeenCalled();
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenLastCalledWith(false);
    expect(harness.appWindow.unmaximize).toHaveBeenCalledOnce();
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("false");

    harness.getResizedHandler()();
    await flushTasks();
    expect(harness.appWindow.isFullscreen).toHaveBeenCalled();
    expect(harness.appWindow.isMaximized).toHaveBeenCalled();
  });

  it("keeps fullscreen when a focused interaction consumes Escape", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.addEventListener("keydown", (event) => {
      event.preventDefault();
    });
    document.body.append(editor);

    harness.dom.window.dispatchEvent(
      new harness.dom.window.KeyboardEvent("keydown", { key: "F11" }),
    );
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenCalledOnce();
    expect(harness.appWindow.setFullscreen).toHaveBeenLastCalledWith(true);

    editor.dispatchEvent(
      new harness.dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      }),
    );
    await flushTasks();

    expect(harness.appWindow.setFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("true");
  });

  it("leaves Escape to an open dialog without exiting fullscreen", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );
    const dialog = document.createElement("rtgl-dialog");
    const dialogButton = document.createElement("button");
    dialog.setAttribute("open", "");
    dialog.append(dialogButton);
    document.body.append(dialog);

    harness.dom.window.dispatchEvent(
      new harness.dom.window.KeyboardEvent("keydown", { key: "F11" }),
    );
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenCalledOnce();
    expect(harness.appWindow.setFullscreen).toHaveBeenLastCalledWith(true);

    const escapeEvent = new harness.dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "Escape",
    });
    dialogButton.dispatchEvent(escapeEvent);
    await flushTasks();

    expect(escapeEvent.defaultPrevented).toBe(false);
    expect(harness.appWindow.setFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("true");
  });

  it("rechecks fullscreen after an external resize transition settles", async () => {
    vi.useFakeTimers();
    const harness = createWindowHarness();
    await vi.advanceTimersByTimeAsync(0);

    const chrome =
      harness.dom.window.document.querySelector("#rvn-window-chrome");
    harness.getResizedHandler()();
    await vi.advanceTimersByTimeAsync(0);
    expect(chrome.dataset.fullscreen).toBe("false");

    harness.setFullscreenState(true);
    await vi.advanceTimersByTimeAsync(200);

    expect(chrome.dataset.fullscreen).toBe("true");
    expect(chrome.dataset.revealed).toBe("false");
  });

  it("polls for external fullscreen changes that emit no window event", async () => {
    vi.useFakeTimers();
    const harness = createWindowHarness();
    await vi.advanceTimersByTimeAsync(0);

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    harness.setFullscreenState(true);
    await vi.advanceTimersByTimeAsync(500);

    expect(chrome.dataset.fullscreen).toBe("true");
    expect(chrome.dataset.revealed).toBe("false");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("true");

    harness.setFullscreenState(false);
    await vi.advanceTimersByTimeAsync(500);

    expect(chrome.dataset.fullscreen).toBe("false");
    expect(chrome.dataset.revealed).toBe("true");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("false");
  });
});
