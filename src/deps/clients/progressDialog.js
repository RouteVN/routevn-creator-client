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
  const progressTrack = createRtglElement(root, "rtgl-view", {
    "data-progress-track": "",
    role: "progressbar",
    "aria-label": title,
    "aria-valuemin": "0",
    w: "f",
    h: "6",
    br: "full",
    pos: "rel",
    bgc: "su",
    style: "overflow: hidden; background-color: var(--surface);",
  });
  const progressFill = createRtglElement(root, "rtgl-view", {
    "data-progress-fill": "",
    h: "f",
    bgc: "ac",
    br: "full",
  });
  const progressStyle = createRtglElement(root, "style");
  progressStyle.textContent = `
    @keyframes routevn-progress-indeterminate {
      0% { transform: translateX(-100%); }
      50% { transform: translateX(170%); }
      100% { transform: translateX(440%); }
    }
  `;
  progressTrack.append(progressStyle, progressFill);

  const setStatus = (value) => {
    if (value === undefined || value === "") {
      statusText.remove();
      return;
    }
    statusText.textContent = value;
    progressTrack.setAttribute("aria-valuetext", value);
    if (statusText.parentNode !== content) {
      content.append(statusText);
    }
  };

  const setProgress = (value) => {
    if (value === undefined) {
      progressTrack.remove();
      return;
    }

    const current = Number(value?.current);
    const total = Number(value?.total);
    if (Number.isFinite(total) && total > 0) {
      const clampedCurrent = Number.isFinite(current)
        ? Math.min(Math.max(current, 0), total)
        : 0;
      const percent = (clampedCurrent / total) * 100;
      progressFill.setAttribute(
        "style",
        `width: ${percent}%; transition: width 0.15s ease;`,
      );
      progressTrack.setAttribute("aria-valuemax", String(total));
      progressTrack.setAttribute("aria-valuenow", String(clampedCurrent));
    } else {
      progressFill.setAttribute(
        "style",
        "width: 30%; animation: routevn-progress-indeterminate 1.2s ease-in-out infinite;",
      );
      progressTrack.removeAttribute("aria-valuemax");
      progressTrack.removeAttribute("aria-valuenow");
    }

    if (progressTrack.parentNode !== content) {
      content.append(progressTrack);
    }
  };

  header.append(titleText, messageText);
  content.append(header);
  setStatus(status);
  setProgress(progress);
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
        progressTrack.setAttribute("aria-label", options.title);
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
