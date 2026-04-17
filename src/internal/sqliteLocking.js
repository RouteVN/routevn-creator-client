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

export const isSqliteNoActiveTransactionError = (error) => {
  if (!error) {
    return false;
  }

  const message = String(error?.message ?? error).toLowerCase();
  return message.includes("no transaction is active");
};

export const withSqliteLockRetry = async (
  operation,
  {
    retryDelaysMs = SQLITE_LOCK_RETRY_DELAYS_MS,
    shouldRecoverError,
    recoverValue,
    onRetry,
  } = {},
) => {
  const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : [];
  let attempt = 0;
  let sawLock = false;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        typeof shouldRecoverError === "function" &&
        shouldRecoverError(error, { attempt, sawLock })
      ) {
        return typeof recoverValue === "function"
          ? recoverValue(error, { attempt, sawLock })
          : recoverValue;
      }

      if (!isSqliteLockError(error) || attempt >= delays.length) {
        throw error;
      }

      onRetry?.({
        attempt: attempt + 1,
        delayMs: delays[attempt],
        error,
        sawLock,
      });
      sawLock = true;
      await wait(delays[attempt]);
      attempt += 1;
    }
  }
};
