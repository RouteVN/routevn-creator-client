import { describe, expect, it, vi } from "vitest";

import { handleResourcesClick } from "../../src/pages/resources/resources.handlers.js";

describe("resources handlers", () => {
  it("preserves the current project payload when opening a resource page", () => {
    const dispatch = vi.fn();
    const currentPayload = { p: "project-1" };

    handleResourcesClick(
      {
        appService: {
          getPayload: () => currentPayload,
        },
        store: {
          selectResourceRoute: (resourceId) =>
            resourceId === "images" ? "/project/images" : undefined,
        },
        subject: {
          dispatch,
        },
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              resourceId: "images",
            },
            id: "resource-images",
          },
        },
      },
    );

    expect(dispatch).toHaveBeenCalledWith("redirect", {
      path: "/project/images",
      payload: currentPayload,
    });
  });
});
