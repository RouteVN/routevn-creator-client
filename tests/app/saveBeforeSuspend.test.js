import { afterEach, describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import { createAppServiceCore } from "../../src/deps/services/shared/appServiceCore.js";

const createService = (errorTracker = { capture: vi.fn() }) =>
  createAppServiceCore({
    db: { get: async () => undefined, set: async () => {} },
    subject: new Subject(),
    projectService: { getEnsuredProjectId: () => undefined },
    router: { getPathName: () => "/projects", getPayload: () => ({}) },
    globalUI: { showToast: vi.fn() },
    platform: "android",
    errorTracker,
  });

afterEach(() => vi.restoreAllMocks());

describe("app service saveBeforeSuspend", () => {
  it("asks the open page to save, with the reason", async () => {
    const service = createService();
    const saves = [];
    service.registerBeforeNavigation(async (payload) => {
      saves.push(payload);
    });

    await service.saveBeforeSuspend("background");
    await service.saveBeforeSuspend("quit");

    expect(saves).toEqual([{ reason: "background" }, { reason: "quit" }]);
  });

  it("does nothing when no page has anything to save", async () => {
    const service = createService();

    await expect(service.saveBeforeSuspend("background")).resolves.toBe(
      undefined,
    );
  });

  it("reports a failed save and does not throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errorTracker = { capture: vi.fn() };
    const service = createService(errorTracker);
    const failure = new Error("Storage is full");
    service.registerBeforeNavigation(async () => {
      throw failure;
    });

    await expect(service.saveBeforeSuspend("background")).resolves.toBe(
      undefined,
    );

    expect(errorTracker.capture).toHaveBeenCalledWith(failure, {
      operation: "app.saveBeforeSuspend",
    });
  });
});
