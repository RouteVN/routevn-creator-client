export const animationCanvasDataUrlToBlob = (value) => {
  if (!value) {
    throw new Error("Animation canvas image is missing.");
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Animation canvas image is invalid.");
  }

  const header = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1);
  const mimeType = header.match(/^data:([^;,]+)?(?:;base64)?$/)?.[1];
  if (!mimeType) {
    throw new Error("Animation canvas image is invalid.");
  }

  if (!header.includes(";base64")) {
    return new Blob([decodeURIComponent(body)], { type: mimeType });
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};
