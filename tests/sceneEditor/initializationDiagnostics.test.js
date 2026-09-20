import { describe, expect, it } from "vitest";
import { formatSceneInitializationDiagnostics } from "../../src/pages/sceneEditorLexical/support/initializationDiagnostics.js";

describe("scene initialization diagnostics", () => {
  it("includes the failed step and nested error metadata", () => {
    const cause = new Error("File read timed out");
    cause.name = "TimeoutError";
    cause.code = "operation_timeout";
    cause.operation = "read-file";
    cause.timeoutMs = 15000;
    cause.fileId = "file-one";
    const error = new Error("Scene startup failed", { cause });
    error.details = { privateProjectContent: "unrelated project text" };
    const report = formatSceneInitializationDiagnostics({
      error,
      progress: {
        stage: "preloading",
        assetName: "Background One",
        completed: 2,
        total: 3,
      },
    });
    for (const detail of [
      "Step: preloading",
      "Error: Error: Scene startup failed",
      "Caused by: TimeoutError: File read timed out",
      "Code: operation_timeout",
      "Operation: read-file",
      "Timeout (ms): 15000",
      "File ID: file-one",
      "Asset: Background One",
      "Asset progress: 2 / 3",
      error.stack,
      cause.stack,
    ])
      expect(report).toContain(detail);
    expect(report).not.toContain("unrelated project text");
  });

  it("handles native string rejections and absent error messages", () => {
    expect(
      formatSceneInitializationDiagnostics({ error: "database is locked" }),
    ).toContain("Error: Error: database is locked");
    expect(
      formatSceneInitializationDiagnostics({ error: undefined }),
    ).toContain("No error message was provided.");
  });

  it("includes aggregate errors without looping over cyclic causes", () => {
    const child = new Error("Decode failed");
    const error = new AggregateError(
      [child, "Native read failed"],
      "Assets failed",
    );
    child.cause = error;
    const report = formatSceneInitializationDiagnostics({ error });
    expect(report).toContain("Related error: Error: Decode failed");
    expect(report).toContain("Related error: Error: Native read failed");
    expect(report.match(/Error: AggregateError: Assets failed/g)).toHaveLength(
      1,
    );
  });
});
