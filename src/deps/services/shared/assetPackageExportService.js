import JSZip from "jszip";
import { createWaveformThumbnail } from "../../clients/web/fileProcessors.js";
import { getFontFaceWeightDescriptor } from "../../../internal/fontCapabilities.js";
import { toFontIds } from "../../../internal/fontIds.js";
import { collectParticleTextureImageIds } from "../../../internal/particles.js";

const renderPreviewWith = async (exportName, options) => {
  const previewClient = await import(
    "../../clients/web/assetPackagePreviews.js"
  );
  return previewClient[exportName](options);
};

const renderDefaultSpritesheetPreview = (options) =>
  renderPreviewWith("renderSpritesheetPreviewVideo", options);
const renderDefaultFontPreview = (options) =>
  renderPreviewWith("renderFontPreviewImage", options);
const renderDefaultTextStylePreview = (options) =>
  renderPreviewWith("renderTextStylePreviewImage", options);
const renderDefaultAnimationPreviews = (options) =>
  renderPreviewWith("renderAnimationPreviewVideos", options);
const renderDefaultParticlePreview = (options) =>
  renderPreviewWith("renderParticlePreviewVideo", options);

const generatePreviewStage = async ({ label, generate }) => {
  try {
    await generate();
  } catch (error) {
    throw new Error(
      `Failed to generate ${label} previews: ${error.message ?? "Unknown error"}`,
      { cause: error },
    );
  }
};

const getPackageFilePath = (fileId) => `files/${encodeURIComponent(fileId)}`;

const readProjectFile = async ({ fileId, getFileContent, fetchImpl }) => {
  const content = await getFileContent(fileId);
  try {
    const response = await fetchImpl(content.url);
    if (!response.ok) {
      throw new Error(`Could not read asset package file '${fileId}'.`);
    }
    return response.arrayBuffer();
  } finally {
    content.revoke?.();
  }
};

const getPreviewMediaType = (blob) => {
  const mimeType = blob.type.split(";", 1)[0].toLowerCase();
  if (mimeType === "image/png") {
    return { extension: "png", mimeType, type: "image" };
  }
  if (mimeType === "video/mp4") {
    return { extension: "mp4", mimeType, type: "video" };
  }
  if (mimeType === "video/webm") {
    return { extension: "webm", mimeType, type: "video" };
  }
  throw new Error(`Unsupported generated preview type '${blob.type}'.`);
};

const createPreviewFileId = ({ extension, prefix, resourceId, files }) => {
  const baseId = `${prefix}.${resourceId}.${extension}`;
  let fileId = baseId;
  let suffix = 2;
  while (files[fileId]) {
    fileId = `${baseId}.${suffix}`;
    suffix += 1;
  }
  return fileId;
};

const addGeneratedPreview = async ({
  blob,
  files,
  fileBytesById,
  item,
  prefix,
  resourceId,
  itemField = "previewMediaFileId",
  nameLabel = "preview",
}) => {
  const { extension, mimeType, type } = getPreviewMediaType(blob);
  const previewBytes = await blob.arrayBuffer();
  const previewFileId = createPreviewFileId({
    extension,
    prefix,
    resourceId,
    files,
  });
  files[previewFileId] = {
    id: previewFileId,
    type,
    name: `${item.name} ${nameLabel}.${extension}`,
    mimeType,
    size: previewBytes.byteLength,
    source: { url: `./${getPackageFilePath(previewFileId)}` },
  };
  item[itemField] = previewFileId;
  fileBytesById.set(previewFileId, previewBytes);
};

const addGeneratedVideoPreviews = async ({
  preview,
  files,
  fileBytesById,
  item,
  prefix,
  resourceId,
}) => {
  if (!preview?.previewBlob || !preview?.thumbnailBlob) {
    throw new Error(`Video previews for '${resourceId}' are incomplete.`);
  }
  await addGeneratedPreview({
    blob: preview.previewBlob,
    files,
    fileBytesById,
    item,
    prefix: `${prefix}-preview`,
    resourceId,
  });
  await addGeneratedPreview({
    blob: preview.thumbnailBlob,
    files,
    fileBytesById,
    item,
    prefix: `${prefix}-thumbnail`,
    resourceId,
    itemField: "thumbnailMediaFileId",
    nameLabel: "thumbnail",
  });
};

