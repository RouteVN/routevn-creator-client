import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSqliteLockError,
  withSqliteLockRetry,
} from "../../src/internal/sqliteLocking.js";

const createLockError = (message = "database is locked") => {
  const error = new Error(message);
  error.code = 5;
  return error;
};

describe("sqliteLocking", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recognizes sqlite lock errors from code and message variants", () => {
    expect(isSqliteLockError(createLockError())).toBe(true);
    expect(
      isSqliteLockError({
        code: "SQLITE_BUSY",
        message: "SQLITE_BUSY: database busy",
      }),
    ).toBe(true);
    expect(isSqliteLockError(new Error("database is busy"))).toBe(true);
    expect(isSqliteLockError(new Error("validation failed"))).toBe(false);
  });

  it("retries lock errors until the operation succeeds", async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(createLockError())
      .mockRejectedValueOnce(new Error("SQLITE_BUSY: database busy"))
      .mockResolvedValue("ok");

    const pending = withSqliteLockRetry(operation, {
      retryDelaysMs: [10, 20],
    });

    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10);
    expect(operation).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(20);
    await expect(pending).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-lock errors", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withSqliteLockRetry(operation)).rejects.toThrow("boom");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
