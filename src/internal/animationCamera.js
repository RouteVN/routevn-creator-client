import { formatNumber, formatPercent } from "./dates.js";

export const CAMERA_PROPERTIES = ["x", "y", "scaleX", "scaleY"];

const roundCameraValue = (value, property) => {
  const rounded = Number(value.toFixed(2)) + 0;
  // Positive scales must stay positive at the stored two-decimal precision.
  return value > 0 && (property === "scaleX" || property === "scaleY")
    ? Math.max(0.01, rounded)
    : rounded;
};

export const roundCameraPose = (pose) =>
  Object.fromEntries(
    CAMERA_PROPERTIES.map((property) => [
      property,
      roundCameraValue(pose[property], property),
    ]),
  );

export const createCameraPose = ({ width, height }) => ({
  x: width / 2,
  y: height / 2,
  scaleX: 1,
  scaleY: 1,
});

// Group only explicitly authored Camera tracks, never legacy scalar tracks.
export const groupCameraTrack = (properties) => {
  const grouped = structuredClone(properties);
  const readPose = (read) =>
    Object.fromEntries(
      CAMERA_PROPERTIES.map((property) => [
        property,
        read(properties[property]),
      ]),
    );
  const camera = {
    keyframes: properties.x.keyframes.map((frame, index) => {
      const next = {
        ...frame,
        value: readPose((track) => track.keyframes[index].value),
      };
      if (frame.startValue !== undefined) {
        next.startValue = readPose(
          (track) => track.keyframes[index].startValue,
        );
      }
      return next;
    }),
  };
  if (properties.x.initialValue !== undefined) {
    camera.initialValue = readPose((track) => track.initialValue);
  }
  for (const property of CAMERA_PROPERTIES) delete grouped[property];
  grouped.camera = camera;
  return grouped;
};

export const expandCameraTrack = (properties) => {
  if (!properties?.camera) return properties;
  const expanded = { ...properties };
  delete expanded.camera;
  const { camera } = properties;
  for (const property of CAMERA_PROPERTIES) {
    expanded[property] = {
      keyframes: camera.keyframes.map((frame) => {
        const next = {
          ...frame,
          value: roundCameraValue(frame.value[property], property),
        };
        if (frame.startValue !== undefined)
          next.startValue = roundCameraValue(
            frame.startValue[property],
            property,
          );
        return next;
      }),
    };
    if (camera.initialValue !== undefined) {
      expanded[property].initialValue = roundCameraValue(
        camera.initialValue[property],
        property,
      );
    }
  }
  return expanded;
};

// The zoom reads as a percentage, formatted for `dateTime`, the active
// locale's catalog.
const formatCameraZoom = (pose, dateTime) =>
  pose === undefined
    ? undefined
    : formatPercent(Math.round(pose.scaleX * 100), dateTime);

export const formatCameraPoseLabel = (pose, dateTime) => {
  if (pose === undefined) return undefined;
  const x = formatNumber(Number(pose.x.toFixed(2)), dateTime);
  const y = formatNumber(Number(pose.y.toFixed(2)), dateTime);
  return `${formatCameraZoom(pose, dateTime)} · X ${x} · Y ${y}`;
};

export const cameraTimelineProperties = (properties, label, dateTime) => {
  const { camera } = properties;
  if (!camera) return properties;
  return {
    ...properties,
    camera: {
      ...camera,
      label,
      initialValueLabel: "",
      valueCurveMode: "progress",
      keyframes: camera.keyframes.map((frame, index) => ({
        ...frame,
        startValueLabel: formatCameraZoom(
          frame.startValue ??
            camera.keyframes[index - 1]?.value ??
            camera.initialValue,
          dateTime,
        ),
        valueLabel: formatCameraZoom(frame.value, dateTime),
      })),
    },
  };
};
