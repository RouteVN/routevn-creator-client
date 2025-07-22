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

const getInitialValue = (property) => {
  const defaultValues = {
    x: 0,
    y: 0,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };
  return defaultValues[property] || 0;
};

export const toViewData = ({ state, props, attrs }) => {
  let selectedProperties = [];

  console.log("props.animationProperties", props.animationProperties);

  if (props.animationProperties) {
    // Main page usage: convert animationProperties object to array
    selectedProperties = Object.keys(props.animationProperties).map(
      (propertyName) => ({
        name: propertyName,
        initialValue: props.animationProperties[propertyName].initialValue,
        keyframes: props.animationProperties[propertyName].keyframes,
      }),
    );
  }

  // Calculate total duration based on keyframe durations
  let maxDuration = 0;
  if (selectedProperties.length > 0) {
    selectedProperties.forEach((property) => {
      if (property.keyframes && property.keyframes.length > 0) {
        const propertyDuration = property.keyframes.reduce(
          (sum, keyframe) => sum + (keyframe.duration || 1000),
          0,
        );
        maxDuration = Math.max(maxDuration, propertyDuration);
      }
    });
  }
  const totalDuration = maxDuration > 0 ? `${maxDuration / 1000}s` : "0s";

  // Parse duration to calculate time at mouse position
  const durationValue = maxDuration / 1000;

  // Calculate time based on mouse position (assuming timeline width is around 400px)
  const timelineWidth = 400; // approximate width
  const timeAtMouse = (state.mouseX / timelineWidth) * durationValue;
  const timeDisplay = Math.round(timeAtMouse * 10) / 10; // round to 1 decimal

  const result = {
    totalDuration,
    selectedProperties,
    mouseX: state.mouseX,
    timeDisplay,
    showHoverLine: state.showHoverLine,
    editable: attrs.editable,
  };

  return result;
};
