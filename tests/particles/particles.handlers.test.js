import { describe, expect, it, vi } from "vitest";
import { handleResourceViewBackgroundClick } from "../../src/pages/particles/particles.handlers.js";

describe("particles handlers", () => {
  it("clears selection and preview runtime from a resource background click", async () => {
    const deps = {
      store: {
        setSelectedFolderId: vi.fn(),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        selectIsDialogOpen: vi.fn(() => false),
        selectSelectedParticle: vi.fn(() => undefined),
      },
      refs: {
        fileExplorer: {
          clearSelection: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleResourceViewBackgroundClick(deps);

    expect(deps.store.setSelectedFolderId).toHaveBeenCalledWith({
      folderId: undefined,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.store.clearPreviewRuntime).toHaveBeenCalledOnce();
    expect(deps.refs.fileExplorer.clearSelection).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });
});
