import { describe, expect, it, vi } from "vitest";
import { handleItemDelete } from "../../src/pages/images/images.handlers.js";

describe("images handlers", () => {
  it("shows a failure alert when deleteImageIfUnused fails without usage", async () => {
    const deps = {
      projectService: {
        deleteImageIfUnused: vi.fn(async () => ({
          deleted: false,
          usage: {
            isUsed: false,
          },
        })),
      },
      appService: {
        showAlert: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleItemDelete(deps, {
      _event: {
        detail: {
          itemId: "image-1",
        },
      },
    });

    expect(deps.projectService.deleteImageIfUnused).toHaveBeenCalledWith({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts"],
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to delete resource.",
    });
    expect(deps.render).toHaveBeenCalled();
  });
});
