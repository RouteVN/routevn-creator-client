(() => {
  const WINDOW_CHROME_ID = "rvn-window-chrome";
  const WINDOW_CHROME_HEIGHT_PX = 30;
  const AUTO_HIDE_REVEAL_OFFSET_PX = 16;
  const AUTO_HIDE_REVEAL_LIMIT_PX =
    WINDOW_CHROME_HEIGHT_PX + AUTO_HIDE_REVEAL_OFFSET_PX;
  const WINDOW_STATE_SETTLE_DELAY_MS = 120;
  const WINDOW_STATE_POLL_INTERVAL_MS = 500;
  const APP_ICON_MENU_DELAY_MS = 500;
  const DEFAULT_APP_TITLE = "RouteVN Creator";
  const DEFAULT_APP_ICON =
    "data:image/png;base64,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";

  const styles = `
    :root {
      --rvn-window-chrome-height: ${WINDOW_CHROME_HEIGHT_PX}px;
    }

    :root[data-rvn-window-chrome="custom"] {
      --rvn-window-content-offset: 0px;
      --rvn-app-viewport-height: 100vh;
    }

    :root[data-rvn-window-chrome="custom"][data-rvn-window-fullscreen="false"][data-rvn-window-maximized="false"] {
      --rvn-window-content-offset: var(--rvn-window-chrome-height);
      --rvn-app-viewport-height: calc(
        100vh - var(--rvn-window-chrome-height)
      );
    }

    :root[data-rvn-window-chrome="custom"] body {
      position: fixed;
      top: var(--rvn-window-content-offset);
      height: calc(100% - var(--rvn-window-content-offset));
    }

    #${WINDOW_CHROME_ID} {
      all: initial;
      --rvn-window-control-width: 46px;
      position: fixed;
      inset: 0 0 auto 0;
      z-index: 2147483646;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr) max-content;
      width: 100%;
      height: var(--rvn-window-chrome-height);
      overflow: hidden;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
      background: #202020;
      color: #f5f5f5;
      font-family: Roboto, "Segoe UI Variable", "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
      contain: layout style;
      opacity: 1;
      transform: translateY(0);
      visibility: visible;
      transition:
        transform 140ms ease,
        opacity 100ms ease,
        visibility 0s linear;
      -webkit-backdrop-filter: blur(18px) saturate(1.2);
      backdrop-filter: blur(18px) saturate(1.2);
    }

    #${WINDOW_CHROME_ID}[data-revealed="false"] {
      opacity: 0;
      transform: translateY(-100%);
      visibility: hidden;
      transition:
        transform 140ms ease,
        opacity 100ms ease,
        visibility 0s linear 140ms;
    }

    @media (prefers-reduced-motion: reduce) {
      #${WINDOW_CHROME_ID} {
        transition: none;
      }
    }

    #${WINDOW_CHROME_ID}[data-focused="false"] {
      color: color-mix(
        in srgb,
        #f5f5f5 62%,
        transparent
      );
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-drag-region {
      min-width: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-self: stretch;
      gap: 6px;
      padding: 0 8px;
      background: transparent;
      cursor: default;
      pointer-events: auto;
      -webkit-app-region: drag;
      app-region: drag;
    }

    #${WINDOW_CHROME_ID}[data-fullscreen="true"]
      .rvn-window-chrome-drag-region {
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-app-menu {
      all: unset;
      box-sizing: border-box;
      flex: 0 0 auto;
      display: inline-flex;
      width: 16px;
      height: 16px;
      align-items: center;
      justify-content: center;
      cursor: default;
      pointer-events: auto;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-app-menu:focus-visible {
      outline: 2px solid var(--ring, #7aa2ff);
      outline-offset: 1px;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-icon {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      pointer-events: none;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: none;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-controls {
      display: flex;
      align-items: stretch;
      height: 100%;
      background: transparent;
      pointer-events: auto;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control {
      all: unset;
      box-sizing: border-box;
      position: relative;
      display: inline-flex;
      width: var(--rvn-window-control-width);
      height: 100%;
      align-items: center;
      justify-content: center;
      background-color: #202020;
      color: inherit;
      cursor: default;
      transition-property: background-color, color;
      transition-duration: 100ms;
      transition-timing-function: linear;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control:hover {
      transition-duration: 0ms;
      background-color: #2d2d2d;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control:active {
      transition-duration: 0ms;
      background-color: color-mix(
        in srgb,
        #f5f5f5 18%,
        transparent
      );
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control:focus-visible {
      outline: 2px solid var(--ring, #7aa2ff);
      outline-offset: -2px;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control:disabled {
      opacity: 0.38;
      pointer-events: none;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control-close:hover,
    #${WINDOW_CHROME_ID} .rvn-window-chrome-control-close:active {
      background-color: #c42b1c;
      color: #ffffff;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control svg {
      width: 12px;
      height: 12px;
      overflow: visible;
      fill: none;
      stroke: currentColor;
      stroke-linecap: square;
      stroke-linejoin: miter;
      stroke-width: 1;
      pointer-events: none;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-icon-exit-fullscreen {
      display: none;
    }

    #${WINDOW_CHROME_ID}[data-expanded="true"]
      .rvn-window-chrome-icon-enter-fullscreen {
      display: none;
    }

    #${WINDOW_CHROME_ID}[data-expanded="true"]
      .rvn-window-chrome-icon-exit-fullscreen {
      display: block;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-status {
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: 40vw;
      overflow: hidden;
      transform: translate(-50%, -50%);
      padding: 4px 8px;
      border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
      border-radius: 6px;
      background: var(--surface, #1f1f1f);
      color: var(--destructive, #ff6b6b);
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: none;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-status[hidden] {
      display: none;
    }
  `;

  const markup = `
    <div class="rvn-window-chrome-drag-region" data-tauri-drag-region>
      <button
        class="rvn-window-chrome-app-menu"
        type="button"
        aria-label="Window menu"
      >
        <img
          class="rvn-window-chrome-icon"
          src="${DEFAULT_APP_ICON}"
          alt=""
          draggable="false"
        />
      </button>
      <span class="rvn-window-chrome-title" data-tauri-drag-region>
        ${DEFAULT_APP_TITLE}
      </span>
    </div>
    <span
      class="rvn-window-chrome-status"
      role="status"
      aria-live="polite"
      hidden
    ></span>
    <div class="rvn-window-chrome-controls" aria-label="Window controls">
      <button
        class="rvn-window-chrome-control"
        type="button"
        data-window-action="minimize"
        aria-label="Minimize"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1.5 6.5h9" />
        </svg>
      </button>
      <button
        class="rvn-window-chrome-control"
        type="button"
        data-window-action="fullscreen"
        aria-label="Enter fullscreen"
        aria-keyshortcuts="F11"
        aria-pressed="false"
      >
        <svg
          class="rvn-window-chrome-icon-enter-fullscreen"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
        </svg>
        <svg
          class="rvn-window-chrome-icon-exit-fullscreen"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path d="M3.5 3.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
          <rect x="1.5" y="3.5" width="7" height="7" rx="1" />
        </svg>
      </button>
      <button
        class="rvn-window-chrome-control rvn-window-chrome-control-close"
        type="button"
        data-window-action="close"
        aria-label="Close"
        aria-keyshortcuts="Alt+F4"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m1.5 1.5 9 9m0-9-9 9" />
        </svg>
      </button>
    </div>
  `;

  const mountWindowChrome = async () => {
    if (!document.body || document.getElementById(WINDOW_CHROME_ID)) {
      return;
    }

    const tauriApi = globalThis.__TAURI__;
    const windowApi = tauriApi?.window;
    const invoke = tauriApi?.core?.invoke;
    if (!windowApi?.getCurrentWindow) {
      return;
    }

    let appWindow;
    try {
      appWindow = windowApi.getCurrentWindow();
    } catch (error) {
      console.error("Failed to initialize custom window controls.", error);
      return;
    }

    const styleElement = document.createElement("style");
    styleElement.id = `${WINDOW_CHROME_ID}-styles`;
    styleElement.textContent = styles;
    document.head.append(styleElement);

    const chrome = document.createElement("header");
    chrome.id = WINDOW_CHROME_ID;
    chrome.dataset.expanded = "false";
    chrome.dataset.focused = "true";
    chrome.dataset.fullscreen = "false";
    chrome.dataset.maximized = "false";
    chrome.dataset.revealed = "true";
    chrome.setAttribute("aria-label", "Application window");
    chrome.innerHTML = markup;
    chrome.style.visibility = "hidden";
    document.body.prepend(chrome);

    const minimizeButton = chrome.querySelector(
      '[data-window-action="minimize"]',
    );
    const appMenuButton = chrome.querySelector(".rvn-window-chrome-app-menu");
    const appIcon = chrome.querySelector(".rvn-window-chrome-icon");
    const appTitle = chrome.querySelector(".rvn-window-chrome-title");
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );
    const closeButton = chrome.querySelector('[data-window-action="close"]');
    const status = chrome.querySelector(".rvn-window-chrome-status");
    const dragRegionNodes = chrome.querySelectorAll(
      ".rvn-window-chrome-drag-region, .rvn-window-chrome-title",
    );
    const controlButtons = chrome.querySelectorAll(
      ".rvn-window-chrome-control",
    );

    const state = {
      actionPending: false,
      focused: true,
      fullscreen: false,
      maximized: false,
      revealed: true,
    };
    let appMenuTimer;
    let statusTimer;
    let statePollTimer;
    let stateSettleTimer;
    let syncRevision = 0;
    const unlisteners = [];

    const syncBranding = () => {
      appTitle.textContent = document.title.trim() || DEFAULT_APP_TITLE;
      const documentIcon = document.querySelector('link[rel~="icon"][href]');
      appIcon.src = documentIcon?.href ?? DEFAULT_APP_ICON;
    };
    const brandingObserver = new MutationObserver(syncBranding);
    brandingObserver.observe(document.head, {
      attributes: true,
      attributeFilter: ["href", "rel"],
      characterData: true,
      childList: true,
      subtree: true,
    });
    syncBranding();

    const applyState = () => {
      const expanded = state.fullscreen || state.maximized;
      chrome.dataset.expanded = String(expanded);
      chrome.dataset.focused = String(state.focused);
      chrome.dataset.fullscreen = String(state.fullscreen);
      chrome.dataset.maximized = String(state.maximized);
      chrome.dataset.revealed = String(
        (!state.fullscreen && !state.maximized) || state.revealed,
      );

      if (document.documentElement.dataset.rvnWindowChrome === "custom") {
        document.documentElement.dataset.rvnWindowFullscreen = String(
          state.fullscreen,
        );
        document.documentElement.dataset.rvnWindowMaximized = String(
          state.maximized,
        );
        document.documentElement.dataset.rvnWindowExpanded = String(expanded);
      }

      controlButtons.forEach((button) => {
        button.disabled = state.actionPending;
      });

      let fullscreenLabel = "Enter fullscreen";
      if (state.fullscreen) {
        fullscreenLabel = "Exit fullscreen";
      } else if (state.maximized) {
        fullscreenLabel = "Restore window";
      }
      fullscreenButton.setAttribute("aria-label", fullscreenLabel);
      fullscreenButton.setAttribute("aria-pressed", String(expanded));

      dragRegionNodes.forEach((node) => {
        if (state.fullscreen) {
          node.removeAttribute("data-tauri-drag-region");
          return;
        }
        node.setAttribute("data-tauri-drag-region", "");
      });
    };

    const reportFailure = (action, error) => {
      console.error(`Failed to ${action.toLowerCase()} window.`, error);
      status.textContent = `${action} failed`;
      status.hidden = false;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        status.hidden = true;
        status.textContent = "";
      }, 4000);
    };

    const syncWindowState = async () => {
      const revision = ++syncRevision;
      try {
        const [fullscreen, maximized] = await Promise.all([
          appWindow.isFullscreen(),
          appWindow.isMaximized(),
        ]);
        if (revision !== syncRevision) {
          return;
        }
        const enteredFullscreen = fullscreen && !state.fullscreen;
        const enteredMaximized =
          maximized && !fullscreen && (!state.maximized || state.fullscreen);
        state.fullscreen = fullscreen;
        state.maximized = maximized;
        if (enteredFullscreen || enteredMaximized) {
          state.revealed = false;
        } else if (!maximized && !fullscreen) {
          state.revealed = true;
        }
        applyState();
      } catch (error) {
        if (revision === syncRevision) {
          reportFailure("Update window controls", error);
        }
      }
    };

    const scheduleWindowStateSync = () => {
      syncWindowState();
      clearTimeout(stateSettleTimer);
      stateSettleTimer = setTimeout(
        syncWindowState,
        WINDOW_STATE_SETTLE_DELAY_MS,
      );
    };

    const pollWindowState = () => {
      if (state.focused && document.visibilityState === "visible") {
        syncWindowState();
      }
    };

    const runWindowAction = async (action, callback) => {
      if (state.actionPending) {
        return;
      }
      state.actionPending = true;
      applyState();
      try {
        await callback();
        await syncWindowState();
      } catch (error) {
        reportFailure(action, error);
      } finally {
        state.actionPending = false;
        applyState();
      }
    };

    const toggleExpandedWindow = async () => {
      if (!state.fullscreen && !state.maximized) {
        await appWindow.setFullscreen(true);
        return;
      }

      const wasFullscreen = state.fullscreen;
      const wasMaximized = state.maximized;
      if (wasFullscreen) {
        await appWindow.setFullscreen(false);
      }
      if (wasMaximized) {
        await appWindow.unmaximize();
      }
    };

    const toggleFullscreen = async () => {
      await appWindow.setFullscreen(!state.fullscreen);
    };

    const openSystemMenu = async () => {
      if (!invoke) {
        throw new Error("Tauri invoke API is unavailable");
      }
      await invoke("show_windows_system_menu");
    };

    const handleAppMenuClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(appMenuTimer);
      if (event.detail > 1) {
        return;
      }
      appMenuTimer = setTimeout(() => {
        runWindowAction("Open window menu", openSystemMenu);
      }, APP_ICON_MENU_DELAY_MS);
    };

    const handleAppMenuContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(appMenuTimer);
      runWindowAction("Open window menu", openSystemMenu);
    };

    const handleAppMenuDoubleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(appMenuTimer);
      runWindowAction("Close", () => appWindow.close());
    };

    minimizeButton.addEventListener("click", () => {
      runWindowAction("Minimize", () => appWindow.minimize());
    });
    fullscreenButton.addEventListener("click", () => {
      runWindowAction("Toggle fullscreen", toggleExpandedWindow);
    });
    closeButton.addEventListener("click", () => {
      runWindowAction("Close", () => appWindow.close());
    });

    const handleKeyDown = (event) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "F11") {
        event.preventDefault();
        runWindowAction("Toggle fullscreen", toggleFullscreen);
        return;
      }
      if (event.key === "Escape" && (state.fullscreen || state.maximized)) {
        event.preventDefault();
        runWindowAction("Restore window", toggleExpandedWindow);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleWindowStateSync();
      }
    };
    const handlePointerMove = (event) => {
      if (!state.maximized && !state.fullscreen) {
        return;
      }
      const revealLimit = state.revealed
        ? AUTO_HIDE_REVEAL_LIMIT_PX
        : AUTO_HIDE_REVEAL_OFFSET_PX;
      const revealed = event.clientY >= 0 && event.clientY <= revealLimit;
      if (revealed !== state.revealed) {
        state.revealed = revealed;
        applyState();
      }
    };
    const registerWindowListeners = async () => {
      try {
        unlisteners.push(
          await appWindow.onResized(() => {
            scheduleWindowStateSync();
          }),
        );
        unlisteners.push(
          await appWindow.onFocusChanged(({ payload: focused }) => {
            state.focused = focused;
            if (!focused && (state.maximized || state.fullscreen)) {
              state.revealed = false;
            }
            applyState();
            if (focused) {
              scheduleWindowStateSync();
            }
          }),
        );
      } catch (error) {
        reportFailure("Monitor window state", error);
      }
    };

    const cleanup = () => {
      clearTimeout(appMenuTimer);
      clearTimeout(statusTimer);
      clearInterval(statePollTimer);
      clearTimeout(stateSettleTimer);
      brandingObserver.disconnect();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      appMenuButton.removeEventListener("click", handleAppMenuClick);
      appMenuButton.removeEventListener(
        "contextmenu",
        handleAppMenuContextMenu,
      );
      appMenuButton.removeEventListener("dblclick", handleAppMenuDoubleClick);
      unlisteners.splice(0).forEach((unlisten) => unlisten());
    };
    applyState();

    try {
      await appWindow.setDecorations(false);
    } catch (error) {
      brandingObserver.disconnect();
      chrome.remove();
      styleElement.remove();
      console.error("Failed to enable custom window controls.", error);
      return;
    }

    chrome.style.visibility = "";
    document.documentElement.dataset.rvnWindowChrome = "custom";
    applyState();
    appMenuButton.addEventListener("click", handleAppMenuClick);
    appMenuButton.addEventListener("contextmenu", handleAppMenuContextMenu);
    appMenuButton.addEventListener("dblclick", handleAppMenuDoubleClick);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", cleanup, { once: true });
    scheduleWindowStateSync();
    statePollTimer = setInterval(
      pollWindowState,
      WINDOW_STATE_POLL_INTERVAL_MS,
    );
    registerWindowListeners();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWindowChrome, {
      once: true,
    });
    return;
  }
  mountWindowChrome();
})();
