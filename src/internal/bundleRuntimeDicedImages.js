const EPSILON = 1e-6;

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const getEdge = (ax, ay, bx, by, px, py) => {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
};

const createCanvas = ({ width, height }) => {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  throw new Error(
    "Canvas APIs are unavailable for diced image reconstruction.",
  );
};

const decodeImageBitmap = async (blob) => {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  if (typeof Image !== "function") {
    throw new Error("Image decoding APIs are unavailable.");
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () =>
        reject(new Error("Failed to decode atlas image."));
      nextImage.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const rasterizeDicedImagePixels = ({
  width,
  height,
  atlas,
  vertices = [],
  uvs = [],
  indices = [],
  rect = {},
}) => {
  const outputWidth = Number(width ?? 0);
  const outputHeight = Number(height ?? 0);
  const atlasWidth = Number(atlas?.width ?? 0);
  const atlasHeight = Number(atlas?.height ?? 0);
  const atlasPixels = atlas?.pixels;

  if (
    !Number.isFinite(outputWidth) ||
    !Number.isFinite(outputHeight) ||
    outputWidth <= 0 ||
    outputHeight <= 0
  ) {
    throw new Error("Invalid diced image dimensions.");
  }

  if (
    !Number.isFinite(atlasWidth) ||
    !Number.isFinite(atlasHeight) ||
    atlasWidth <= 0 ||
    atlasHeight <= 0 ||
    !(atlasPixels instanceof Uint8ClampedArray)
  ) {
    throw new Error("Invalid diced atlas pixels.");
  }

  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let index = 0; index < indices.length; index += 3) {
    const indexA = Number(indices[index]);
    const indexB = Number(indices[index + 1]);
    const indexC = Number(indices[index + 2]);
    const vertexA = vertices[indexA];
    const vertexB = vertices[indexB];
    const vertexC = vertices[indexC];
    const uvA = uvs[indexA];
    const uvB = uvs[indexB];
    const uvC = uvs[indexC];

    if (!vertexA || !vertexB || !vertexC || !uvA || !uvB || !uvC) {
      continue;
    }

    const ax = Number(vertexA.x ?? 0);
    const ay = Number(vertexA.y ?? 0);
    const bx = Number(vertexB.x ?? 0);
    const by = Number(vertexB.y ?? 0);
    const cx = Number(vertexC.x ?? 0);
    const cy = Number(vertexC.y ?? 0);

    const area = getEdge(ax, ay, bx, by, cx, cy);
    if (Math.abs(area) <= EPSILON) {
      continue;
    }

    const minX = clamp(Math.floor(Math.min(ax, bx, cx)), 0, outputWidth - 1);
    const maxX = clamp(Math.ceil(Math.max(ax, bx, cx)) - 1, 0, outputWidth - 1);
    const minY = clamp(Math.floor(Math.min(ay, by, cy)), 0, outputHeight - 1);
    const maxY = clamp(
      Math.ceil(Math.max(ay, by, cy)) - 1,
      0,
      outputHeight - 1,
    );

    if (maxX < minX || maxY < minY) {
      continue;
    }

    const atlasAx = Number(uvA.u ?? uvA.x ?? 0) * atlasWidth;
    const atlasAy = Number(uvA.v ?? uvA.y ?? 0) * atlasHeight;
    const atlasBx = Number(uvB.u ?? uvB.x ?? 0) * atlasWidth;
    const atlasBy = Number(uvB.v ?? uvB.y ?? 0) * atlasHeight;
    const atlasCx = Number(uvC.u ?? uvC.x ?? 0) * atlasWidth;
    const atlasCy = Number(uvC.v ?? uvC.y ?? 0) * atlasHeight;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const pixelCenterX = x + 0.5;
        const pixelCenterY = y + 0.5;
        const weightA =
          getEdge(bx, by, cx, cy, pixelCenterX, pixelCenterY) / area;
        const weightB =
          getEdge(cx, cy, ax, ay, pixelCenterX, pixelCenterY) / area;
        const weightC = 1 - weightA - weightB;

        if (weightA < -EPSILON || weightB < -EPSILON || weightC < -EPSILON) {
          continue;
        }

        const sourceX = clamp(
          Math.floor(weightA * atlasAx + weightB * atlasBx + weightC * atlasCx),
          0,
          atlasWidth - 1,
        );
        const sourceY = clamp(
          Math.floor(weightA * atlasAy + weightB * atlasBy + weightC * atlasCy),
          0,
          atlasHeight - 1,
        );
        const sourceOffset = (sourceY * atlasWidth + sourceX) * 4;
        const targetOffset = (y * outputWidth + x) * 4;

        output[targetOffset] = atlasPixels[sourceOffset];
        output[targetOffset + 1] = atlasPixels[sourceOffset + 1];
        output[targetOffset + 2] = atlasPixels[sourceOffset + 2];
        output[targetOffset + 3] = atlasPixels[sourceOffset + 3];
      }
    }
  }

  return output;
};

const decodeAtlasBufferToPixels = async ({ buffer, mime }) => {
  const blob = new Blob([buffer], { type: mime || "image/png" });
  const decodedImage = await decodeImageBitmap(blob);

  try {
    const width = Number(decodedImage.width ?? decodedImage.naturalWidth ?? 0);
    const height = Number(
      decodedImage.height ?? decodedImage.naturalHeight ?? 0,
    );
    const canvas = createCanvas({ width, height });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Failed to acquire a 2D canvas context.");
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(decodedImage, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);

    return {
      width,
      height,
      pixels: imageData.data,
    };
  } finally {
    if (typeof decodedImage.close === "function") {
      decodedImage.close();
    }
  }
};

const encodePixelsToObjectUrl = async ({ width, height, pixels }) => {
  const canvas = createCanvas({ width, height });
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to acquire a 2D canvas context.");
  }

  context.putImageData(new ImageData(pixels, width, height), 0, 0);

  let blob;
  if (typeof canvas.convertToBlob === "function") {
    blob = await canvas.convertToBlob({ type: "image/png" });
  } else {
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }

        reject(new Error("Failed to encode diced image as PNG."));
      }, "image/png");
    });
  }

  return URL.createObjectURL(blob);
};

export const createRuntimeAssetFromDicedImage = async ({
  asset,
  atlases = {},
  atlasCache = new Map(),
}) => {
  const atlasId = asset?.atlasId;
  if (!atlasId) {
    throw new Error("Diced image asset is missing atlasId.");
  }

  if (!atlasCache.has(atlasId)) {
    const atlasEntry = atlases[atlasId];
    if (!atlasEntry?.buffer) {
      throw new Error(`Missing diced atlas payload: ${atlasId}`);
    }

    atlasCache.set(
      atlasId,
      decodeAtlasBufferToPixels({
        buffer: atlasEntry.buffer,
        mime: atlasEntry.mime,
      }),
    );
  }

  const atlas = await atlasCache.get(atlasId);
  const pixels = rasterizeDicedImagePixels({
    width: asset.width,
    height: asset.height,
    atlas,
    vertices: asset.vertices,
    uvs: asset.uvs,
    indices: asset.indices,
    rect: asset.rect,
  });
  const url = await encodePixelsToObjectUrl({
    width: Number(asset.width ?? 0),
    height: Number(asset.height ?? 0),
    pixels,
  });

  return {
    url,
    type: "image/png",
    size: pixels.byteLength,
  };
};
