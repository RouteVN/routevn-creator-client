import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import {
  handleAddOperandClick,
  handleOperationContextMenu,
  handleRemoveOperandClick,
} from "../../src/components/computedOperationBlock/computedOperationBlock.handlers.js";
import { selectViewData } from "../../src/components/computedOperationBlock/computedOperationBlock.store.js";

const view = readFileSync(
  new URL(
    "../../src/components/computedOperationBlock/computedOperationBlock.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("computedOperationBlock", () => {
  it("renders a recursive bordered Add block", () => {
    expect(() => yaml.load(view)).not.toThrow();
    expect(view).toContain(
      "rtgl-view#operationBlock d=v w=f g=sm bw=xs bc=bo br=md p=md bgc=bg cur=pointer",
    );
    expect(view).toContain(
      "rvn-computed-operation-block :operation=${operand.operation}",
    );
    expect(view).toContain("rtgl-button#addOperandButton");
    expect(view).toContain("rtgl-button#removeOperand${i}");
    expect(view).toContain("pre=x");
  });

  it("owns its localized operation copy", () => {
    const operation = {
      operationPath: [1],
      operands: [{ source: "value", value: 2, index: 0 }],
    };

    expect(
      selectViewData({
        props: { operation },
        i18n: {
          variablesPage: {
            computedOperatorAdd: "Sum",
            computedNodeOperationSource: "Nested operation",
          },
        },
      }),
    ).toMatchObject({
      operands: operation.operands,
      operationLabel: "Sum",
    });
  });

  it("emits path-aware edit events", () => {
    const dispatchEvent = vi.fn();
    const deps = {
      dispatchEvent,
      props: {
        operation: {
          operationPath: [1],
        },
      },
    };

    handleAddOperandClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          getBoundingClientRect: () => ({ left: 20, bottom: 40 }),
        },
      },
    });
    handleRemoveOperandClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: { index: "2" },
        },
      },
    });
    handleOperationContextMenu(deps, {
      _event: {
        clientX: 60,
        clientY: 80,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    });

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-operand-click",
        detail: {
          operationPath: [1],
          x: 20,
          y: 40,
        },
      }),
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remove-operand-click",
        detail: {
          operationPath: [1],
          index: 2,
        },
      }),
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "operation-contextmenu",
        detail: {
          operationPath: [1],
          x: 60,
          y: 80,
        },
      }),
    );
  });
});
