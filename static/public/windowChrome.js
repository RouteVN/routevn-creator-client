(() => {
  const WINDOW_CHROME_ID = "rvn-window-chrome";
  const WINDOW_CHROME_HEIGHT_PX = 32;
  const AUTO_HIDE_REVEAL_OFFSET_PX = 16;
  const AUTO_HIDE_REVEAL_LIMIT_PX =
    WINDOW_CHROME_HEIGHT_PX + AUTO_HIDE_REVEAL_OFFSET_PX;
  const APP_TITLE = "RouteVN Creator";
  const APP_ICON =
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
      background: var(--surface, #1f1f1f);
      color: var(--foreground, #f5f5f5);
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
        var(--foreground, #f5f5f5) 62%,
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
      gap: 8px;
      padding: 0 10px;
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

    #${WINDOW_CHROME_ID} .rvn-window-chrome-icon {
      flex: 0 0 auto;
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
      border-left: 1px solid var(--border, rgba(255, 255, 255, 0.1));
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
      color: inherit;
      cursor: default;
      -webkit-app-region: no-drag;
      app-region: no-drag;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control:hover {
      background: color-mix(
        in srgb,
        var(--foreground, #f5f5f5) 11%,
        transparent
      );
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-control:active {
      background: color-mix(
        in srgb,
        var(--foreground, #f5f5f5) 18%,
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
      background: #c42b1c;
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
      stroke-width: 1.2;
      pointer-events: none;
    }

    #${WINDOW_CHROME_ID} .rvn-window-chrome-icon-exit-fullscreen {
      display: none;
    }

    #${WINDOW_CHROME_ID}[data-fullscreen="true"]
      .rvn-window-chrome-icon-enter-fullscreen {
      display: none;
    }

    #${WINDOW_CHROME_ID}[data-fullscreen="true"]
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
      <img
        class="rvn-window-chrome-icon"
        src="${APP_ICON}"
        alt=""
        draggable="false"
        data-tauri-drag-region
      />
      <span class="rvn-window-chrome-title" data-tauri-drag-region>
        ${APP_TITLE}
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
          <path d="M1 9.5h10" />
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
          <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" />
        </svg>
        <svg
          class="rvn-window-chrome-icon-exit-fullscreen"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path d="M4 1v3H1M11 4H8V1M8 11V8h3M1 8h3v3" />
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

    const windowApi = globalThis.__TAURI__?.window;
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
    const fullscreenButton = chrome.querySelector(
      '[data-window-action="fullscreen"]',
    );
    const closeButton = chrome.querySelector('[data-window-action="close"]');
    const status = chrome.querySelector(".rvn-window-chrome-status");
    const dragRegionNodes = chrome.querySelectorAll(
      ".rvn-window-chrome-drag-region, .rvn-window-chrome-icon, .rvn-window-chrome-title",
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
    let statusTimer;
    let syncRevision = 0;
    const unlisteners = [];

    const applyState = () => {
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
      }

      controlButtons.forEach((button) => {
        button.disabled = state.actionPending;
      });

      const fullscreenLabel = state.fullscreen
        ? "Exit fullscreen"
        : "Enter fullscreen";
      fullscreenButton.setAttribute("aria-label", fullscreenLabel);
      fullscreenButton.setAttribute("aria-pressed", String(state.fullscreen));

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

    minimizeButton.addEventListener("click", () => {
      runWindowAction("Minimize", () => appWindow.minimize());
    });
    fullscreenButton.addEventListener("click", () => {
      runWindowAction("Toggle fullscreen", () =>
        appWindow.setFullscreen(!state.fullscreen),
      );
    });
    closeButton.addEventListener("click", () => {
      runWindowAction("Close", () => appWindow.close());
    });

    const handleKeyDown = (event) => {
      if (event.key === "F11") {
        event.preventDefault();
        fullscreenButton.click();
        return;
      }
      if (event.key === "Escape" && state.fullscreen) {
        event.preventDefault();
        runWindowAction("Exit fullscreen", () =>
          appWindow.setFullscreen(false),
        );
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncWindowState();
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
            syncWindowState();
          }),
        );
        unlisteners.push(
          await appWindow.onFocusChanged(({ payload: focused }) => {
            state.focused = focused;
            if (!focused && (state.maximized || state.fullscreen)) {
              state.revealed = false;
            }
            applyState();
          }),
        );
      } catch (error) {
        reportFailure("Monitor window state", error);
      }
    };

    const cleanup = () => {
      clearTimeout(statusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unlisteners.splice(0).forEach((unlisten) => unlisten());
    };
    applyState();

    try {
      await appWindow.setDecorations(false);
    } catch (error) {
      chrome.remove();
      styleElement.remove();
      console.error("Failed to enable custom window controls.", error);
      return;
    }

    chrome.style.visibility = "";
    document.documentElement.dataset.rvnWindowChrome = "custom";
    applyState();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", cleanup, { once: true });
    syncWindowState();
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
