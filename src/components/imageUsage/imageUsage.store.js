import {
  formatI18nCopy,
  formatPluralCopy,
  selectI18nCopy,
} from "../../internal/ui/i18nCopy.js";

// The detail panel lists this many places. The rest are in the dialog.
const PANEL_ROW_LIMIT = 10;
const LINE_ROW_INDENT = 32;

const USAGE_GROUPS = [
  { type: "scene", icon: "scene" },
  { type: "layout", icon: "layout" },
  { type: "control", icon: "control" },
  { type: "animation", icon: "animation" },
  { type: "particle", icon: "particles" },
  { type: "platformDetails", icon: "rocket" },
];

const PLATFORM_LABEL_KEYS = {
  web: "webTabLabel",
  windows: "windowsTabLabel",
  macos: "macosTabLabel",
  android: "androidTabLabel",
  ios: "iosTabLabel",
};

const PLATFORM_FIELD_LABEL_KEYS = {
  iconFileId: "iconLabel",
  adaptiveIconFileId: "androidAdaptiveIconLabel",
  splashIconFileId: "androidSplashIconLabel",
  loadingBackgroundFileId: "webLoadingBackgroundLabel",
  startBackgroundFileId: "webStartBackgroundLabel",
};

// The line actions that show an image, by the name the scene editor gives
// them.
const LINE_ACTION_LABEL_KEYS = {
  background: "Background",
  visual: "Visual",
};

const FOLDER_MODE = "blocked-folder-delete";

export const createInitialState = () => ({
  // The image, or the folder, whose usage is shown.
  subjectId: undefined,
  status: "loading",
  // Where the image is used.
  usages: [],
  // The images in the folder that cannot be deleted, each with where it is
  // used.
  usedImages: [],
  isDialogOpen: false,
  expandedRowIds: [],
  activeRowId: undefined,
});

// The rows for one place. A scene's lines follow it while it is expanded.
const addUsageRows = (rows, { usage, rowIdPrefix, expandedRowIds }) => {
  if (usage.type === "scene") {
    const sceneRowId = `${rowIdPrefix}scene:${usage.id}`;
    const isExpanded = expandedRowIds.includes(sceneRowId);
    rows.push({
      rowId: sceneRowId,
      kind: "scene",
      usage,
      isExpanded,
      canExpand: usage.lines.length > 0,
      target: { type: "scene", sceneId: usage.id },
    });

    if (isExpanded) {
      usage.lines.forEach((line, lineIndex) => {
        rows.push({
          rowId: `${rowIdPrefix}line:${usage.id}:${lineIndex}`,
          kind: "line",
          sceneRowId,
          line,
          target: {
            type: "scene",
            sceneId: usage.id,
            sectionId: line.sectionId,
            lineId: line.lineId,
          },
        });
      });
    }
    return;
  }

  if (usage.type === "platformDetails") {
    rows.push({
      rowId: `${rowIdPrefix}platformDetails:${usage.platform}:${usage.property}`,
      kind: "item",
      usage,
      target: { type: "platformDetails" },
    });
    return;
  }

  rows.push({
    rowId: `${rowIdPrefix}${usage.type}:${usage.id}`,
    kind: "item",
    usage,
    target: { type: usage.type, id: usage.id },
  });
};

// The rows of the full list, without their text. An image's places are
// grouped by kind. A folder's are grouped by the image that is used.
const buildDialogRows = ({ usages, usedImages, expandedRowIds }) => {
  const rows = [];

  for (const image of usedImages) {
    rows.push({
      rowId: `group:image:${image.id}`,
      kind: "group",
      image,
      count: image.usages.length,
    });

    for (const usage of image.usages) {
      addUsageRows(rows, {
        usage,
        rowIdPrefix: `image:${image.id}:`,
        expandedRowIds,
      });
    }
  }

  for (const { type } of USAGE_GROUPS) {
    const groupUsages = usages.filter((usage) => usage.type === type);
    if (groupUsages.length === 0) {
      continue;
    }

    rows.push({
      rowId: `group:${type}`,
      kind: "group",
      type,
      count: groupUsages.length,
    });

    for (const usage of groupUsages) {
      addUsageRows(rows, { usage, rowIdPrefix: "", expandedRowIds });
    }
  }

  return rows;
};

// One row for each place, as the detail panel lists them. A scene row opens
// the first line that uses the image.
const buildPanelRows = ({ usages }) =>
  buildDialogRows({ usages, usedImages: [], expandedRowIds: [] })
    .filter((row) => row.kind !== "group")
    .map((row) => {
      if (row.kind !== "scene") {
        return row;
      }

      const firstLine = row.usage.lines[0];
      const target = { type: "scene", sceneId: row.usage.id };
      if (firstLine) {
        target.sectionId = firstLine.sectionId;
        target.lineId = firstLine.lineId;
      }

      return { ...row, target };
    });

