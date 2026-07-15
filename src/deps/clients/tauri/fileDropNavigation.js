const FILE_DRAG_TYPE = "Files";
const LISTENER_OPTIONS = { capture: true };

const containsFiles = (event) => {
  const dataTransfer = event.dataTransfer;
  const types = Array.from(dataTransfer?.types ?? []);
  if (types.includes(FILE_DRAG_TYPE)) {
    return true;
  }

  const items = Array.from(dataTransfer?.items ?? []);
  if (items.some((item) => item.kind === "file")) {
    return true;
  }

  return (dataTransfer?.files?.length ?? 0) > 0;
};

export const setupFileDropNavigationGuard = ({ target = window } = {}) => {
  const preventFileDropNavigation = (event) => {
    if (!containsFiles(event)) {
      return;
    }

    event.preventDefault();
  };

  target.addEventListener(
    "dragover",
    preventFileDropNavigation,
    LISTENER_OPTIONS,
  );
  target.addEventListener("drop", preventFileDropNavigation, LISTENER_OPTIONS);

  return () => {
    target.removeEventListener(
      "dragover",
      preventFileDropNavigation,
      LISTENER_OPTIONS,
    );
    target.removeEventListener(
      "drop",
      preventFileDropNavigation,
      LISTENER_OPTIONS,
    );
  };
};
