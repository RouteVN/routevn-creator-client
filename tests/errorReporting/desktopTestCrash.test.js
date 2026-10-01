import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { triggerTestCrash } = await import(
  "../../src/deps/clients/tauri/testCrash.js"
);

describe("desktop test crashes", () => {
  afterEach(() => {
    vi.useRealTimers();
    invoke.mockReset();
  });

  it("throws an uncaught webview error for an app crash", async () => {
    vi.useFakeTimers();

    await expect(triggerTestCrash("app")).resolves.toBe(true);

    expect(invoke).not.toHaveBeenCalled();
    let thrown;
    try {
      vi.runAllTimers();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.name).toBe("RouteVNTestCrash");
  });

  it("asks the desktop shell for other kinds", async () => {
    invoke.mockResolvedValueOnce(false);

    await expect(triggerTestCrash("native")).resolves.toBe(false);

    expect(invoke).toHaveBeenCalledWith("trigger_test_crash", {
      kind: "native",
    });
  });
});
