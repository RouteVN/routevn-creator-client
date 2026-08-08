export const createInitialState = () => ({});

export const selectViewData = ({ props }) => ({
  src: props.src,
  kind: props.kind ?? "image",
  label: props.label ?? "",
});
