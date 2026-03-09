import { debugLog, previewDebugText } from "../../utils/debugLog.js";

/**
 * Creates a pending queue service for managing debounced updates.
 *
 * Usage:
 * - onWrite(callback) - Register write callback (called when debounce fires)
 * - setAndSchedule(key, data) - Store pending update and schedule debounced write
 * - get(key) - Get pending update (undefined if not present or already flushed)
 * - flush(writeFn) - Cancel timers, immediately write all pending, clear queue
 * - size() - Number of pending updates
 *
 * @param {Object} options
 * @param {number} options.debounceMs - Debounce delay in milliseconds (default: 2000)
 */
export function createPendingQueueService({ debounceMs = 2000 } = {}) {
  const pending = new Map();
  const timers = new Map();
  const activeWrites = new Map();
  let onWriteCallback = null;

  const trackActiveWrite = async (key, writePromise) => {
    activeWrites.set(key, writePromise);

    try {
      await writePromise;
    } finally {
      if (activeWrites.get(key) === writePromise) {
        activeWrites.delete(key);
      }
    }
  };

  const waitForActiveWrites = async (key) => {
    if (key !== undefined) {
      const writePromise = activeWrites.get(key);
      if (writePromise) {
        await writePromise;
      }
      return;
    }

    if (activeWrites.size === 0) {
      return;
    }

    await Promise.all(Array.from(activeWrites.values()));
  };

  return {
    /**
     * Register callback to be called when debounce timer fires.
     * Should be called once during setup with access to deps.
     *
     * @param {Function} callback - async (key, data) => void
     */
    onWrite(callback) {
      onWriteCallback = callback;
    },

    /**
     * Store a pending update and schedule a debounced write.
     * If called again for the same key, resets the debounce timer.
     */
    setAndSchedule(key, data) {
      pending.set(key, data);
      debugLog("lines", "queue.set-and-schedule", {
        key,
        pendingSize: pending.size,
        content: previewDebugText(
          data?.content?.map((item) => item?.text ?? "").join(""),
        ),
      });

      // Clear existing timer for this key
      if (timers.has(key)) {
        clearTimeout(timers.get(key));
      }

      // Schedule new debounced write
      const timer = setTimeout(async () => {
        timers.delete(key);
        const currentData = pending.get(key);
        debugLog("lines", "queue.timer-fired", {
          key,
          hasCurrentData: !!currentData,
          pendingSize: pending.size,
        });

        if (currentData && onWriteCallback) {
          const writePromise = (async () => {
            try {
              debugLog("lines", "queue.write-start", {
                key,
                content: previewDebugText(
                  currentData?.content
                    ?.map((item) => item?.text ?? "")
                    .join(""),
                ),
              });
              await onWriteCallback(key, currentData);
              // Only delete if reference matches (prevents race condition)
              if (pending.get(key) === currentData) {
                pending.delete(key);
              }
              debugLog("lines", "queue.write-success", {
                key,
                pendingSize: pending.size,
              });
            } catch (error) {
              console.error(`Debounced write failed for ${key}:`, error);
              // Keep in pending for next attempt or flush
              debugLog("lines", "queue.write-failed", {
                key,
                message: error?.message,
              });
            }
          })();

          await trackActiveWrite(key, writePromise);
        }
      }, debounceMs);

      timers.set(key, timer);
    },

    /**
     * Get pending update by key. Returns undefined if not present.
     */
    get(key) {
      return pending.get(key);
    },

    /**
     * Check if key has pending update.
     */
    has(key) {
      return pending.has(key);
    },

    /**
     * Get number of pending updates.
     */
    size() {
      return pending.size;
    },

    entries() {
      return Array.from(pending.entries());
    },

    /**
     * Flush all pending updates immediately.
     * Cancels all pending debounce timers first,
     * then writes all entries using provided writeFn.
     * On failure, restores the entry back to the queue.
     *
     * @param {Function} writeFn - async (key, data) => void
     */
    async flush(writeFn) {
      debugLog("lines", "queue.flush-start", {
        pendingSize: pending.size,
        activeWrites: activeWrites.size,
      });
      // Cancel all pending timers first
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();

      // Wait for any debounced write that has already started so a structural
      // mutation does not race against an older text write landing afterward.
      await waitForActiveWrites();

      if (pending.size === 0) {
        return;
      }

      // Snapshot and clear immediately
      const entries = Array.from(pending.entries());
      pending.clear();
      debugLog("lines", "queue.flush-entries", {
        count: entries.length,
        keys: entries.map(([key]) => key),
      });

      // Write all entries
      for (const [key, data] of entries) {
        try {
          debugLog("lines", "queue.flush-write-start", {
            key,
            content: previewDebugText(
              data?.content?.map((item) => item?.text ?? "").join(""),
            ),
          });
          await writeFn(key, data);
          debugLog("lines", "queue.flush-write-success", {
            key,
          });
        } catch (error) {
          // Restore failed entry back to queue
          pending.set(key, data);
          console.error(`Flush failed for ${key}:`, error);
          debugLog("lines", "queue.flush-write-failed", {
            key,
            message: error?.message,
          });
        }
      }

      debugLog("lines", "queue.flush-end", {
        pendingSize: pending.size,
        activeWrites: activeWrites.size,
      });
    },

    async waitForIdle(key) {
      await waitForActiveWrites(key);
    },
  };
}