const createSourceFileReader = ({
  fileBytesById,
  getFileContent,
  fetchImpl,
}) => {
  const sourceFileBytesById = new Map(fileBytesById);
  return async (fileId) => {
    if (!sourceFileBytesById.has(fileId)) {
      sourceFileBytesById.set(
        fileId,
        await readProjectFile({ fileId, getFileContent, fetchImpl }),
      );
    }
    return sourceFileBytesById.get(fileId);
  };
};

const addSoundWaveformPreviews = async ({
  manifest,
  fileBytesById,
  renderWaveformThumbnail,
}) => {
  const files = manifest.repository?.files?.items ?? {};
  const sounds = manifest.repository?.sounds?.items ?? {};

  for (const [soundId, sound] of Object.entries(sounds)) {
    if (sound.type !== "sound" || !sound.waveformDataFileId) {
      continue;
    }

    const waveformBytes = fileBytesById.get(sound.waveformDataFileId);
    if (!waveformBytes) {
      continue;
    }

    const waveformData = JSON.parse(new TextDecoder().decode(waveformBytes));
    await addGeneratedPreview({
      blob: await renderWaveformThumbnail({ waveformData }),
      files,
      fileBytesById,
      item: sound,
      prefix: "waveform-preview",
      resourceId: soundId,
    });
  }
};

const addSpritesheetPreviews = async ({
  manifest,
  sourceRepository,
  fileBytesById,
  readSourceFile,
  renderPreview,
}) => {
  const files = manifest.repository?.files?.items ?? {};
  const spritesheets = manifest.repository?.spritesheets?.items ?? {};
  for (const [spritesheetId, spritesheet] of Object.entries(spritesheets)) {
    if (
      spritesheet.type !== "spritesheet" ||
      !spritesheet.fileId ||
      !spritesheet.jsonData ||
      !Object.values(spritesheet.animations ?? {}).some(
        (animation) => (animation?.frames?.length ?? 0) > 0,
      )
    ) {
      continue;
    }

    const sourceFile =
      files[spritesheet.fileId] ??
      sourceRepository.files?.items?.[spritesheet.fileId];
    await addGeneratedVideoPreviews({
      preview: await renderPreview({
        spritesheet,
        imageBytes: await readSourceFile(spritesheet.fileId),
        imageMimeType: sourceFile?.mimeType ?? "image/png",
        projectResolution: sourceRepository.project?.resolution,
      }),
      files,
      fileBytesById,
      item: spritesheet,
      prefix: "spritesheet",
      resourceId: spritesheetId,
    });
  }
};

const createFontAsset = async ({ font, sourceRepository, readSourceFile }) => {
  if (!font?.fileId) {
    return undefined;
  }
  const file = sourceRepository.files?.items?.[font.fileId];
  return {
    fileId: font.fileId,
    bytes: await readSourceFile(font.fileId),
    mimeType: file?.mimeType ?? "application/octet-stream",
    weightDescriptor: getFontFaceWeightDescriptor(font),
  };
};

const addFontPreviews = async ({
  manifest,
  sourceRepository,
  fileBytesById,
  readSourceFile,
  renderPreview,
}) => {
  const files = manifest.repository?.files?.items ?? {};
  const fonts = manifest.repository?.fonts?.items ?? {};
  for (const [fontId, font] of Object.entries(fonts)) {
    if (font.type !== "font" || !font.fileId) {
      continue;
    }

    await addGeneratedPreview({
      blob: await renderPreview({
        font,
        fontAsset: await createFontAsset({
          font,
          sourceRepository,
          readSourceFile,
        }),
      }),
      files,
      fileBytesById,
      item: font,
      prefix: "font-preview",
      resourceId: fontId,
    });
  }
};

