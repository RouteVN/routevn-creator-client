import { describe, expect, it, vi } from "vitest";
import { handleProjectIconClick } from "../../src/components/projectCreateDialog/projectCreateDialog.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("projectCreateDialog handlers", () => {
  it("requires project icon sources to be at least 512px", async () => {
    const deps = {
      appService: {
        pickFiles: vi.fn(async () => undefined),
      },
      store: {},
      render: vi.fn(),
      i18n: EN_I18N,
    };

    await handleProjectIconClick(deps);

    expect(deps.appService.pickFiles).toHaveBeenCalledWith({
      accept: "image/*",
      multiple: false,
      validations: [
        {
          type: "image-min-size",
          minWidth: 512,
          minHeight: 512,
        },
      ],
    });
  });
});
