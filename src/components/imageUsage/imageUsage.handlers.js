import { createAnimationEditorPayload } from "../../internal/animationEditorRoute.js";
import { createLayoutEditorPayload } from "../../internal/layoutEditorRoute.js";
import { createParticleEditorPayload } from "../../internal/particleEditorRoute.js";

const FOLDER_MODE = "blocked-folder-delete";

// The blocked-delete modes show only the dialog. Closing it is up to the
// page that opened it.
const isBlockedDeleteMode = ({ mode }) =>
  mode === "blocked-delete" || mode === FOLDER_MODE;

// The image, or the folder, whose usage the component shows.
const selectSubjectId = (props) =>
  props.mode === FOLDER_MODE ? props.folderId : props.imageId;

const closeBlockedDeleteDialog = ({ dispatchEvent }) => {
  dispatchEvent(new CustomEvent("close"));
};

// Finding the usage reads every scene, so it is loaded when the image is
// shown and when the full list opens, not on every project change. The
// delete itself checks the usage again.
const loadUsage = async (deps, { subjectId } = {}) => {
  const { appService, i18n, projectService, props, render, store } = deps;
  if (!subjectId) {
    return;
  }

  store.startUsageLoad({ subjectId });
  render();

  let usages = [];
  let usedImages = [];
  try {
    if (props.mode === FOLDER_MODE) {
      const folderUsage = await projectService.getImageFolderUsage({
        folderId: subjectId,
      });
      usedImages = folderUsage.images;
    } else {
      const usage = await projectService.getImageUsage({ imageId: subjectId });
      usages = usage.usages;
    }
  } catch (error) {
    console.error("Failed to load where the image is used:", error);
    store.failUsageLoad({ subjectId });
    render();
    // The panel shows the failure in place. A blocked-delete dialog has no
    // list to show it in.
    if (isBlockedDeleteMode(props)) {
      appService.showToast({ message: i18n.imageUsage.loadFailed });
      closeBlockedDeleteDialog(deps);
    }
    return;
  }

  store.finishUsageLoad({ subjectId, usages, usedImages });
  render();

  // Nothing is left to list once the last place stops using the image.
  if (
    isBlockedDeleteMode(props) &&
    store.selectUsageSubjectId() === subjectId &&
    usages.length === 0 &&
    usedImages.length === 0
  ) {
    closeBlockedDeleteDialog(deps);
  }
};

const focusDialogList = ({ refs }) => {
  requestAnimationFrame(() => {
    refs.dialogList?.focus?.();
  });
};

const scrollActiveRowIntoView = ({ refs, store }) => {
  const activeRowId = store.selectActiveRowId();
  requestAnimationFrame(() => {
    const activeRow = Object.values(refs).find(
      (element) => element?.dataset?.rowId === activeRowId,
    );
    activeRow?.scrollIntoView?.({ block: "nearest" });
  });
};

const openUsageTarget = (deps, { target } = {}) => {
  const { appService } = deps;
  const payload = appService.getPayload() ?? {};

  if (target.type === "scene") {
    const nextPayload = { ...payload, s: target.sceneId };
    delete nextPayload.sceneId;
    delete nextPayload.sectionId;
    delete nextPayload.lineId;
    delete nextPayload.entryLineId;
    if (target.sectionId) {
      nextPayload.sectionId = target.sectionId;
    }
    if (target.lineId) {
      nextPayload.entryLineId = target.lineId;
    }
    appService.navigate("/project/scene-editor", nextPayload);
    return;
  }

  if (target.type === "layout" || target.type === "control") {
    appService.navigate(
      "/project/layout-editor",
      createLayoutEditorPayload({
        payload,
        layoutId: target.id,
        resourceType: target.type === "control" ? "controls" : "layouts",
      }),
    );
    return;
  }

  if (target.type === "animation") {
    appService.navigate(
      "/project/animation-editor",
      createAnimationEditorPayload({ payload, animationId: target.id }),
    );
    return;
  }

  if (target.type === "particle") {
    appService.navigate(
      "/project/particle-editor",
      createParticleEditorPayload({ payload, particleId: target.id }),
    );
    return;
  }

  appService.navigate("/project/releases/platform-details", payload);
};

