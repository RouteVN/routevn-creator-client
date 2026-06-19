const getAndroidBridge = () => {
  const bridge = window.RouteVNAndroid;
  if (!bridge) {
    throw new Error("Android bridge is not available.");
  }
  return bridge;
};

export const callAndroidBridge = (method, payload = {}) => {
  const bridge = getAndroidBridge();
  const fn = bridge[method];
  if (typeof fn !== "function") {
    throw new Error(`Android bridge method is not available: ${method}`);
  }

  const rawResult = fn.call(bridge, JSON.stringify(payload));
  let result;
  try {
    result = JSON.parse(rawResult);
  } catch {
    throw new Error(`Android bridge returned invalid JSON for ${method}.`);
  }

  if (!result?.ok) {
    const error = new Error(
      result?.error?.message || `Android bridge call failed: ${method}`,
    );
    error.code = result?.error?.code;
    error.details = result?.error?.details;
    throw error;
  }

  return result.value;
};

export const uint8ArrayToBase64 = (bytes) => {
  const resolvedBytes =
    bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < resolvedBytes.length; index += chunkSize) {
    const chunk = resolvedBytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export const base64ToUint8Array = (base64) => {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
