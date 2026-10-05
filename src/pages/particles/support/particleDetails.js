import { resolveParticleTextureImageItem } from "../../../internal/particles.js";

const toTextValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
};

const formatDimensionLabel = (width, height) => {
  return `${Math.round(width)} × ${Math.round(height)}`;
};

const capitalize = (value = "") => {
  if (!value) {
    return "";
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const getSourceKindLabel = (kind, copy = {}) => {
  switch (kind) {
    case "point":
      return copy.sourceKindPoint ?? "Point";
    case "circle":
      return copy.sourceKindCircle ?? "Circle";
    case "line":
      return copy.sourceKindLine ?? "Line";
    case "rect":
    default:
      return copy.sourceKindRectangle ?? "Rectangle";
  }
};

const getEmissionModeLabel = (mode, copy = {}) => {
  return mode === "burst"
    ? (copy.emissionModeBurst ?? "Burst")
    : (copy.emissionModeContinuous ?? "Continuous");
};

const summarizeTexture = (texture, imageItems = {}, copy = {}) => {
  if (!texture) {
    return copy.notSetValue ?? "Not set";
  }

  if (typeof texture === "string") {
    return imageItems?.[texture]?.name ?? texture;
  }

  if (texture?.mode) {
    return `${capitalize(texture.mode)} ${copy.selectorLabel ?? "selector"}`;
  }

  return copy.legacyShapeValue ?? "Legacy shape";
};

const summarizeSource = (source, copy = {}) => {
  const kind = source?.kind ?? "rect";
  return getSourceKindLabel(kind, copy);
};

export const buildParticleDetailFields = (input) => {
  const item = input?.item ?? input;
  const imagesData = input?.imagesData;
  const copy = input?.copy ?? {};
  if (!item) {
    return [];
  }

  const texture = item.modules?.appearance?.texture;
  const textureImageItem = resolveParticleTextureImageItem(
    texture,
    imagesData?.items,
  );
  const textureImageField = textureImageItem?.fileId
    ? {
        type: "slot",
        slot: "particle-texture-image",
        label: copy.textureImageLabel ?? "Texture Image",
      }
    : {
        type: "text",
        label: copy.textureImageLabel ?? "Texture Image",
        value: summarizeTexture(texture, imagesData?.items, copy),
      };

  return [
    {
      type: "slot",
      slot: "particle-preview",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "particle-tags",
      label: copy.tagsLabel ?? "Tags",
    },
    {
      type: "text",
      label: copy.canvasSizeLabel ?? "Canvas Size",
      value: formatDimensionLabel(item.width ?? 0, item.height ?? 0),
    },
    {
      type: "text",
      label: copy.emissionLabel ?? "Emission",
      value: getEmissionModeLabel(item.modules?.emission?.mode, copy),
    },
    {
      type: "text",
      label: copy.sourceLabel ?? "Source",
      value: summarizeSource(item.modules?.emission?.source, copy),
    },
    textureImageField,
    {
      type: "text",
      label: copy.seedLabel ?? "Seed",
      value: toTextValue(item.seed),
    },
  ];
};

export const buildParticleCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "layout",
  cardVariant: "thumbnail",
  previewFileId: item.thumbnailFileId,
});
