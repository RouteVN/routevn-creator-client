// A 16:9 card: an image, or a slotted preview, on a transparency grid, with
// its name below. The card sizes to its container; whoever places it handles
// the click.
export const createInitialState = () => ({});

export const selectViewData = ({ props }) => {
  const showImage = Boolean(props.imageId || props.fileId);
  return {
    imageId: props.imageId,
    fileId: props.fileId,
    name: props.name ?? "",
    emptyLabel: props.emptyLabel ?? "",
    showImage,
    showPreview: !showImage && props.hasPreview === true,
  };
};
