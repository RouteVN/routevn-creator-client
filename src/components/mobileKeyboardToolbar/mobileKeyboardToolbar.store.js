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
    id: "preview",
    icon: "play",
    iconStyle: "",
    width: "40",
    title: "Preview",
  },
  {
    id: "sections-overview",
    icon: "hamburger",
    iconStyle: "",
    width: "40",
    title: "Sections",
  },
  {
    id: "scene-settings",
    icon: "settings",
    iconStyle: "",
    width: "40",
    title: "Settings",
  },
];

const TOOLBAR_HEIGHT_PX = 48;

export const createInitialState = () => ({
  isVisible: false,
  bottom: 0,
  keyboardInset: 0,
  visualOffsetTop: 0,
  pageTop: 0,
  visualHeight: 0,
  layoutHeight: 0,
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

export const selectViewData = ({ state }) => {
  const visualViewportBottom =
    Number(state.visualOffsetTop) + Number(state.visualHeight);
  const toolbarTop = Number.isFinite(visualViewportBottom)
    ? Math.max(0, Math.round(visualViewportBottom - TOOLBAR_HEIGHT_PX))
    : 0;

  return {
    isVisible: state.isVisible,
    bottomStyle: `${state.bottom}px`,
    toolbarTopStyle: `${toolbarTop}px`,
    toolbarItems,
  };
};
