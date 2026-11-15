// Canvas work for spritesheets made from separate frame pictures.

export const loadImageFromUrl = (url) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = url;
  });
};

const createCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create a canvas context");
  }

  return { canvas, context };
};

const canvasToPngBlob = (canvas) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to create a PNG image"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
};

const releaseCanvas = (canvas) => {
  // Safari keeps canvas memory until the size is reset.
  canvas.width = 0;
  canvas.height = 0;
};

// Draws each frame at its placement and returns the sheet as a PNG blob.
// `frames[i].url` is the picture for `placements[i]`.
export const renderSpritesheetImage = async ({
  sheetWidth,
  sheetHeight,
  frames = [],
  placements = [],
} = {}) => {
  const images = await Promise.all(
    frames.map((frame) => loadImageFromUrl(frame.url)),
  );
  const { canvas, context } = createCanvas(sheetWidth, sheetHeight);

  try {
    context.clearRect(0, 0, sheetWidth, sheetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    placements.forEach((placement, index) => {
      const image = images[index];
      context.drawImage(
        image,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        placement.x,
        placement.y,
        placement.width,
        placement.height,
      );
    });

    return await canvasToPngBlob(canvas);
  } finally {
    releaseCanvas(canvas);
  }
};

// Cuts every crop out of a sheet and returns one PNG blob per crop.
export const cropSpritesheetFrames = async ({ url, crops = [] } = {}) => {
  const sheet = await loadImageFromUrl(url);
  const blobs = [];

  for (const crop of crops) {
    const { canvas, context } = createCanvas(
      crop.outputWidth,
      crop.outputHeight,
    );

    try {
      context.clearRect(0, 0, crop.outputWidth, crop.outputHeight);
      if (crop.rotated) {
        // The sheet stores the frame turned 90 degrees clockwise; turn it back.
        context.setTransform(
          0,
          -1,
          1,
          0,
          crop.drawX,
          crop.drawY + crop.drawHeight,
        );
      } else {
        context.setTransform(1, 0, 0, 1, crop.drawX, crop.drawY);
      }
      context.drawImage(
        sheet,
        crop.sourceX,
        crop.sourceY,
        crop.sourceWidth,
        crop.sourceHeight,
        0,
        0,
        crop.sourceWidth,
        crop.sourceHeight,
      );
      blobs.push(await canvasToPngBlob(canvas));
    } finally {
      releaseCanvas(canvas);
    }
  }

  return blobs;
};

export const readImageSizeFromUrl = async (url) => {
  const image = await loadImageFromUrl(url);
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
};
