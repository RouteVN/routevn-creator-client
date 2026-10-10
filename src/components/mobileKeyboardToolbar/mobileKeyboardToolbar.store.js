import { selectSceneEditorCopy } from "../../internal/ui/sceneEditor/sceneEditorCopy.js";
import { selectEditHistoryCopy } from "../../internal/ui/editHistory.js";

const toolbarItems = [
  {
    id: "arrow-left",
    icon: "chevronDown",
    iconStyle: "transform: rotate(90deg);",
    width: "42",
    title: "Left",
  },
  {
    id: "arrow-up",
    icon: "chevronDown",
    iconStyle: "transform: rotate(180deg);",
    width: "42",
    title: "Up",
  },
  {
    id: "arrow-down",
    icon: "chevronDown",
    iconStyle: "",
    width: "42",
    title: "Down",
  },
  {
    id: "arrow-right",
    icon: "chevronDown",
    iconStyle: "transform: rotate(-90deg);",
    width: "42",
    title: "Right",
  },
  {
    id: "actions",
    icon: "plus",
    iconStyle: "",
    width: "40",
    title: "Actions",
  },
  {
    id: "undo",
    icon: "undo",
    iconStyle: "",
    width: "40",
    title: "Undo",
  },
  {
    id: "redo",
    icon: "redo",
    iconStyle: "",
    width: "40",
    title: "Redo",
  },
  // Preview, sections, and settings, which do not fit on a phone.
  {
    id: "more",
    icon: "ellipsisLarge",
    iconStyle: "",
    width: "40",
    title: "More",
  },
];

const TOOLBAR_HEIGHT_PX = 48;
const MOBILE_TAB_BAR_HEIGHT_PX = 64;

export const createInitialState = () => ({
  isVisible: false,
  bottom: 0,
  keyboardInset: 0,
  visualOffsetTop: 0,
  pageTop: 0,
  visualHeight: 0,
  layoutHeight: 0,
  pressedActionId: undefined,
  moreMenu: {
    open: false,
    x: undefined,
    y: undefined,
  },
  arrowRepeat: {
    direction: undefined,
    pointerId: undefined,
    delayTimerId: undefined,
    intervalTimerId: undefined,
  },
});

export const setKeyboardState = (
  { state },
  {
    isVisible,
    bottom,
    keyboardInset,
    visualOffsetTop,
    pageTop,
    visualHeight,
    layoutHeight,
  } = {},
) => {
  state.isVisible = isVisible === true;
  state.bottom = Number.isFinite(bottom) ? Math.max(0, Math.round(bottom)) : 0;
  state.keyboardInset = Number.isFinite(keyboardInset)
    ? Math.max(0, Math.round(keyboardInset))
    : 0;
  state.visualOffsetTop = Number.isFinite(visualOffsetTop)
    ? Math.max(0, Math.round(visualOffsetTop))
    : 0;
  state.pageTop = Number.isFinite(pageTop)
    ? Math.max(0, Math.round(pageTop))
    : 0;
  state.visualHeight = Number.isFinite(visualHeight)
    ? Math.max(0, Math.round(visualHeight))
    : 0;
  state.layoutHeight = Number.isFinite(layoutHeight)
    ? Math.max(0, Math.round(layoutHeight))
    : 0;
};

export const selectKeyboardState = ({ state }) => {
  return {
    isVisible: state.isVisible,
    bottom: state.bottom,
    keyboardInset: state.keyboardInset,
    visualOffsetTop: state.visualOffsetTop,
    pageTop: state.pageTop,
    visualHeight: state.visualHeight,
    layoutHeight: state.layoutHeight,
  };
};

// Opens the More menu, or moves it, above the point it hangs from.
export const openMoreMenu = ({ state }, { x, y } = {}) => {
  state.moreMenu.open = true;
  state.moreMenu.x = x;
  state.moreMenu.y = y;
};

export const closeMoreMenu = ({ state }) => {
  state.moreMenu.open = false;
  state.moreMenu.x = undefined;
  state.moreMenu.y = undefined;
};

export const selectIsMoreMenuOpen = ({ state }) => state.moreMenu.open;

