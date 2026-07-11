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

  it("copies standalone assets before starting the Tauri watch server", () => {
    expect(packageJson.scripts["watch:tauri"]).toBe("./scripts/watch-tauri.sh");
    expect(watchTauriScript).toContain("cp -rf static/. _site/");
    expect(watchTauriScript).toContain(
      'exec "${RTGL_BIN}" fe watch -s src/setup.tauri.js',
    );
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
    expect(dragRegionRule.getPropertyValue("width")).toBe("100%");
    expect(dragRegionRule.getPropertyValue("gap")).toBe("6px");
    expect(dragRegionRule.getPropertyValue("padding")).toBe("0 8px");
    expect(
      windowedRootRule.getPropertyValue("--rvn-window-content-offset"),
    ).toBe("var(--rvn-window-chrome-height)");
    expect(bodyRule.getPropertyValue("top")).toBe(
      "var(--rvn-window-content-offset)",
    );
    expect(maximizedHiddenRule.getPropertyValue("transform")).toBe(
      "translateY(-100%)",
    );
    expect(maximizedHiddenRule.getPropertyValue("visibility")).toBe("hidden");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("false");
    expect(document.documentElement.dataset.rvnWindowMaximized).toBe("false");
  });

  it("uses centered Windows-style window control icons", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const chrome =
      harness.dom.window.document.querySelector("#rvn-window-chrome");
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
    expect(minimizePath.getAttribute("d")).toBe("M1.5 6h9");
    expect(
      ["x", "y", "width", "height", "rx"].map((attribute) =>
        enterFullscreenRect.getAttribute(attribute),
      ),
    ).toEqual(["1.75", "2", "8.5", "8", "0.5"]);
    expect(exitFullscreenPath.getAttribute("d")).toBe(
      "M3.25 3.5V2a.5.5 0 0 1 .5-.5H10a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H8.75",
    );
    expect(
      ["x", "y", "width", "height", "rx"].map((attribute) =>
        exitFullscreenRect.getAttribute(attribute),
      ),
    ).toEqual(["1.5", "3.5", "7.25", "7", "0.5"]);
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

    harness.dom.window.dispatchEvent(
      new harness.dom.window.KeyboardEvent("keydown", { key: "F11" }),
    );
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenLastCalledWith(true);
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenLastCalledWith(false);
    expect(fullscreenButton.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("false");

    harness.getResizedHandler()();
    await flushTasks();
    expect(harness.appWindow.isFullscreen).toHaveBeenCalled();
    expect(harness.appWindow.isMaximized).toHaveBeenCalled();
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