const addTextStylePreviews = async ({
  manifest,
  sourceRepository,
  fileBytesById,
  readSourceFile,
  renderPreview,
}) => {
  const files = manifest.repository?.files?.items ?? {};
  const textStyles = manifest.repository?.textStyles?.items ?? {};
  const sourceFonts = sourceRepository.fonts?.items ?? {};
  const sourceColors = sourceRepository.colors?.items ?? {};
  for (const [textStyleId, textStyle] of Object.entries(textStyles)) {
    if (textStyle.type !== "textStyle") {
      continue;
    }

    const fonts = toFontIds(textStyle.fontId)
      .map((fontId) => sourceFonts[fontId])
      .filter((font) => font?.type === "font");
    const fontAssets = (
      await Promise.all(
        fonts.map((font) =>
          createFontAsset({ font, sourceRepository, readSourceFile }),
        ),
      )
    ).filter(Boolean);
    const getColor = (colorId) => sourceColors[colorId]?.hex;
    await addGeneratedPreview({
      blob: await renderPreview({
        textStyle,
        fontAssets,
        fontFamilies: fonts.map((font) => font.fontFamily),
        color: getColor(textStyle.colorId) ?? "#000000",
        strokeColor: getColor(textStyle.strokeColorId),
        shadowColor: getColor(textStyle.shadow?.colorId),
      }),
      files,
      fileBytesById,
      item: textStyle,
      prefix: "text-style-preview",
      resourceId: textStyleId,
    });
  }
};

const collectAnimationImageReferences = (animation) => {
  const references = new Set();
  const collectReference = (value) => {
    if (typeof value === "string" && value.length > 0) {
      references.add(value);
    }
  };
  const collectPreviewSlot = (slot) => {
    if (typeof slot === "string") {
      collectReference(slot);
      return;
    }
    collectReference(slot?.imageId);
  };
  const collectMask = (mask) => {
    if (Array.isArray(mask)) {
      mask.forEach(collectMask);
      return;
    }
    if (!mask) {
      return;
    }
    collectReference(mask.imageId);
    collectReference(mask.texture);
    (mask.imageIds ?? []).forEach(collectReference);
    (mask.textures ?? []).forEach(collectReference);
    (mask.items ?? []).forEach(collectMask);
  };

  const preview = animation.preview ?? {};
  collectPreviewSlot(preview.background ?? preview.backgroundImageId);
  collectPreviewSlot(preview.outgoing ?? preview.outgoingImageId);
  collectPreviewSlot(preview.incoming ?? preview.incomingImageId);
  collectPreviewSlot(
    preview.target ?? preview.targetImageId ?? preview.incoming,
  );
  collectMask(animation.animation?.mask);
  return references;
};

const addAnimationPreviews = async ({
  manifest,
  sourceRepository,
  fileBytesById,
  readSourceFile,
  renderPreviews,
}) => {
  const files = manifest.repository?.files?.items ?? {};
  const animations = manifest.repository?.animations?.items ?? {};
  const imageItems = sourceRepository.images?.items ?? {};
  const imagesByFileId = new Map(
    Object.values(imageItems)
      .filter((image) => image?.fileId)
      .map((image) => [image.fileId, image]),
  );
  const previewInputs = [];
  for (const [animationId, animation] of Object.entries(animations)) {
    if (animation.type !== "animation") {
      continue;
    }

    const referencedImages = Array.from(
      collectAnimationImageReferences(animation),
    )
      .map(
        (reference) => imageItems[reference] ?? imagesByFileId.get(reference),
      )
      .filter((image) => image?.fileId);
    const imageAssets = await Promise.all(
      Array.from(
        new Map(
          referencedImages.map((image) => [image.fileId, image]),
        ).values(),
      ).map(async (image) => {
        const file = sourceRepository.files?.items?.[image.fileId];
        return {
          fileId: image.fileId,
          bytes: await readSourceFile(image.fileId),
          mimeType: file?.mimeType ?? image.fileType ?? "image/png",
        };
      }),
    );
    previewInputs.push({ animationId, animation, imageAssets });
  }

  if (previewInputs.length === 0) {
    return;
  }

  const previews = await renderPreviews({
    animations: previewInputs,
    imagesData: sourceRepository.images,
    projectResolution: sourceRepository.project?.resolution,
  });
  const previewByAnimationId = new Map(
    previews.map((preview) => [preview.animationId, preview]),
  );
  for (const { animationId, animation } of previewInputs) {
    const preview = previewByAnimationId.get(animationId);
    if (!preview) {
      throw new Error(`Animation preview '${animationId}' was not generated.`);
    }
    await addGeneratedVideoPreviews({
      preview,
      files,
      fileBytesById,
      item: animation,
      prefix: "animation",
      resourceId: animationId,
    });
  }
};

