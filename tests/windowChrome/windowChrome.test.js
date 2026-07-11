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
    setDecorations: vi.fn(async () => {
      if (decorationsError) {
        throw decorationsError;
      }
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
    setMaximized: (nextMaximized) => {
      maximized = nextMaximized;
    },
  };
};

afterEach(() => {
  openDocuments.forEach((dom) => dom.window.close());
  openDocuments.clear();
  vi.restoreAllMocks();
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
    const dragRegionRule = rules.get(
      "#rvn-window-chrome .rvn-window-chrome-drag-region",
    );
    const windowedRootRule = rules.get(
      ':root[data-rvn-window-chrome="custom"][data-rvn-window-fullscreen="false"][data-rvn-window-maximized="false"]',
    );
    const maximizedHiddenRule = rules.get(
      '#rvn-window-chrome[data-revealed="false"]',
    );
    const bodyRule = rules.get(':root[data-rvn-window-chrome="custom"] body');

    expect(chromeRule.getPropertyValue("background")).toBe(
      "var(--surface, #1f1f1f)",
    );
    expect(chromeRule.getPropertyValue("border-bottom")).not.toBe("");
    expect(dragRegionRule.getPropertyValue("width")).toBe("100%");
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

  it("reveals maximized chrome within the expanded top-edge hover zone", async () => {
    const harness = createWindowHarness();
    await flushTasks();

    const { document } = harness.dom.window;
    const chrome = document.querySelector("#rvn-window-chrome");
    harness.setMaximized(true);
    harness.getResizedHandler()();
    await flushTasks();

    expect(chrome.dataset.maximized).toBe("true");
    expect(chrome.dataset.revealed).toBe("false");
    expect(document.documentElement.dataset.rvnWindowMaximized).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 12 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 47 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 49 }),
    );
    expect(chrome.dataset.revealed).toBe("false");

    harness.setMaximized(false);
    harness.getResizedHandler()();
    await flushTasks();
    expect(chrome.dataset.revealed).toBe("true");
    expect(document.documentElement.dataset.rvnWindowMaximized).toBe("false");
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
    expect(chrome.dataset.revealed).toBe("false");
    expect(document.documentElement.dataset.rvnWindowFullscreen).toBe("true");
    expect(fullscreenButton.getAttribute("aria-label")).toBe("Exit fullscreen");
    expect(fullscreenButton.hasAttribute("title")).toBe(false);
    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 12 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 47 }),
    );
    expect(chrome.dataset.revealed).toBe("true");

    harness.dom.window.dispatchEvent(
      new harness.dom.window.MouseEvent("pointermove", { clientY: 49 }),
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
});
