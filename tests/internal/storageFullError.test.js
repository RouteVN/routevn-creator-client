import { describe, expect, it } from "vitest";
import { isStorageFullError } from "../../src/internal/storageFullError.js";

const withCode = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

describe("isStorageFullError", () => {
  it("recognizes the iOS file write failure by its native code", () => {
    // The system's message follows the device language, so the native bridge
    // sends a code instead.
    expect(
      isStorageFullError(
        withCode(
          "No hay suficiente espacio para guardar el archivo.",
          "storageFull",
        ),
      ),
    ).toBe(true);
  });

  it("recognizes the iOS file write failure by its English message", () => {
    expect(
      isStorageFullError(
        new Error(
          "You can’t save the file “project.db” because there isn’t enough space.",
        ),
      ),
    ).toBe(true);
    expect(
      isStorageFullError(
        new Error("You can't save the file because there isn't enough space."),
      ),
    ).toBe(true);
  });

  it("recognizes Android failures", () => {
    expect(
      isStorageFullError(
        withCode(
          "write failed: ENOSPC (No space left on device)",
          "IOException",
        ),
      ),
    ).toBe(true);
    expect(
      isStorageFullError(
        withCode(
          "database or disk is full (code 13 SQLITE_FULL)",
          "SQLiteFullException",
        ),
      ),
    ).toBe(true);
    expect(isStorageFullError(withCode("", "SQLiteFullException"))).toBe(true);
  });

  it("recognizes desktop failures, which arrive as plain strings", () => {
    expect(isStorageFullError("No space left on device (os error 28)")).toBe(
      true,
    );
    expect(
      isStorageFullError(
        "There is not enough space on the disk. (os error 112)",
      ),
    ).toBe(true);
    // Windows writes its own message in the system language, but Rust keeps
    // the error number.
    expect(isStorageFullError("Der Datenträger ist voll. (os error 112)")).toBe(
      true,
    );
    expect(
      isStorageFullError(
        "error returned from database: (code: 13) database or disk is full",
      ),
    ).toBe(true);
  });

  it("does not take other error numbers for a full disk", () => {
    // 39 is ENOTEMPTY on Linux, not a disk full error.
    expect(isStorageFullError("Directory not empty (os error 39)")).toBe(false);
  });

  it("recognizes full browser storage", () => {
    expect(
      isStorageFullError(
        new DOMException("The quota has been exceeded.", "QuotaExceededError"),
      ),
    ).toBe(true);
  });

  it("finds a full device behind a wrapping error", () => {
    const error = new Error("Failed to store the file.", {
      cause: new Error("No space left on device (os error 28)"),
    });

    expect(isStorageFullError(error)).toBe(true);
  });

  it("does not take other failures for a full device", () => {
    expect(isStorageFullError(undefined)).toBe(false);
    expect(isStorageFullError(null)).toBe(false);
    expect(isStorageFullError("")).toBe(false);
    expect(
      isStorageFullError(new Error("Cannot read properties of null")),
    ).toBe(false);
    expect(
      isStorageFullError(
        "error returned from database: (code: 14) unable to open database file",
      ),
    ).toBe(false);
    expect(
      isStorageFullError(new Error("Not enough space for the title.")),
    ).toBe(false);
    expect(isStorageFullError({ message: 42 })).toBe(false);
  });

  it("does not loop on a cause that points back at the error", () => {
    const error = new Error("Failed.");
    error.cause = error;

    expect(isStorageFullError(error)).toBe(false);
  });
});
