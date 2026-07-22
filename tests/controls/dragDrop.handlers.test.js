import { describe, expect, it, vi } from "vitest";
import { handleDrop } from "../../src/components/dragDrop/dragDrop.handlers.js";

describe("dragDrop.handlers", () => {
  it("emits rejected files instead of silently discarding them", () => {
    const dispatchEvent = vi.fn();
    const deps = {
      dispatchEvent,
      props: {
        acceptedFileTypes: [".ttf", ".otf", ".woff2"],
      },
      store: {
        stopDragging: vi.fn(),
      },
      render: vi.fn(),
    };
    const woffFile = new File(["legacy woff"], "legacy.woff", {
      type: "font/woff",
    });

    handleDrop(deps, {
      _event: {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [woffFile],
        },
      },
    });

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "file-rejected",
      detail: {
        files: [woffFile],
      },
    });
  });
});
