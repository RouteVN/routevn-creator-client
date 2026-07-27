const DEFAULT_PROGRESS_DIALOG_ID = "routevn-progress-dialog";

const createRtglElement = (root, tagName, attributes = {}, textContent) => {
  const element = root.createElement(tagName);

  Object.entries(attributes).forEach(([name, value]) => {
    if (value === true) {
      element.setAttribute(name, "");
    } else if (value !== false && value !== undefined) {
      element.setAttribute(name, value);
    }
  });

  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  return element;
};

export const createProgressDialog = (
  {
    id = DEFAULT_PROGRESS_DIALOG_ID,
    title = "",
    message = "",
    status,
    progress,
    actionLabel,
    actionDisabled = false,
    onAction,
  } = {},
  root = typeof document === "undefined" ? undefined : document,
) => {
  if (!root?.body) {
    return {
      close: () => {},
      update: () => {},
      waitForPaint: async () => {},
    };
  }

  root.getElementById(id)?.remove();

  const dialog = createRtglElement(root, "rtgl-dialog", {
    id,
    open: true,
    s: "sm",
  });
  dialog.addEventListener("close", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const content = createRtglElement(root, "rtgl-view", {
    slot: "content",
    g: "lg",
    p: "lg",
  });
  const header = createRtglElement(root, "rtgl-view", { g: "sm", w: "f" });
  const titleText = createRtglElement(root, "rtgl-text", { s: "lg" }, title);
  const messageText = createRtglElement(
    root,
    "rtgl-text",
    { c: "mu-fg" },
    message,
  );
  const statusText = createRtglElement(
    root,
    "rtgl-text",
    { c: "mu-fg" },
    status,
  );
  const progressElement = createRtglElement(root, "progress", {
    role: "progressbar",
    "aria-valuemin": "0",
    style: "width: 100%;",
  });
  const actions = createRtglElement(root, "rtgl-view", {
    d: "h",
    ah: "e",
    w: "f",
  });
  const actionButton = createRtglElement(
    root,
    "rtgl-button",
    { v: "se" },
    actionLabel,
  );

  const setActionDisabled = (disabled) => {
    actionButton.toggleAttribute("disabled", Boolean(disabled));
  };
  setActionDisabled(actionDisabled);
  actionButton.addEventListener("click", () => {
    if (actionButton.hasAttribute("disabled")) {
      return;
    }
    setActionDisabled(true);
    onAction?.();
  });

  const setStatus = (value) => {
    if (value === undefined || value === "") {
      statusText.remove();
      return;
    }
    statusText.textContent = value;
    if (statusText.parentNode !== content) {
      content.append(statusText);
    }
  };

  const setProgress = (value) => {
    if (value === undefined) {
      progressElement.remove();
      return;
    }

    const current = Number(value?.current);
    const total = Number(value?.total);
    if (Number.isFinite(total) && total > 0) {
      const clampedCurrent = Number.isFinite(current)
        ? Math.min(Math.max(current, 0), total)
        : 0;
      progressElement.max = total;
      progressElement.value = clampedCurrent;
      progressElement.setAttribute("aria-valuemax", String(total));
      progressElement.setAttribute("aria-valuenow", String(clampedCurrent));
    } else {
      progressElement.removeAttribute("max");
      progressElement.removeAttribute("value");
      progressElement.removeAttribute("aria-valuemax");
      progressElement.removeAttribute("aria-valuenow");
    }

    if (progressElement.parentNode !== content) {
      content.append(progressElement);
    }
  };

  header.append(titleText, messageText);
  content.append(header);
  setProgress(progress);
  setStatus(status);
  if (actionLabel) {
    actions.append(actionButton);
    content.append(actions);
  }
  dialog.append(content);
  root.body.append(dialog);

  return {
    close() {
      dialog.removeAttribute("open");
      dialog.remove();
    },
    update(options = {}) {
      if (options.title !== undefined) {
        titleText.textContent = options.title;
      }
      if (options.message !== undefined) {
        messageText.textContent = options.message;
      }
      if (options.status !== undefined) {
        setStatus(options.status);
      }
      if (Object.hasOwn(options, "progress")) {
        setProgress(options.progress);
      }
      if (options.actionDisabled !== undefined) {
        setActionDisabled(options.actionDisabled);
      }
    },
    async waitForPaint() {
      await new Promise((resolve) => {
        const window = root.defaultView;
        if (typeof window?.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => {
            window.setTimeout(resolve, 0);
          });
          return;
        }
        if (typeof window?.setTimeout === "function") {
          window.setTimeout(resolve, 0);
          return;
        }
        resolve();
      });
    },
  };
};