const selectFocusableDialogRows = (state) =>
  buildDialogRows(state).filter((row) => row.kind !== "group");

export const startUsageLoad = ({ state }, { subjectId } = {}) => {
  // A reload for the same image or folder keeps the list on screen until the
  // new one arrives.
  if (state.subjectId === subjectId && state.status === "ready") {
    return;
  }

  state.subjectId = subjectId;
  state.status = "loading";
  state.usages = [];
  state.usedImages = [];
  state.expandedRowIds = [];
  state.activeRowId = undefined;
};

export const finishUsageLoad = (
  { state },
  { subjectId, usages = [], usedImages = [] } = {},
) => {
  if (state.subjectId !== subjectId) {
    return;
  }

  const isFirstLoad = state.status !== "ready";
  state.status = "ready";
  state.usages = usages;
  state.usedImages = usedImages;

  const sceneRowIds = buildDialogRows({
    usages,
    usedImages,
    expandedRowIds: [],
  })
    .filter((row) => row.kind === "scene")
    .map((row) => row.rowId);
  if (isFirstLoad) {
    // With a single scene there is nothing to choose between, so its lines
    // show at once.
    state.expandedRowIds = sceneRowIds.length === 1 ? sceneRowIds : [];
  } else {
    state.expandedRowIds = state.expandedRowIds.filter((rowId) =>
      sceneRowIds.includes(rowId),
    );
  }

  const rows = selectFocusableDialogRows(state);
  if (!rows.some((row) => row.rowId === state.activeRowId)) {
    state.activeRowId = rows[0]?.rowId;
  }
};

export const failUsageLoad = ({ state }, { subjectId } = {}) => {
  if (state.subjectId !== subjectId) {
    return;
  }

  state.status = "failed";
  state.usages = [];
  state.usedImages = [];
  state.isDialogOpen = false;
};

export const openDialog = ({ state }) => {
  state.isDialogOpen = true;
  state.activeRowId = selectFocusableDialogRows(state)[0]?.rowId;
};

export const closeDialog = ({ state }) => {
  state.isDialogOpen = false;
};

// Shows or hides the lines of a scene row.
export const setRowExpanded = ({ state }, { rowId, expanded } = {}) => {
  const index = state.expandedRowIds.indexOf(rowId);
  if (expanded && index < 0) {
    state.expandedRowIds.push(rowId);
  }
  if (!expanded && index >= 0) {
    state.expandedRowIds.splice(index, 1);
  }
};

export const setActiveRowId = ({ state }, { rowId } = {}) => {
  state.activeRowId = rowId;
};

export const selectUsageSubjectId = ({ state }) => state.subjectId;

export const selectActiveRowId = ({ state }) => state.activeRowId;

export const selectDialogRows = ({ state }) => selectFocusableDialogRows(state);

export const selectDialogRow = ({ state }, { rowId } = {}) =>
  selectFocusableDialogRows(state).find((row) => row.rowId === rowId);

export const selectPanelRow = ({ state }, { rowId } = {}) =>
  buildPanelRows(state).find((row) => row.rowId === rowId);

const selectCopy = (i18n) =>
  selectI18nCopy(i18n, ["resourcePages", "imageUsage"]);

const selectGroupLabels = (i18n = {}) => ({
  scene: i18n.scenesPage?.title,
  layout: i18n.resourceTypes?.layouts,
  control: i18n.resourceTypes?.controls,
  animation: i18n.resourceTypes?.animations,
  particle: i18n.resourceTypes?.particles,
  platformDetails: i18n.resourceTypes?.platformDetails,
});

const formatLineCount = ({ copy, dateTime, count }) =>
  formatPluralCopy(copy, "lineCount", count, { dateTime });

const formatLineName = ({ copy, i18n, line }) => {
  if (line.lineNumber === undefined) {
    return line.sectionName;
  }

  const replacements = {
    section: line.sectionName,
    line: String(line.lineNumber),
  };
  const actionLabel =
    i18n.commandLinePage?.[LINE_ACTION_LABEL_KEYS[line.actionType]];
  if (!actionLabel) {
    return formatI18nCopy(copy.lineLocation, replacements);
  }

  replacements.action = actionLabel;
  return formatI18nCopy(copy.lineLocationWithAction, replacements);
};

const formatPlatformFieldName = ({ copy, i18n, usage }) => {
  const platformCopy = i18n.platformDetailsPage ?? {};
  return formatI18nCopy(copy.platformField, {
    platform: platformCopy[PLATFORM_LABEL_KEYS[usage.platform]],
    field: platformCopy[PLATFORM_FIELD_LABEL_KEYS[usage.property]],
  });
};

const formatNamedTitle = ({ template, fallback, name }) =>
  name ? formatI18nCopy(template, { name }) : fallback;