export const setPressedActionId = ({ state }, { actionId } = {}) => {
  state.pressedActionId = actionId;
};

export const clearPressedActionId = ({ state }) => {
  state.pressedActionId = undefined;
};

export const selectPressedActionId = ({ state }) => state.pressedActionId;

export const setArrowRepeatState = (
  { state },
  { direction, pointerId, delayTimerId } = {},
) => {
  state.arrowRepeat.direction = direction;
  state.arrowRepeat.pointerId = pointerId;
  state.arrowRepeat.delayTimerId = delayTimerId;
  state.arrowRepeat.intervalTimerId = undefined;
};

export const setArrowRepeatIntervalId = (
  { state },
  { intervalTimerId } = {},
) => {
  state.arrowRepeat.intervalTimerId = intervalTimerId;
};

export const clearArrowRepeatState = ({ state }) => {
  state.arrowRepeat.direction = undefined;
  state.arrowRepeat.pointerId = undefined;
  state.arrowRepeat.delayTimerId = undefined;
  state.arrowRepeat.intervalTimerId = undefined;
};

export const selectArrowRepeatState = ({ state }) => {
  return {
    direction: state.arrowRepeat.direction,
    pointerId: state.arrowRepeat.pointerId,
    delayTimerId: state.arrowRepeat.delayTimerId,
    intervalTimerId: state.arrowRepeat.intervalTimerId,
  };
};

const createToolbarViewItems = (
  items,
  { copy, editHistoryCopy, pressedActionId, undoDisabled, redoDisabled },
) => {
  const labels = {
    "arrow-left": copy.leftLabel ?? "Left",
    "arrow-up": copy.upLabel ?? "Up",
    "arrow-down": copy.downLabel ?? "Down",
    "arrow-right": copy.rightLabel ?? "Right",
    actions: copy.actionsLabel ?? "Actions",
    undo: editHistoryCopy.undoLabel,
    redo: editHistoryCopy.redoLabel,
    more: copy.moreLabel ?? "More",
  };
  const disabledById = {
    undo: undoDisabled === true,
    redo: redoDisabled === true,
  };

  return items.map((item) => {
    const disabled = disabledById[item.id] ?? false;
    return {
      ...item,
      bgColor: item.id === pressedActionId ? "ac" : "mu",
      title: labels[item.id] ?? item.title,
      disabled,
      opacity: disabled ? "0.4" : "1",
    };
  });
};

export const selectViewData = ({ state, props = {}, i18n }) => {
  const copy = selectSceneEditorCopy(i18n);
  const editHistoryCopy = selectEditHistoryCopy(i18n);
  const visualViewportBottom =
    Number(state.visualOffsetTop) + Number(state.visualHeight);
  const toolbarTop = Number.isFinite(visualViewportBottom)
    ? Math.max(0, Math.round(visualViewportBottom - TOOLBAR_HEIGHT_PX))
    : 0;
  const toolbarPositionStyle = state.isVisible
    ? `top: ${toolbarTop}px`
    : `bottom: calc(${MOBILE_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom))`;

  return {
    isVisible: state.isVisible,
    bottomStyle: `${state.bottom}px`,
    toolbarTopStyle: `${toolbarTop}px`,
    toolbarPositionStyle,
    toolbarWidth: props.width ?? "100%",
    toolbarItems: createToolbarViewItems(toolbarItems, {
      copy,
      editHistoryCopy,
      pressedActionId: state.pressedActionId,
      undoDisabled: props.undoDisabled,
      redoDisabled: props.redoDisabled,
    }),
    moreMenu: state.moreMenu,
    moreMenuLabel: copy.moreLabel ?? "More",
    moreMenuItems: [
      {
        type: "item",
        label: copy.previewButton ?? "Preview",
        icon: "play",
        value: "preview",
      },
      {
        type: "item",
        label: copy.sectionsLabel ?? "Sections",
        icon: "hamburger",
        value: "sections-overview",
      },
      {
        type: "item",
        label: copy.settingsTitle ?? "Settings",
        icon: "settings",
        value: "scene-settings",
      },
    ],
  };
};
