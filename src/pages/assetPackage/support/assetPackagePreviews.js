import { getFontFaceWeightDescriptor } from "../../../internal/fontCapabilities.js";
import { toFontIds } from "../../../internal/fontIds.js";

// The icon a resource shows when its type has no preview of its own.
const TYPE_ICONS = Object.freeze({
  images: "image",
  sounds: "music",
  videos: "video",
  characters: "character",
  transforms: "transform",
  animations: "animation",
  audioEffects: "audioEffects",
  particles: "particles",
  spritesheets: "spritesheets",
  colors: "color",
  fonts: "font",
  textStyles: "text",
  layouts: "layout",
  variables: "variable",
  controls: "controls",
});

// The resources in a folder's tree node, in project order: with those in its
// subfolders, or with `ownOnly`, only those directly in it.
export const collectFolderResources = (
  resourceData,
  folderNode,
  { ownOnly = false } = {},
) => {
  const resources = [];
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      const item = resourceData.items[node.id];
      if (!item) continue;
      if (item.type === "folder") {
        if (!ownOnly) {
          visit(node.children);
        }
        continue;
      }
      resources.push({ itemId: node.id, item });
    }
  };
  visit(folderNode?.children);
  return resources;
};

const getColorHex = (resourceDataByType, colorId) => {
  const color = resourceDataByType.colors?.items?.[colorId];
  return color?.type === "color" ? color.hex : "#000000";
};

// As the Text Styles page draws a text style: its fonts, colors and sample.
const getTextStylePreview = (item, resourceDataByType) => {
  const fontIds = toFontIds(item.fontId);
  const fonts = fontIds.map((id) => resourceDataByType.fonts?.items?.[id]);
  const fontsWithFiles = fonts.filter((font) => font?.fileId);
  const hexOf = (colorId) => getColorHex(resourceDataByType, colorId);
  return {
    kind: "textStyle",
    fontFamilies: fonts.map((font, index) =>
      font ? font.fontFamily : fontIds[index],
    ),
    fontFileIds: fontsWithFiles.map((font) => font.fileId),
    fontWeightDescriptors: fontsWithFiles.map(
      (font) => getFontFaceWeightDescriptor(font) ?? "",
    ),
    fontSize: item.fontSize,
    lineHeight: item.lineHeight,
    fontWeight: item.fontWeight,
    color: item.colorId ? hexOf(item.colorId) : "#000000",
    strokeColor: item.strokeColorId ? hexOf(item.strokeColorId) : "",
    strokeWidth: item.strokeColorId ? (item.strokeWidth ?? 0) : 0,
    shadowColor: item.shadow?.colorId ? hexOf(item.shadow.colorId) : "",
    shadowAlpha: item.shadow?.alpha ?? 1,
    shadowBlur: item.shadow?.blur ?? 0,
    shadowOffsetX: item.shadow?.offsetX ?? 2,
    shadowOffsetY: item.shadow?.offsetY ?? 2,
    previewText:
      typeof item.previewText === "string" && item.previewText.trim()
        ? item.previewText
        : (item.name ?? ""),
  };
};

// How a resource previews on the export page, as on its own resource page:
// an image or thumbnail, a sound's waveform, a font's glyphs, a color's
// swatch, a text style's sample, or otherwise its type's icon.
export const createResourcePreview = ({
  resourceType,
  itemId,
  item,
  resourceDataByType,
}) => {
  const base = { id: itemId, name: item.name ?? "" };
  if (resourceType === "images" && (item.thumbnailFileId || item.fileId)) {
    return {
      ...base,
      kind: "image",
      fileId: item.thumbnailFileId ?? item.fileId,
      originalFileId: item.fileId,
    };
  }
  if (resourceType === "sounds" && item.waveformDataFileId) {
    return {
      ...base,
      kind: "sound",
      waveformDataFileId: item.waveformDataFileId,
    };
  }
  if (resourceType === "fonts" && item.fileId) {
    return {
      ...base,
      kind: "font",
      fontFamily: item.fontFamily ?? "sans-serif",
      fontFileId: item.fileId,
      fontWeight: item.defaultWeight ?? "normal",
      fontWeightDescriptor: getFontFaceWeightDescriptor(item) ?? "",
    };
  }
  if (resourceType === "colors" && item.hex) {
    return { ...base, kind: "color", hex: item.hex };
  }
  if (resourceType === "textStyles") {
    return { ...base, ...getTextStylePreview(item, resourceDataByType) };
  }
  // Characters show their avatar; the other types their saved thumbnail.
  const thumbnailFileId =
    resourceType === "characters" ? item.fileId : item.thumbnailFileId;
  if (thumbnailFileId) {
    return { ...base, kind: "thumbnail", fileId: thumbnailFileId };
  }
  return { ...base, kind: "icon", icon: TYPE_ICONS[resourceType] ?? "folder" };
};
