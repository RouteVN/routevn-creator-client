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
