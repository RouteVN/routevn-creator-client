import {
  getNavigationTimingNow,
  logAndroidBridgeTiming,
} from "../../../internal/navigationTiming.js";

const BRIDGE_PROTOCOL_VERSION = 1;
const BRIDGE_RESPONSE_TIMEOUT_MS = 30 * 60 * 1000;

let nextBridgeRequestId = 1;
let configuredBridge;
const pendingBridgeRequests = new Map();

const getAndroidBridge = () => {
  const bridge = window.RouteVNAndroid;
  if (typeof bridge?.postMessage !== "function") {
    throw new Error("Android bridge is not available.");
  }
  return bridge;
};

const getBridgeResultSize = (value) => {
  if (Array.isArray(value) || typeof value === "string") {
    return value.length;
  }

  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }

  return undefined;
};

const handleAndroidBridgeMessage = (event) => {
  let response;
  try {
    response = JSON.parse(event.data);
  } catch {
    return;
  }

  if (response?.version !== BRIDGE_PROTOCOL_VERSION) {
    return;
  }

  const pending = pendingBridgeRequests.get(response.id);
  if (!pending) {
    return;
  }

  pendingBridgeRequests.delete(response.id);
  clearTimeout(pending.timeoutId);

  if (response.ok === true) {
    pending.resolve(response.value);
    return;
  }

  const error = new Error(
    response.error?.message ?? `Android bridge call failed: ${pending.method}`,
  );
  error.code = response.error?.code;
  pending.reject(error);
};

const ensureAndroidBridgeListener = () => {
  const bridge = getAndroidBridge();
  if (configuredBridge !== bridge) {
    bridge.onmessage = handleAndroidBridgeMessage;
    configuredBridge = bridge;
  }
  return bridge;
};

export const callAndroidBridge = async (method, payload = {}) => {
  const startedAt = getNavigationTimingNow();
  const bridge = ensureAndroidBridgeListener();

  let ok = false;
  let errorCode;
  let resultSize;
  try {
    const requestId = String(nextBridgeRequestId);
    nextBridgeRequestId += 1;

    const value = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error(`Android bridge call timed out: ${method}`));
      }, BRIDGE_RESPONSE_TIMEOUT_MS);

      pendingBridgeRequests.set(requestId, {
        method,
        resolve,
        reject,
        timeoutId,
      });

      try {
        bridge.postMessage(
          JSON.stringify({
            version: BRIDGE_PROTOCOL_VERSION,
            id: requestId,
            method,
            payload,
          }),
        );
      } catch (error) {
        pendingBridgeRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    ok = true;
    resultSize = getBridgeResultSize(value);
    return value;
  } catch (error) {
    errorCode = error?.code;
    throw error;
  } finally {
    logAndroidBridgeTiming({
      method,
      durationMs: getNavigationTimingNow() - startedAt,
      resultSize,
      ok,
      errorCode,
    });
  }
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