export const handleAfterMount = async (deps) => {
  const { props } = deps;
  if (isBlockedDeleteMode(props)) {
    focusDialogList(deps);
  }
  await loadUsage(deps, { subjectId: selectSubjectId(props) });
  if (isBlockedDeleteMode(props)) {
    focusDialogList(deps);
  }
};

export const handleOnUpdate = async (deps, changes = {}) => {
  const { store } = deps;
  const { oldProps, newProps } = changes;
  const subjectId = selectSubjectId(newProps);

  if (selectSubjectId(oldProps) !== subjectId) {
    store.closeDialog();
    await loadUsage(deps, { subjectId });
  }
};

// Opens the full list with the usage the panel shows, then loads it again in
// case the project changed since.
export const handleShowAllClick = async (deps) => {
  const { render, store } = deps;

  store.openDialog();
  render();
  focusDialogList(deps);
  await loadUsage(deps, { subjectId: store.selectUsageSubjectId() });
};

export const handlePanelRowClick = (deps, payload) => {
  const { store } = deps;
  const { rowId } = payload._event.currentTarget.dataset;
  const row = store.selectPanelRow({ rowId });
  if (!row) {
    return;
  }

  openUsageTarget(deps, { target: row.target });
};

export const handlePanelRowKeyDown = (deps, payload) => {
  const { key } = payload._event;
  if (key !== "Enter" && key !== " ") {
    return;
  }

  payload._event.preventDefault();
  handlePanelRowClick(deps, payload);
};

export const handleDialogClose = (deps) => {
  const { props, render, store } = deps;

  if (isBlockedDeleteMode(props)) {
    closeBlockedDeleteDialog(deps);
    return;
  }

  store.closeDialog();
  render();
};

// A scene row shows or hides its lines. Every other row opens the place it
// names.
const activateDialogRow = (deps, { row } = {}) => {
  const { props, render, store } = deps;

  if (row.kind === "scene" && row.canExpand) {
    store.setRowExpanded({ rowId: row.rowId, expanded: !row.isExpanded });
    render();
    return;
  }

  if (isBlockedDeleteMode(props)) {
    closeBlockedDeleteDialog(deps);
  } else {
    store.closeDialog();
    render();
  }
  openUsageTarget(deps, { target: row.target });
};

export const handleDialogRowClick = (deps, payload) => {
  const { store } = deps;
  const { rowId } = payload._event.currentTarget.dataset;
  const row = store.selectDialogRow({ rowId });
  if (!row) {
    return;
  }

  // A click hands the list back to the mouse, so no row stays marked.
  store.setActiveRowId({ rowId: undefined });
  activateDialogRow(deps, { row });
  focusDialogList(deps);
};

export const handleDialogListKeyDown = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  const rows = store.selectDialogRows();
  const activeIndex = rows.findIndex(
    (row) => row.rowId === store.selectActiveRowId(),
  );
  const activeRow = rows[activeIndex];
  const setActiveRow = (row) => {
    if (!row) {
      return;
    }

    store.setActiveRowId({ rowId: row.rowId });
    render();
    scrollActiveRowIntoView(deps);
  };

  if (event.key === "ArrowDown") {
    event.preventDefault();
    setActiveRow(rows[Math.min(activeIndex + 1, rows.length - 1)]);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setActiveRow(rows[Math.max(activeIndex - 1, 0)]);
    return;
  }

  if (!activeRow) {
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    if (activeRow.kind === "scene" && activeRow.canExpand) {
      if (activeRow.isExpanded) {
        setActiveRow(rows[activeIndex + 1]);
        return;
      }

      store.setRowExpanded({ rowId: activeRow.rowId, expanded: true });
      render();
    }
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (activeRow.kind === "line") {
      setActiveRow(rows.find((row) => row.rowId === activeRow.sceneRowId));
      return;
    }

    if (activeRow.kind === "scene" && activeRow.isExpanded) {
      store.setRowExpanded({ rowId: activeRow.rowId, expanded: false });
      render();
    }
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activateDialogRow(deps, { row: activeRow });
  }
};
