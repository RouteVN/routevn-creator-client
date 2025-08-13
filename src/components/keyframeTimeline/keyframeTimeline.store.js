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

  // console.log("props.properties", props.properties);

  if (props.properties) {
    // Main page usage: convert properties object to array
    const defaultValues = {
      x: 0,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    };

    selectedProperties = Object.keys(props.properties).map((propertyName) => {
      const value = props.properties[propertyName].initialValue;
      const isDefault = value === defaultValues[propertyName];
      return {
        name: propertyName,
        initialValue: isDefault ? "D" : value,
        keyframes: props.properties[propertyName].keyframes,
      };
    });
  }

  // Calculate total duration based on keyframe durations
  let maxDuration = 0;
  if (selectedProperties.length > 0) {
    selectedProperties.forEach((property) => {
      if (property.keyframes && property.keyframes.length > 0) {
        const propertyDuration = property.keyframes.reduce(
          (sum, keyframe) => sum + (parseFloat(keyframe.duration) || 1000),
          0,
        );
        maxDuration = Math.max(maxDuration, propertyDuration);
      }
    });
  }
  const totalDuration = maxDuration > 0 ? `${maxDuration}ms` : "0ms";

  // Parse duration to calculate time at mouse position
  const durationValue = maxDuration / 1000;

  // Calculate time based on mouse position (assuming timeline width is around 400px)
  const timelineWidth = 400; // approximate width
  const timeAtMouse = (state.mouseX / timelineWidth) * durationValue;
  const timeDisplay = Math.round(timeAtMouse * 10) / 10; // round to 1 decimal

  // Process keyframes to add width percentages
  if (selectedProperties.length > 0 && maxDuration > 0) {
    selectedProperties = selectedProperties.map((property) => {
      if (property.keyframes && property.keyframes.length > 0) {
        const propertyTotalDuration = property.keyframes.reduce(
          (sum, keyframe) => sum + (parseFloat(keyframe.duration) || 1000),
          0,
        );

        // Calculate width percentage for each keyframe
        const keyframesWithWidth = property.keyframes.map((keyframe) => {
          const duration = parseFloat(keyframe.duration) || 1000;
          const widthPercent = (duration / propertyTotalDuration) * 100;
          // Add prefix for relative values
          let displayValue = keyframe.value;
          if (keyframe.relative) {
            // Check if value already has a sign
            const numValue = parseFloat(keyframe.value);
            if (!isNaN(numValue)) {
              displayValue =
                numValue >= 0 ? `[+${keyframe.value}]` : `[${keyframe.value}]`;
            }
          }
          return {
            ...keyframe,
            value: displayValue,
            widthPercent: widthPercent.toFixed(2),
          };
        });

        return {
          ...property,
          keyframes: keyframesWithWidth,
        };
      }
      return property;
    });
  }

  // console.log("selectedProperties", selectedProperties);

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
