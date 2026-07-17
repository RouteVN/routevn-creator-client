import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRepositoryEventsFromClientStore } from "../../src/deps/services/shared/collab/clientStoreHistory.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clientStoreHistory", () => {
  it("fails without deleting an invalid project bootstrap draft", async () => {
    const applySubmitResult = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const store = {
      applySubmitResult,
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => [
        {
          id: "project-create:project-1",
          partition: "m",
          projectId: "project-1",
          type: "project.create",
          schemaVersion: 1,
          payload: {
            state: undefined,
          },
          clientTs: 1,
          createdAt: 1,
        },
      ]),
    };

    await expect(
      loadRepositoryEventsFromClientStore({
        store,
        projectId: "project-1",
      }),
    ).rejects.toBeDefined();
    expect(applySubmitResult).not.toHaveBeenCalled();
  });
});