const addParticlePreviews = async ({
  manifest,
  sourceRepository,
  fileBytesById,
  readSourceFile,
  renderPreview,
}) => {
  const files = manifest.repository?.files?.items ?? {};
  const particles = manifest.repository?.particles?.items ?? {};
  const imageItems = sourceRepository.images?.items ?? {};
  for (const [particleId, particle] of Object.entries(particles)) {
    if (particle.type !== "particle") {
      continue;
    }

    const imageAssets = await Promise.all(
      collectParticleTextureImageIds(particle, imageItems).map(
        async (imageId) => {
          const image = imageItems[imageId];
          const file = sourceRepository.files?.items?.[image?.fileId];
          return {
            fileId: image.fileId,
            bytes: await readSourceFile(image.fileId),
            mimeType: file?.mimeType ?? "image/png",
          };
        },
      ),
    );
    await addGeneratedVideoPreviews({
      preview: await renderPreview({ particle, imageItems, imageAssets }),
      files,
      fileBytesById,
      item: particle,
      prefix: "particle",
      resourceId: particleId,
    });
  }
};

export const createAssetPackageExportService = ({
  getFileContent,
  getRepositoryState,
  fetchImpl = globalThis.fetch,
  renderWaveformThumbnail = createWaveformThumbnail,
  renderSpritesheetPreview = renderDefaultSpritesheetPreview,
  renderFontPreview = renderDefaultFontPreview,
  renderTextStylePreview = renderDefaultTextStylePreview,
  renderAnimationPreviews = renderDefaultAnimationPreviews,
  renderParticlePreview = renderDefaultParticlePreview,
}) => ({
  async createAssetPackageBundle({ manifest } = {}) {
    const exportManifest = structuredClone(manifest);
    const sourceRepository = getRepositoryState?.() ?? manifest.repository;
    const files = exportManifest.repository?.files?.items ?? {};
    const fileBytesById = new Map();

    for (const fileId of Object.keys(files)) {
      fileBytesById.set(
        fileId,
        await readProjectFile({ fileId, getFileContent, fetchImpl }),
      );
    }
    const readSourceFile = createSourceFileReader({
      fileBytesById,
      getFileContent,
      fetchImpl,
    });

    await generatePreviewStage({
      label: "sound waveform",
      generate: () =>
        addSoundWaveformPreviews({
          manifest: exportManifest,
          fileBytesById,
          renderWaveformThumbnail,
        }),
    });
    await generatePreviewStage({
      label: "spritesheet",
      generate: () =>
        addSpritesheetPreviews({
          manifest: exportManifest,
          sourceRepository,
          fileBytesById,
          readSourceFile,
          renderPreview: renderSpritesheetPreview,
        }),
    });
    await generatePreviewStage({
      label: "font",
      generate: () =>
        addFontPreviews({
          manifest: exportManifest,
          sourceRepository,
          fileBytesById,
          readSourceFile,
          renderPreview: renderFontPreview,
        }),
    });
    await generatePreviewStage({
      label: "text style",
      generate: () =>
        addTextStylePreviews({
          manifest: exportManifest,
          sourceRepository,
          fileBytesById,
          readSourceFile,
          renderPreview: renderTextStylePreview,
        }),
    });
    await generatePreviewStage({
      label: "animation",
      generate: () =>
        addAnimationPreviews({
          manifest: exportManifest,
          sourceRepository,
          fileBytesById,
          readSourceFile,
          renderPreviews: renderAnimationPreviews,
        }),
    });
    await generatePreviewStage({
      label: "particle",
      generate: () =>
        addParticlePreviews({
          manifest: exportManifest,
          sourceRepository,
          fileBytesById,
          readSourceFile,
          renderPreview: renderParticlePreview,
        }),
    });

    const zip = new JSZip();
    zip.file(
      "package.json",
      `${JSON.stringify(exportManifest, undefined, 2)}\n`,
    );
    for (const [fileId, bytes] of fileBytesById) {
      zip.file(getPackageFilePath(fileId), bytes);
    }

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/zip",
    });
  },
});
