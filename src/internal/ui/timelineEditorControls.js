import { isTouchPhone } from "../touchLayout.js";

// The timeline editors (animations and audio effects) keep undo, redo, Loop
// and Play in the navbar, and the Timeline and Preview tabs in the toolbar
// over the timeline. Phones put the tabs in the navbar after the name, as the
// other editors put Edit and Preview, and move the navbar's buttons to the
// toolbar: the zoom button, Loop and Play on the left, and undo and redo
// before Add on the right; zoom, undo and redo show on Timeline only. The
// stores keep `isTouchMode` and `appWindowMetrics`.
export const buildTimelineEditorControlsPlacement = ({
  state,
  isTimelineTab,
}) => {
  const isPhone = isTouchPhone({
    isTouchMode: state.isTouchMode,
    width: state.appWindowMetrics.width,
    height: state.appWindowMetrics.height,
  });

  return {
    showNavbarControls: !isPhone,
    showNavbarEditorTabs: isPhone,
    showToolbarEditorTabs: !isPhone,
    showToolbarPlayback: isPhone,
    showToolbarEditHistory: isPhone && isTimelineTab,
    showLeadingTimelineZoom: isPhone && isTimelineTab,
    showTrailingTimelineZoom: !isPhone && isTimelineTab,
  };
};
