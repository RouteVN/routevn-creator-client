const padTimestampPart = (value) => String(value).padStart(2, "0");

export const createSceneCanvasFileName = (date = new Date()) => {
  const datePart = [
    date.getFullYear(),
    padTimestampPart(date.getMonth() + 1),
    padTimestampPart(date.getDate()),
  ].join("");
  const timePart = [
    padTimestampPart(date.getHours()),
    padTimestampPart(date.getMinutes()),
    padTimestampPart(date.getSeconds()),
  ].join("");

  return `scene-canvas-${datePart}-${timePart}.png`;
};

export const dataUrlToBlob = (value) => {
  if (!value) {
    throw new Error("Canvas image is missing");
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Canvas image is not a valid data URL");
  }

  const header = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;,]+)?(?:;base64)?$/);
  if (!mimeMatch) {
    throw new Error("Canvas image is not a valid data URL");
  }

  const mimeType = mimeMatch[1] ?? "application/octet-stream";
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
