export const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;

// Allow large local files and video decoders more time, without an unbounded wait.
export const getAssetTimeoutMs = ({ size = 0, type, mimeType } = {}) =>
  Math.min(
    120_000,
    Math.max(
      (type ?? mimeType ?? "").startsWith("video/") ? 120_000 : 30_000,
      30_000 + Math.floor(size / (50 * 1024 * 1024)) * 30_000,
    ),
  );

// Bound the caller's wait even when a native bridge/decoder ignores AbortSignal.
// onLateResolve releases resources returned by such an abandoned operation.
export const runAsyncOperation = (
  operation,
  {
    timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
    signal,
    label = "Operation",
    onLateResolve,
  } = {},
) =>
  new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) {
        controller.abort(error);
        reject(error);
      } else resolve(value);
    };
    const abort = () =>
      finish(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      const error = new Error(
        `${label} timed out after ${timeoutMs / 1000} seconds.`,
      );
      error.name = "TimeoutError";
      error.code = "operation_timeout";
      error.operation = label;
      error.timeoutMs = timeoutMs;
      finish(error);
    }, timeoutMs);
    Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      })
      .then(
        (value) => {
          if (settled) onLateResolve?.(value);
          else finish(undefined, value);
        },
        (error) => finish(error),
      )
      .catch((error) => {
        console.error("Failed to release an abandoned operation", error);
      });
  });
