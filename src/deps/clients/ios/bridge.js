import {
  getNavigationTimingNow,
  logAndroidBridgeTiming,
} from "../../../internal/navigationTiming.js";

const IOS_BRIDGE_CALLBACK = "__routeVNIOSBridgeResult";

let nextIOSBridgeRequestId = 1;
const pendingIOSBridgeCalls = new Map();

const getIOSBridge = () => {
  const bridge = window.webkit?.messageHandlers?.RouteVNIOS;
  if (!bridge || typeof bridge.postMessage !== "function") {
    throw new Error("iOS bridge is not available.");
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

const ensureIOSBridgeCallback = () => {
  window[IOS_BRIDGE_CALLBACK] = (result = {}) => {
    const requestId = result.id;
    const pending = pendingIOSBridgeCalls.get(requestId);
    if (!pending) {
      return;
    }

    pendingIOSBridgeCalls.delete(requestId);
    if (!result.ok) {
      const error = new Error(
        result?.error?.message || `iOS bridge call failed: ${pending.method}`,
      );
      error.code = result?.error?.code;
      error.details = result?.error?.details;
      pending.reject(error);
      return;
    }

    pending.resolve(result.value);
  };
};

export const callIOSBridge = (method, payload = {}) => {
  ensureIOSBridgeCallback();

  const startedAt = getNavigationTimingNow();
  const requestId = `ios-${nextIOSBridgeRequestId}`;
  nextIOSBridgeRequestId += 1;

  return new Promise((resolve, reject) => {
    let ok = false;
    let errorCode;
    let resultSize;
    const finish = (error, value) => {
      ok = !error;
      errorCode = error?.code;
      resultSize = getBridgeResultSize(value);
      logAndroidBridgeTiming({
        method: `ios.${method}`,
        durationMs: getNavigationTimingNow() - startedAt,
        resultSize,
        ok,
        errorCode,
      });
    };

    const originalResolve = resolve;
    const originalReject = reject;
    pendingIOSBridgeCalls.set(requestId, {
      method,
      resolve(value) {
        finish(undefined, value);
        originalResolve(value);
      },
      reject(error) {
        finish(error);
        originalReject(error);
      },
    });

    try {
      getIOSBridge().postMessage({
        id: requestId,
        method,
        payload,
      });
    } catch (error) {
      pendingIOSBridgeCalls.delete(requestId);
      finish(error);
      reject(error);
    }
  });
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
