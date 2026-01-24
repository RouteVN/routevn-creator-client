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
  let onWriteCallback = null;

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

      // Clear existing timer for this key
      if (timers.has(key)) {
        clearTimeout(timers.get(key));
      }

      // Schedule new debounced write
      const timer = setTimeout(async () => {
        timers.delete(key);
        const currentData = pending.get(key);

        if (currentData && onWriteCallback) {
          try {
            await onWriteCallback(key, currentData);
            // Only delete if reference matches (prevents race condition)
            if (pending.get(key) === currentData) {
              pending.delete(key);
            }
          } catch (error) {
            console.error(`Debounced write failed for ${key}:`, error);
            // Keep in pending for next attempt or flush
          }
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

    /**
     * Flush all pending updates immediately.
     * Cancels all pending debounce timers first,
     * then writes all entries using provided writeFn.
     * On failure, restores the entry back to the queue.
     *
     * @param {Function} writeFn - async (key, data) => void
     */
    async flush(writeFn) {
      // Cancel all pending timers first
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();

      if (pending.size === 0) {
        return;
      }

      // Snapshot and clear immediately
      const entries = Array.from(pending.entries());
      pending.clear();

      // Write all entries
      for (const [key, data] of entries) {
        try {
          await writeFn(key, data);
        } catch (error) {
          // Restore failed entry back to queue
          pending.set(key, data);
          console.error(`Flush failed for ${key}:`, error);
        }
      }
    },
  };
}