const toRowViewData = ({ row, copy, i18n, groupLabels, activeRowId }) => {
  const icon = USAGE_GROUPS.find(
    ({ type }) => type === (row.usage?.type ?? "scene"),
  ).icon;
  const viewRow = {
    rowId: row.rowId,
    kind: row.kind,
    icon,
    name: row.usage?.name ?? "",
    meta: "",
    title: groupLabels[row.usage?.type] ?? "",
    indent: 8,
    isActive: row.rowId === activeRowId,
    ariaExpanded: "",
  };

  if (row.kind === "scene") {
    if (row.usage.lines.length > 0) {
      viewRow.meta = formatLineCount({
        copy,
        dateTime: i18n.dateTime,
        count: row.usage.lines.length,
      });
    }
    viewRow.dialogIcon = row.isExpanded ? "chevronDown" : "chevronRight";
    viewRow.canExpand = row.canExpand;
    viewRow.ariaExpanded = String(row.isExpanded);
  } else if (row.kind === "line") {
    viewRow.name = formatLineName({ copy, i18n, line: row.line });
    viewRow.indent = LINE_ROW_INDENT;
    viewRow.title = "";
  } else if (row.usage.type === "platformDetails") {
    viewRow.name = formatPlatformFieldName({ copy, i18n, usage: row.usage });
  }

  return viewRow;
};

const toGroupRowViewData = ({ row, copy, groupLabels }) => {
  const viewRow = {
    rowId: row.rowId,
    kind: "group",
    icon: "",
    label: formatI18nCopy(copy.groupCount, {
      label: groupLabels[row.type],
      count: String(row.count),
    }),
  };

  if (row.image) {
    viewRow.icon = "image";
    viewRow.label = formatI18nCopy(copy.groupCount, {
      label: row.image.name,
      count: String(row.count),
    });
  }

  return viewRow;
};

const selectDialogText = ({ state, props, copy, dateTime }) => {
  if (props.mode === FOLDER_MODE) {
    return {
      title: formatNamedTitle({
        template: copy.cannotDeleteFolderTitle,
        fallback: copy.cannotDeleteFolderTitleFallback,
        name: props.folderName,
      }),
      message: formatPluralCopy(
        copy,
        "cannotDeleteFolderMessage",
        state.usedImages.length,
        { dateTime },
      ),
    };
  }

  if (props.mode === "blocked-delete") {
    return {
      title: formatNamedTitle({
        template: copy.cannotDeleteTitle,
        fallback: copy.cannotDeleteTitleFallback,
        name: props.imageName,
      }),
      message: formatPluralCopy(
        copy,
        "cannotDeleteMessage",
        state.usages.length,
        { dateTime },
      ),
    };
  }

  return {
    title: formatNamedTitle({
      template: copy.dialogTitle,
      fallback: copy.dialogTitleFallback,
      name: props.imageName,
    }),
    message: "",
  };
};

export const selectViewData = ({ state, props = {}, i18n = {} }) => {
  const copy = selectCopy(i18n);
  const groupLabels = selectGroupLabels(i18n);
  // The blocked-delete modes show only the dialog, once there is a list.
  const isBlockedDelete =
    props.mode === "blocked-delete" || props.mode === FOLDER_MODE;
  const isReady = state.status === "ready";
  const usageCount = state.usages.length;
  const hasUsages = isReady && usageCount > 0;
  const panelRows = buildPanelRows(state);
  const dialogRows = buildDialogRows(state).map((row) => {
    if (row.kind === "group") {
      return toGroupRowViewData({ row, copy, groupLabels });
    }

    return toRowViewData({
      row,
      copy,
      i18n,
      groupLabels,
      activeRowId: state.activeRowId,
    });
  });
  const dialogText = selectDialogText({
    state,
    props,
    copy,
    dateTime: i18n.dateTime,
  });

  return {
    showPanel: !isBlockedDelete,
    isLoading: state.status === "loading",
    isFailed: state.status === "failed",
    isEmpty: isReady && usageCount === 0,
    headerLabel: hasUsages
      ? formatI18nCopy(copy.usedInCount, { count: String(usageCount) })
      : copy.usedInLabel,
    loadingLabel: copy.loadingLabel,
    loadFailedLabel: copy.loadFailed,
    notUsedLabel: copy.notUsed,
    panelRows: panelRows.slice(0, PANEL_ROW_LIMIT).map((row) =>
      toRowViewData({
        row,
        copy,
        i18n,
        groupLabels,
      }),
    ),
    showAllVisible: panelRows.length > PANEL_ROW_LIMIT,
    showAllLabel: formatI18nCopy(copy.showAll, {
      count: String(usageCount),
    }),
    isDialogOpen: isBlockedDelete ? isReady : state.isDialogOpen,
    dialogTitle: dialogText.title,
    dialogMessage: dialogText.message,
    dialogRows,
  };
};
