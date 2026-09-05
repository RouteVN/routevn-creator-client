export const CAMERA_PROPERTIES = ["x", "y", "scaleX", "scaleY"];

export const createCameraPose = ({ width, height }) => ({
  x: width / 2,
  y: height / 2,
  scaleX: 1,
  scaleY: 1,
});

// A textured subject makes both pan and zoom visible without a preview image.
export const createCameraPreviewElement = ({ id, width, height, fill }) => {
  const children = [
    { id: `${id}-background`, type: "rect", width, height, fill },
  ];
  for (let index = 1; index < 10; index += 1) {
    children.push(
      {
        id: `${id}-column-${index}`,
        type: "rect",
        x: (width * index) / 10,
        width: width / 600,
        height,
        fill: "#b9b9b9",
      },
      {
        id: `${id}-row-${index}`,
        type: "rect",
        y: (height * index) / 10,
        width,
        height: height / 340,
        fill: "#b9b9b9",
      },
    );
  }
  return {
    id,
    type: "container",
    x: width / 2,
    y: height / 2,
    width,
    height,
    anchorX: 0.5,
    anchorY: 0.5,
    children,
  };
};

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
    initialValue: readPose((track) => track.initialValue),
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
      initialValue: camera.initialValue[property],
      keyframes: camera.keyframes.map((frame) => {
        const next = { ...frame, value: frame.value[property] };
        if (frame.startValue !== undefined)
          next.startValue = frame.startValue[property];
        return next;
      }),
    };
  }
  return expanded;
};

const formatCameraZoom = (pose) => `${Math.round(pose.scaleX * 100)}%`;

export const cameraTimelineProperties = (properties, label) => {
  const { camera } = properties;
  if (!camera) return properties;
  return {
    ...properties,
    camera: {
      ...camera,
      label,
      initialValueLabel: "",
      hideValueCurve: true,
      keyframes: camera.keyframes.map((frame, index) => ({
        ...frame,
        startValueLabel: formatCameraZoom(
          frame.startValue ??
            camera.keyframes[index - 1]?.value ??
            camera.initialValue,
        ),
        valueLabel: formatCameraZoom(frame.value),
      })),
    },
  };
};
