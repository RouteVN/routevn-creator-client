// The bytes of a data URL, such as a canvas capture, as a Blob of its type.
export const dataUrlToBlob = (value) => {
  const commaIndex = value.indexOf(",");
  const headerMatch = value
    .slice(0, commaIndex)
    .match(/^data:([^;,]+)?(;base64)?$/);
  if (commaIndex < 0 || !headerMatch) {
    throw new Error("The image is not a valid data URL.");
  }

  const type = headerMatch[1] ?? "application/octet-stream";
  const body = value.slice(commaIndex + 1);
  if (!headerMatch[2]) {
    return new Blob([decodeURIComponent(body)], { type });
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
};
