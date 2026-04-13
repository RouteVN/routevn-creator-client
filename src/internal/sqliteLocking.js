export const SQLITE_BUSY_TIMEOUT_MS = 15000;

const SQLITE_LOCK_RETRY_DELAYS_MS = [80, 160, 320, 640, 1000, 1500];

const wait = (ms) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

export const isSqliteLockError = (error) => {
  if (!error) {
    return false;
  }

  if (error.code === 5 || error.code === "SQLITE_BUSY") {
    return true;
  }

  const message = String(error?.message ?? error).toLowerCase();
  return (
    message.includes("database is locked") ||
    message.includes("database busy") ||
    message.includes("database is busy") ||
    message.includes("sqlite_busy") ||
    message.includes("sqlite_locked") ||
    message.includes("code: 5")
  );
};

export const withSqliteLockRetry = async (
  operation,
  { retryDelaysMs = SQLITE_LOCK_RETRY_DELAYS_MS } = {},
) => {
  const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : [];
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteLockError(error) || attempt >= delays.length) {
        throw error;
      }

      await wait(delays[attempt]);
      attempt += 1;
    }
  }
};
