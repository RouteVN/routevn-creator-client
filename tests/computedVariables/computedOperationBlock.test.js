import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import {
  handleAddOperandClick,
  handleOperationContextMenu,
  handleRemoveOperandClick,
  handleValueOperandClick,
  handleValueOperandContextMenu,
  handleVariableOperandClick,
  handleVariableOperandContextMenu,
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
    expect(view).toContain("rtgl-view#valueOperand${i}");
    expect(view).toContain("rtgl-view#variableOperand${i}");
    expect(view).toContain("$if operand.source == 'operation':");
    expect(view).toContain("pre=x");
  });

  it("owns its localized operation copy", () => {
    const operation = {
      type: "add",
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

  it.each([
    ["subtract", "computedOperatorSubtract", "Difference"],
    ["multiply", "computedOperatorMultiply", "Product"],
    ["divide", "computedOperatorDivide", "Ratio"],
    ["minimum", "computedOperatorMinimum", "Lowest"],
    ["maximum", "computedOperatorMaximum", "Highest"],
    ["equal", "computedOperatorEqual", "Matches"],
    ["notEqual", "computedOperatorNotEqual", "Differs"],
    ["greaterThan", "computedOperatorGreaterThan", "Above"],
    ["greaterOrEqual", "computedOperatorGreaterOrEqual", "At least"],
    ["lessThan", "computedOperatorLessThan", "Below"],
    ["lessOrEqual", "computedOperatorLessOrEqual", "At most"],
    ["and", "computedOperatorAnd", "All true"],
    ["or", "computedOperatorOr", "Any true"],
    ["not", "computedOperatorNot", "Opposite"],
  ])(
    "labels %s operation blocks",
    (operationType, labelKey, localizedLabel) => {
      expect(
        selectViewData({
          props: {
            operation: {
              type: operationType,
              operands: [],
            },
          },
          i18n: {
            variablesPage: {
              [labelKey]: localizedLabel,
            },
          },
        }),
      ).toMatchObject({
        operationLabel: localizedLabel,
      });
    },
  );

  it("uses operation arity for add controls and empty messages", () => {
    expect(
      selectViewData({
        props: {
          operation: {
            type: "not",
            operands: [],
          },
        },
        i18n: { variablesPage: {} },
      }),
    ).toMatchObject({
      canAddOperand: true,
      operationNeedsOperandsMessage: "Add one operand.",
    });

    expect(
      selectViewData({
        props: {
          operation: {
            type: "not",
            operands: [{ source: "value", value: true }],
          },
        },
        i18n: { variablesPage: {} },
      }),
    ).toMatchObject({
      canAddOperand: false,
    });

    expect(
      selectViewData({
        props: {
          operation: {
            type: "and",
            operands: [],
          },
        },
        i18n: { variablesPage: {} },
      }),
    ).toMatchObject({
      operationNeedsOperandsMessage: "Add at least one operand.",
    });

    expect(
      selectViewData({
        props: {
          operation: {
            type: "equal",
            operands: [
              { source: "value", value: 1 },
              { source: "value", value: 1 },
            ],
          },
        },
        i18n: { variablesPage: {} },
      }),
    ).toMatchObject({
      canAddOperand: false,
      operationNeedsOperandsMessage: "Add two operands.",
    });
  });

  it("emits path-aware edit events", () => {
    const dispatchEvent = vi.fn();
    const deps = {
      dispatchEvent,
      props: {
        operation: {
          operationPath: [1],
          operands: [
            { source: "value", value: 12 },
            { source: "variable", variablePath: "variables.status" },
          ],
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
    handleValueOperandClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: { index: "0" },
          getBoundingClientRect: () => ({ left: 25, bottom: 45 }),
        },
      },
    });
    handleValueOperandContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 65,
        clientY: 85,
        currentTarget: {
          dataset: { index: "0" },
        },
      },
    });
    handleVariableOperandClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: { index: "1" },
          getBoundingClientRect: () => ({ left: 30, bottom: 50 }),
        },
      },
    });
    handleVariableOperandContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 70,
        clientY: 90,
        currentTarget: {
          dataset: { index: "1" },
        },
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
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "value-operand-click",
        detail: {
          operationPath: [1],
          target: undefined,
          index: 0,
          value: 12,
          x: 25,
          y: 45,
        },
      }),
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "variable-operand-click",
        detail: {
          operationPath: [1],
          target: undefined,
          index: 1,
          x: 30,
          y: 50,
        },
      }),
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "value-operand-contextmenu",
        detail: {
          operationPath: [1],
          target: undefined,
          index: 0,
          x: 65,
          y: 85,
        },
      }),
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "variable-operand-contextmenu",
        detail: {
          operationPath: [1],
          target: undefined,
          index: 1,
          x: 70,
          y: 90,
        },
      }),
    );
  });
});
