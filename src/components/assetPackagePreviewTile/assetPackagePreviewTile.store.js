// A 16:9 tile previewing one resource as its resource page does, with its
// name below when asked. The tile sizes to its container; whoever places it
// handles the click.
export const createInitialState = () => ({});

// Text styles keep their look at tile size: large sizes are scaled down.
const MAX_TEXT_STYLE_FONT_SIZE = 28;

export const selectViewData = ({ props }) => {
  const preview = props.preview ?? {};
  return {
    ...preview,
    kind: preview.kind ?? "icon",
    icon: preview.icon ?? "folder",
    name: preview.name ?? "",
    showName: preview.showName === true && Boolean(preview.name),
    fontFamilies: preview.fontFamilies ?? [],
    fontFileIds: preview.fontFileIds ?? [],
    fontWeightDescriptors: preview.fontWeightDescriptors ?? [],
    textStyleFontSize: Math.min(
      preview.fontSize ?? MAX_TEXT_STYLE_FONT_SIZE,
      MAX_TEXT_STYLE_FONT_SIZE,
    ),
  };
};
