import { runAsyncOperation } from "../../../internal/asyncOperation.js";

let uploadTextureLimit;

// Upload pages may not have a renderer yet. Probe once, release the temporary
// context immediately, and never persist a device capability in project data.
export const getMaxTextureSize = (canvas) => {
  if (!canvas && uploadTextureLimit) return uploadTextureLimit;
  const target = canvas ?? document.createElement("canvas");
  const gl = target.getContext("webgl2") ?? target.getContext("webgl");
  if (!gl || gl.isContextLost()) {
    throw new Error("Unable to determine the device image size limit.");
  }
  const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (!canvas) gl.getExtension("WEBGL_lose_context")?.loseContext();
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Unable to determine the device image size limit.");
  }
  if (!canvas) uploadTextureLimit = limit;
  return limit;
};

export const assertImageTextureDimensions = (dimensions, limit) => {
  if (!dimensions) throw new Error("Unable to read image dimensions.");
  const { width, height } = dimensions;
  if (width <= limit && height <= limit) return;
  const error = new Error(
    `Image ${width} × ${height} exceeds this device's ${limit} pixel texture limit.`,
  );
  error.code = "image_texture_too_large";
  error.width = width;
  error.height = height;
  error.limit = limit;
  throw error;
};

export const validateImageTextureSource = async (
  asset,
  { limit, signal } = {},
) => {
  const ownedUrl = asset.buffer
    ? URL.createObjectURL(new Blob([asset.buffer], { type: asset.type }))
    : undefined;
  const image = new Image();
  try {
    await runAsyncOperation(
      () => {
        image.src = ownedUrl ?? asset.url;
        return image.decode();
      },
      { signal, label: "Read image dimensions" },
    );
    assertImageTextureDimensions(
      { width: image.naturalWidth, height: image.naturalHeight },
      limit,
    );
  } finally {
    image.removeAttribute("src");
    if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  }
};
