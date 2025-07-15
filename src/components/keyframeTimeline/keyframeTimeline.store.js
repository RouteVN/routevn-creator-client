export const INITIAL_STATE = Object.freeze({
  mouseX: 0,
  showHoverLine: false,
});

export const setMousePosition = (state, x) => {
  state.mouseX = x;
  state.showHoverLine = true;
};

export const hideTimelineLine = (state) => {
  state.showHoverLine = false;
};

export const toViewData = ({ state, props }, payload) => {
  // For now, hardcode the data - we'll add props later
  const totalDuration = props.totalDuration || "4s";

  // Parse duration to calculate time at mouse position
  const durationValue = parseFloat(totalDuration.replace("s", ""));

  // Calculate time based on mouse position (assuming timeline width is around 400px)
  const timelineWidth = 400; // approximate width
  const timeAtMouse = (state.mouseX / timelineWidth) * durationValue;
  const timeDisplay = Math.round(timeAtMouse * 10) / 10; // round to 1 decimal

  // Hardcoded tracks data for now
  const tracks = props.tracks || [
    {
      name: "Alpha",
      keyframes: [
        { start: 0, duration: 1 },
        { start: 2, duration: 1 },
      ],
    },
    {
      name: "Scale",
      keyframes: [{ start: 1, duration: 2 }],
    },
  ];

  const result = {
    totalDuration,
    tracks,
    mouseX: state.mouseX,
    timeDisplay,
    showHoverLine: state.showHoverLine,
  };

  return result;
};
