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

const createWindowHarness = ({ platform = "Win32", withTauri = true } = {}) => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body class="dark"><rvn-app></rvn-app></body></html>',
    {
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
    toggleMaximize: vi.fn(async () => {
      maximized = !maximized;
    }),
  };

  if (withTauri) {
    dom.window.__TAURI__ = {
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
  };
};

afterEach(() => {
  openDocuments.forEach((dom) => dom.window.close());
  openDocuments.clear();
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

  it("enables frameless Windows access with the required window permissions", () => {
    expect(tauriWindowsConfig.app.withGlobalTauri).toBe(true);
    expect(tauriWindowsConfig.app.windows[0].decorations).toBe(false);
    expect(defaultCapability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-close",
        "core:window:allow-minimize",
        "core:window:allow-set-fullscreen",
        "core:window:allow-start-dragging",
        "core:window:allow-toggle-maximize",
      ]),
    );
  });

  it("does not mount outside the Windows Tauri runtime", async () => {
    const webHarness = createWindowHarness({ withTauri: false });
    const linuxHarness = createWindowHarness({ platform: "Linux x86_64" });
    await flushTasks();

    expect(
      webHarness.dom.window.document.querySelector("#rvn-window-chrome"),
    ).toBeNull();
    expect(
      linuxHarness.dom.window.document.querySelector("#rvn-window-chrome"),
    ).toBeNull();
  });

  it("uses one control surface for windowed, maximized, and fullscreen states", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    const minimizeButton = chrome.querySelector(
      '[data-window-action="minimize"]',
    );
    const maximizeButton = chrome.querySelector(
      '[data-window-action="maximize"]',
    );
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );
    const closeButton = chrome.querySelector('[data-window-action="close"]');

    expect(chrome.dataset.maximized).toBe("false");
    expect(chrome.dataset.fullscreen).toBe("false");

    maximizeButton.click();
    await flushTasks();
    expect(harness.appWindow.toggleMaximize).toHaveBeenCalledOnce();
    expect(chrome.dataset.maximized).toBe("true");
    expect(maximizeButton.getAttribute("aria-label")).toBe("Restore");

    fullscreenButton.click();
    await flushTasks();
    expect(harness.appWindow.setFullscreen).toHaveBeenCalledWith(true);
    expect(chrome.dataset.fullscreen).toBe("true");
    expect(fullscreenButton.getAttribute("aria-label")).toBe("Exit fullscreen");
    expect(maximizeButton.disabled).toBe(true);

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

    harness.getResizedHandler()();
    await flushTasks();
    expect(harness.appWindow.isFullscreen).toHaveBeenCalled();
    expect(harness.appWindow.isMaximized).toHaveBeenCalled();
  });
});
