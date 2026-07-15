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
    status = "",
  } = {},
  root = typeof document === "undefined" ? undefined : document,
) => {
  if (!root?.body) {
    return {
      close: () => {},
      update: () => {},
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

  header.append(titleText, messageText);
  content.append(header, statusText);
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
        statusText.textContent = options.status;
      }
    },
  };
};
