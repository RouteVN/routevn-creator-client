import { describe, expect, it } from "vitest";
import {
  addConditionalBranch,
  addOperationOperand,
  createConditional,
  createInitialState,
  createOperation,
  duplicateConditionalBranch,
  moveConditionalBranch,
  openAddDialog,
  openComputedExampleDialog,
  openEditDialog,
  removeComputedExample,
  removeConditionalBranch,
  removeConditionalNode,
  removeOperation,
  removeOperationOperand,
  selectConditionalNodeValue,
  selectComputedExampleInputDefinition,
  selectViewData,
  saveComputedExample,
  setConditionalNode,
  setSearchQuery,
  showOperandSourceMenu,
  showOperationBlockMenu,
  showOperationChoiceMenu,
  showOperationValuePopover,
  updateFormValues,
  updateOperationVariableOperand,
  updateOperationValueOperand,
} from "../../src/components/groupVariablesView/groupVariablesView.store.js";

const TEST_I18N = {
  resourcePages: {},
  variablesPage: {
    booleanTrueLabel: "はい",
    scopeContextLabel: "コンテキスト",
    variableTypeBooleanLabel: "真偽値",
  },
};

const createProps = () => ({
  flatGroups: [
    {
      id: "folder-1",
      name: "Progress",
      children: [
        {
          id: "variable-1",
          type: "variable",
          name: "Can Continue",
          scope: "context",
          variableType: "boolean",
          default: true,
        },
      ],
    },
  ],
});

const selectComputedVariableType = (state, variableType) => {
  updateFormValues({ state }, { variableType });
};

describe("groupVariablesView.store", () => {
  it("uses separate stored and computed add dialogs", () => {
    const storedState = createInitialState();
    openAddDialog(
      { state: storedState },
      { groupId: "folder-1", valueSource: "variable" },
    );
    const storedView = selectViewData({
      state: storedState,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(storedView.isVariableDialogOpen).toBe(true);
    expect(storedView.isComputedDialogOpen).toBe(false);
    expect(
      storedView.variableForm.fields.find((field) => field.name === "name"),
    ).not.toHaveProperty("tooltip");
    expect(
      storedView.variableForm.fields.map((field) => field.name),
    ).not.toContain("valueSource");
    expect(storedView.variableForm.fields.map((field) => field.name)).toContain(
      "default",
    );
    expect(storedView.variableForm.fields.map((field) => field.name)).toContain(
      "scope",
    );
    expect(
      storedView.variableForm.fields.find(
        (field) =>
          field.name === "default" &&
          field.$when?.includes("variableType == 'number'"),
      ),
    ).toMatchObject({
      type: "input-number",
      required: true,
    });
    expect(
      storedView.variableForm.fields.map((field) => field.name),
    ).not.toContain("computationMode");

    const computedState = createInitialState();
    openAddDialog(
      { state: computedState },
      { groupId: "folder-1", valueSource: "computed" },
    );
    const computedView = selectViewData({
      state: computedState,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(computedView.isVariableDialogOpen).toBe(false);
    expect(computedView.isComputedDialogOpen).toBe(true);
    expect(
      computedView.computedForm.fields.map((field) => field.name),
    ).not.toContain("valueSource");
    expect(
      computedView.computedForm.fields
        .map((field) => field.slot)
        .filter(Boolean),
    ).toEqual(["operation"]);
    expect(
      computedView.computedForm.fields.map((field) => field.name),
    ).not.toContain("default");
    expect(
      computedView.computedForm.fields.map((field) => field.name),
    ).not.toContain("scope");
    expect(
      computedView.context.variableTypeOptions.map((option) => option.value),
    ).toEqual(["string", "number", "boolean"]);
    expect(computedView.operationBlock).toBeUndefined();
  });

  it("keeps examples attached while the computed operation changes", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "add" });
    addOperationOperand({ state }, { source: "value", value: 1 });
    addOperationOperand({ state }, { source: "value", value: 2 });

    openComputedExampleDialog({ state }, { inputItems: [] });
    saveComputedExample({ state }, { id: "example-1", name: "Sum", input: {} });
    state.computedExamples = new Proxy(
      state.computedExamples.map(
        (example) =>
          new Proxy(
            {
              id: example.id,
              name: example.name,
              input: new Proxy(example.input, {}),
            },
            {},
          ),
      ),
      {},
    );
    expect(() => {
      addOperationOperand({ state }, { source: "value", value: 3 });
    }).not.toThrow();

    expect(state.defaultValues.computed).toEqual({
      expr: { add: [{ add: [1, 2] }, 3] },
      examples: [{ id: "example-1", name: "Sum", input: {} }],
    });
    const view = selectViewData({
      state,
      props: createProps(),
      i18n: TEST_I18N,
    });
    expect(view.computedExamples).toEqual([
      expect.objectContaining({
        id: "example-1",
        label: "Sum",
        result: "6",
        resultValid: true,
      }),
    ]);

    removeComputedExample({ state }, { exampleId: "example-1" });
    expect(state.defaultValues.computed).toEqual({
      expr: { add: [{ add: [1, 2] }, 3] },
    });
  });

  it("shows defaults for inputs added after an example was saved", () => {
    const state = createInitialState();
    openEditDialog(
      { state },
      {
        groupId: "folder-1",
        itemId: "computed-1",
        defaultValues: {
          valueSource: "computed",
          variableType: "boolean",
          computed: {
            expr: { var: "variables.variable-1" },
            examples: [
              {
                id: "example-1",
                name: "Default state",
                input: {},
              },
            ],
          },
        },
      },
    );

    const view = selectViewData({
      state,
      props: createProps(),
      i18n: TEST_I18N,
    });

    expect(view.computedExamples[0].inputs).toEqual([
      { label: "Can Continue", value: "true" },
    ]);
  });

  it("finds example inputs in an incomplete operation draft", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "add" });
    addOperationOperand(
      { state },
      { source: "variable", variablePath: 'variables["variable-1"]' },
    );

    expect(selectComputedExampleInputDefinition({ state })).toEqual({
      expr: {
        exampleInputs: [{ var: 'variables["variable-1"]' }],
      },
    });
  });

  it("prefills examples when editing a computed variable", () => {
    const state = createInitialState();
    openEditDialog(
      { state },
      {
        groupId: "folder-1",
        itemId: "computed-1",
        defaultValues: {
          valueSource: "computed",
          variableType: "number",
          computed: {
            expr: { add: [{ var: "variables.score" }, 1] },
            examples: [
              {
                id: "example-1",
                name: "Score check",
                input: { variables: { score: 4 } },
              },
            ],
          },
        },
      },
    );
    openComputedExampleDialog(
      { state },
      {
        exampleId: "example-1",
        inputItems: [
          {
            source: "variables",
            id: "score",
            name: "Score",
            type: "number",
            formName: "input0",
            defaultValue: 0,
          },
        ],
      },
    );

    expect(state.computedExampleDialog).toMatchObject({
      isOpen: true,
      mode: "edit",
      editingExampleId: "example-1",
      defaultValues: { name: "Score check", input0: 4 },
      draftValues: { name: "Score check", input0: 4 },
    });
    const view = selectViewData({
      state,
      props: createProps(),
      i18n: TEST_I18N,
    });
    expect(view.computedExampleForm.fields[0]).toMatchObject({
      name: "name",
      type: "input-text",
      required: true,
    });
    expect(view.computedExampleForm.actions.buttons).toEqual([
      expect.objectContaining({ id: "submit", validate: true }),
    ]);
  });

  it("keeps the selected type authoritative for root operations", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });

    selectComputedVariableType(state, "boolean");
    createOperation({ state }, { operationType: "add" });

    expect(state.defaultValues.variableType).toBe("boolean");
    expect(state.operationDraft).toBeUndefined();

    createOperation({ state }, { operationType: "equal" });
    addOperationOperand({ state }, { source: "value", value: true });
    addOperationOperand({ state }, { source: "value", value: false });
    expect(state.defaultValues.computed).toEqual({
      expr: { eq: [true, false] },
    });

    selectComputedVariableType(state, "number");

    expect(state.defaultValues.variableType).toBe("number");
    expect(state.operationDraft).toBeUndefined();
    expect(state.defaultValues.computed).toBeUndefined();

    createOperation({ state }, { operationType: "add" });
    expect(state.operationDraft).toEqual({
      type: "add",
      operands: [],
    });
    expect(state.defaultValues.variableType).toBe("number");
  });

  it("authors an ordered conditional with an explicit default result", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    createConditional({ state });

    expect(state.defaultValues.variableType).toBe("string");
    expect(state.defaultValues.computed).toBeUndefined();
    expect(state.conditionalDraft.branches[0].when).toBeUndefined();

    setConditionalNode(
      { state },
      {
        source: "operation",
        operationType: "equal",
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    addOperationOperand(
      { state },
      {
        source: "variable",
        variablePath: "variables.status",
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    addOperationOperand(
      { state },
      {
        source: "value",
        value: "ready",
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    setConditionalNode(
      { state },
      {
        source: "value",
        value: "Available",
        target: { kind: "result", branchIndex: 0 },
      },
    );

    expect(state.defaultValues.computed).toBeUndefined();

    setConditionalNode(
      { state },
      {
        source: "value",
        value: "Unavailable",
        target: { kind: "default" },
      },
    );

    expect(state.defaultValues.computed).toEqual({
      branches: [
        {
          when: {
            eq: [{ var: "variables.status" }, "ready"],
          },
          expr: "Available",
        },
      ],
      default: {
        expr: "Unavailable",
      },
    });

    const viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });
    expect(viewData.operationBlock).toBeUndefined();
    expect(viewData.conditionalBuilder).toMatchObject({
      branches: [
        {
          branchIndex: 0,
          branchLabel: "If",
          canRemove: false,
          condition: {
            source: "operation",
            target: { kind: "condition", branchIndex: 0 },
          },
          result: {
            source: "value",
            value: "Available",
          },
        },
      ],
      defaultResult: {
        source: "value",
        value: "Unavailable",
      },
    });
  });

  it("serializes logical conditional operations with condition grammar", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "boolean");
    createConditional({ state });
    const conditionTarget = { kind: "condition", branchIndex: 0 };

    setConditionalNode(
      { state },
      {
        source: "operation",
        operationType: "and",
        target: conditionTarget,
      },
    );
    addOperationOperand(
      { state },
      {
        source: "operation",
        operationType: "not",
        target: conditionTarget,
      },
    );
    addOperationOperand(
      { state },
      {
        source: "value",
        value: false,
        operationPath: [0],
        target: conditionTarget,
      },
    );
    addOperationOperand(
      { state },
      {
        source: "value",
        value: true,
        target: conditionTarget,
      },
    );
    setConditionalNode(
      { state },
      {
        source: "value",
        value: true,
        target: { kind: "result", branchIndex: 0 },
      },
    );
    setConditionalNode(
      { state },
      {
        source: "value",
        value: false,
        target: { kind: "default" },
      },
    );

    expect(state.defaultValues.computed).toEqual({
      branches: [
        {
          when: {
            all: [{ not: false }, true],
          },
          expr: true,
        },
      ],
      default: {
        expr: false,
      },
    });
  });

  it("restores an existing conditional for editing", () => {
    const state = createInitialState();
    openEditDialog(
      { state },
      {
        groupId: "folder-1",
        itemId: "computed-1",
        defaultValues: {
          name: "Availability",
          valueSource: "computed",
          variableType: "string",
          computed: {
            branches: [
              {
                when: {
                  all: [{ var: "variables.ready" }, { not: false }],
                },
                expr: { var: "variables.status" },
              },
            ],
            default: {
              expr: "Unavailable",
            },
          },
        },
      },
    );

    expect(state.operationDraft).toBeUndefined();
    expect(state.conditionalDraft).toEqual({
      branches: [
        {
          when: {
            source: "operation",
            operation: {
              type: "and",
              operands: [
                {
                  source: "variable",
                  variablePath: "variables.ready",
                },
                {
                  source: "operation",
                  operation: {
                    type: "not",
                    operands: [{ source: "value", value: false }],
                  },
                },
              ],
            },
          },
          result: {
            source: "variable",
            variablePath: "variables.status",
          },
        },
      ],
      defaultResult: {
        source: "value",
        value: "Unavailable",
      },
    });

    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            children: [
              {
                id: "ready",
                name: "Ready",
                type: "variable",
                variableType: "boolean",
              },
              {
                id: "status",
                name: "Status",
                type: "variable",
                variableType: "string",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.conditionalBuilder).toMatchObject({
      branches: [
        {
          condition: {
            source: "operation",
            operation: {
              type: "and",
              target: { kind: "condition", branchIndex: 0 },
            },
          },
          result: {
            source: "variable",
            variableLabel: "Status",
          },
        },
      ],
      defaultResult: {
        source: "value",
        value: "Unavailable",
      },
    });

    removeConditionalNode(
      { state },
      {
        target: { kind: "default" },
      },
    );
    expect(state.conditionalDraft.defaultResult).toBeUndefined();
    expect(state.defaultValues.computed).toBeUndefined();
  });

  it("selects literal Then and Otherwise values for editing", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "number");
    createConditional({ state });
    setConditionalNode(
      { state },
      {
        source: "value",
        value: 7,
        target: { kind: "result", branchIndex: 0 },
      },
    );
    setConditionalNode(
      { state },
      {
        source: "value",
        value: 0,
        target: { kind: "default" },
      },
    );

    expect(
      selectConditionalNodeValue(
        { state },
        { target: { kind: "result", branchIndex: 0 } },
      ),
    ).toBe(7);
    expect(
      selectConditionalNodeValue({ state }, { target: { kind: "default" } }),
    ).toBe(0);
  });

  it("adds, duplicates, reorders, and removes conditional branches", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    createConditional({ state });
    setConditionalNode(
      { state },
      {
        source: "operation",
        operationType: "not",
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    addOperationOperand(
      { state },
      {
        source: "variable",
        variablePath: "variables.ready",
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    setConditionalNode(
      { state },
      {
        source: "value",
        value: "First",
        target: { kind: "result", branchIndex: 0 },
      },
    );

    duplicateConditionalBranch({ state }, { branchIndex: 0 });
    setConditionalNode(
      { state },
      {
        source: "value",
        value: "Second",
        target: { kind: "result", branchIndex: 1 },
      },
    );
    addConditionalBranch({ state });
    expect(state.conditionalDraft.branches[2].when).toBeUndefined();
    setConditionalNode(
      { state },
      {
        source: "operation",
        operationType: "not",
        target: { kind: "condition", branchIndex: 2 },
      },
    );
    addOperationOperand(
      { state },
      {
        source: "variable",
        variablePath: "variables.blocked",
        target: { kind: "condition", branchIndex: 2 },
      },
    );
    setConditionalNode(
      { state },
      {
        source: "value",
        value: "Third",
        target: { kind: "result", branchIndex: 2 },
      },
    );
    moveConditionalBranch({ state }, { branchIndex: 2, offset: -1 });
    removeConditionalBranch({ state }, { branchIndex: 0 });

    expect(state.conditionalDraft.branches).toEqual([
      {
        when: {
          source: "operation",
          operation: {
            type: "not",
            operands: [
              {
                source: "variable",
                variablePath: "variables.blocked",
              },
            ],
          },
        },
        result: { source: "value", value: "Third" },
      },
      {
        when: {
          source: "operation",
          operation: {
            type: "not",
            operands: [
              {
                source: "variable",
                variablePath: "variables.ready",
              },
            ],
          },
        },
        result: { source: "value", value: "Second" },
      },
    ]);

    removeConditionalBranch({ state }, { branchIndex: 1 });
    removeConditionalBranch({ state }, { branchIndex: 0 });
    expect(state.conditionalDraft.branches).toHaveLength(1);
  });

  it("duplicates a conditional branch backed by a state proxy", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    createConditional({ state });
    state.conditionalDraft.branches[0] = new Proxy(
      {
        when: {
          source: "operation",
          operation: {
            type: "equal",
            operands: [
              { source: "value", value: 1 },
              { source: "value", value: 1 },
            ],
          },
        },
        result: {
          source: "value",
          value: "Yes",
        },
      },
      {},
    );

    duplicateConditionalBranch({ state }, { branchIndex: 0 });

    expect(state.conditionalDraft.branches[1]).toEqual({
      when: {
        source: "operation",
        operation: {
          type: "equal",
          operands: [
            { source: "value", value: 1 },
            { source: "value", value: 1 },
          ],
        },
      },
      result: {
        source: "value",
        value: "Yes",
      },
    });
    expect(state.conditionalDraft.branches[1]).not.toBe(
      state.conditionalDraft.branches[0],
    );
  });

  it("clears a conditional when its declared result type changes", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    createConditional({ state });

    selectComputedVariableType(state, "number");

    expect(state.conditionalDraft).toBeUndefined();
    expect(state.defaultValues.computed).toBeUndefined();
    expect(state.defaultValues.variableType).toBe("number");
  });

  it("authors an Add operation from multiple variables and values", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });

    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "add" });
    expect(state.defaultValues.variableType).toBe("number");
    expect(state.defaultValues.computed).toBeUndefined();

    addOperationOperand(
      { state },
      { source: "variable", variablePath: "variables.score" },
    );
    addOperationOperand({ state }, { source: "value", value: 4 });
    addOperationOperand({ state }, { source: "value", value: 6 });

    expect(state.defaultValues.computed).toEqual({
      expr: {
        add: [
          {
            add: [{ var: "variables.score" }, 4],
          },
          6,
        ],
      },
    });

    removeOperationOperand({ state }, { index: 1 });
    expect(state.defaultValues.computed).toEqual({
      expr: {
        add: [{ var: "variables.score" }, 6],
      },
    });
  });

  it("authors a left-associated Subtract operation", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });

    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "subtract" });
    addOperationOperand(
      { state },
      { source: "variable", variablePath: "variables.score" },
    );
    addOperationOperand({ state }, { source: "value", value: 4 });
    addOperationOperand({ state }, { source: "value", value: 2 });

    expect(state.defaultValues.computed).toEqual({
      expr: {
        sub: [
          {
            sub: [{ var: "variables.score" }, 4],
          },
          2,
        ],
      },
    });
  });

  it.each([
    ["Multiply", "multiply", "mul"],
    ["Divide", "divide", "div"],
    ["Minimum", "minimum", "min"],
    ["Maximum", "maximum", "max"],
  ])(
    "authors a left-associated %s operation",
    (_label, operationType, expressionKey) => {
      const state = createInitialState();
      openAddDialog(
        { state },
        { groupId: "folder-1", valueSource: "computed" },
      );

      selectComputedVariableType(state, "number");
      createOperation({ state }, { operationType });
      addOperationOperand({ state }, { source: "value", value: 20 });
      addOperationOperand({ state }, { source: "value", value: 4 });
      addOperationOperand({ state }, { source: "value", value: 2 });

      expect(state.defaultValues.computed).toEqual({
        expr: {
          [expressionKey]: [
            {
              [expressionKey]: [20, 4],
            },
            2,
          ],
        },
      });
    },
  );

  it.each([
    ["Equal", "equal", "eq", "ready", "ready"],
    ["Not equal", "notEqual", "neq", false, true],
    ["Greater than", "greaterThan", "gt", 5, 3],
    ["Greater or equal", "greaterOrEqual", "gte", 5, 5],
    ["Less than", "lessThan", "lt", 3, 5],
    ["Less or equal", "lessOrEqual", "lte", 5, 5],
  ])(
    "authors a fixed-arity %s comparison",
    (_label, operationType, expressionKey, left, right) => {
      const state = createInitialState();
      openAddDialog(
        { state },
        { groupId: "folder-1", valueSource: "computed" },
      );

      selectComputedVariableType(state, "boolean");
      createOperation({ state }, { operationType });
      addOperationOperand({ state }, { source: "value", value: left });
      addOperationOperand({ state }, { source: "value", value: right });
      addOperationOperand({ state }, { source: "value", value: right });

      expect(state.defaultValues.variableType).toBe("boolean");
      expect(state.operationDraft.operands).toHaveLength(2);
      expect(state.defaultValues.computed).toEqual({
        expr: {
          [expressionKey]: [left, right],
        },
      });
    },
  );

  it("updates an existing literal comparison operand", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });

    selectComputedVariableType(state, "boolean");
    createOperation({ state }, { operationType: "equal" });
    addOperationOperand({ state }, { source: "value", value: "draft" });
    addOperationOperand({ state }, { source: "value", value: "ready" });
    updateOperationValueOperand({ state }, { index: 0, value: "published" });

    expect(state.defaultValues.computed).toEqual({
      expr: {
        eq: ["published", "ready"],
      },
    });
  });

  it("updates an existing variable comparison operand", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });

    selectComputedVariableType(state, "boolean");
    createOperation({ state }, { operationType: "equal" });
    addOperationOperand(
      { state },
      { source: "variable", variablePath: "variables.status" },
    );
    addOperationOperand({ state }, { source: "value", value: "ready" });
    updateOperationVariableOperand(
      { state },
      {
        index: 0,
        variablePath: "variables.mode",
      },
    );

    expect(state.defaultValues.computed).toEqual({
      expr: {
        eq: [{ var: "variables.mode" }, "ready"],
      },
    });
  });

  it.each([
    ["And", "and", "and", [true, false, true]],
    ["Or", "or", "or", [false, true]],
  ])(
    "authors a variadic %s operation",
    (_label, operationType, expressionKey, values) => {
      const state = createInitialState();
      openAddDialog(
        { state },
        { groupId: "folder-1", valueSource: "computed" },
      );

      selectComputedVariableType(state, "boolean");
      createOperation({ state }, { operationType });
      values.forEach((value) => {
        addOperationOperand({ state }, { source: "value", value });
      });

      expect(state.defaultValues.variableType).toBe("boolean");
      expect(state.defaultValues.computed).toEqual({
        expr: {
          [expressionKey]: values,
        },
      });
    },
  );

  it("authors a single-operand Not operation", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });

    selectComputedVariableType(state, "boolean");
    createOperation({ state }, { operationType: "not" });
    addOperationOperand({ state }, { source: "value", value: false });
    addOperationOperand({ state }, { source: "value", value: true });

    expect(state.operationDraft.operands).toHaveLength(1);
    expect(state.defaultValues.computed).toEqual({
      expr: {
        not: [false],
      },
    });
  });

  it("authors a comparison as the first operand of And", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "boolean");
    createOperation({ state }, { operationType: "and" });
    addOperationOperand(
      { state },
      { source: "operation", operationType: "greaterOrEqual" },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 10, operationPath: [0] },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 5, operationPath: [0] },
    );

    expect(state.defaultValues.computed).toEqual({
      expr: {
        and: [
          {
            gte: [10, 5],
          },
        ],
      },
    });
  });

  it("authors a nested Add operation as an operand", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "add" });
    addOperationOperand(
      { state },
      { source: "variable", variablePath: "variables.score" },
    );
    addOperationOperand(
      { state },
      { source: "operation", operationType: "add" },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 2, operationPath: [1] },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 3, operationPath: [1] },
    );

    expect(state.defaultValues.computed).toEqual({
      expr: {
        add: [{ var: "variables.score" }, { add: [2, 3] }],
      },
    });

    removeOperation({ state }, { operationPath: [1] });
    expect(state.operationDraft.operands).toEqual([
      {
        source: "variable",
        variablePath: "variables.score",
      },
    ]);
    expect(state.defaultValues.computed).toBeUndefined();
  });

  it("authors a nested Subtract operation inside Add", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "add" });
    addOperationOperand({ state }, { source: "value", value: 20 });
    addOperationOperand(
      { state },
      { source: "operation", operationType: "subtract" },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 8, operationPath: [1] },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 3, operationPath: [1] },
    );

    expect(state.defaultValues.computed).toEqual({
      expr: {
        add: [20, { sub: [8, 3] }],
      },
    });
  });

  it("keeps a nested operation on the right when replacing its leading operand", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "add" });
    addOperationOperand({ state }, { source: "value", value: 1 });
    addOperationOperand(
      { state },
      { source: "operation", operationType: "add" },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 2, operationPath: [1] },
    );
    addOperationOperand(
      { state },
      { source: "value", value: 3, operationPath: [1] },
    );

    removeOperationOperand({ state }, { index: 0 });
    expect(state.defaultValues.computed).toBeUndefined();

    addOperationOperand({ state }, { source: "value", value: 4 });
    expect(state.operationDraft.operands[0]).toEqual({
      source: "value",
      value: 4,
    });
    expect(state.defaultValues.computed).toEqual({
      expr: {
        add: [4, { add: [2, 3] }],
      },
    });
  });

  it("removes the root operation from its context menu", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    selectComputedVariableType(state, "number");
    createOperation({ state }, { operationType: "add" });
    addOperationOperand({ state }, { source: "value", value: 2 });
    addOperationOperand({ state }, { source: "value", value: 3 });

    showOperationBlockMenu({ state }, { x: 70, y: 80 });
    let viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(viewData.operationBlockMenu).toMatchObject({
      isOpen: true,
      x: 70,
      y: 80,
      items: [{ label: "Remove", type: "item", value: "remove" }],
    });

    removeOperation({ state });
    viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(state.defaultValues.computed).toBeUndefined();
    expect(viewData.operationBlock).toBeUndefined();
    expect(viewData.operationBlockMenu.isOpen).toBe(false);
  });

  it("builds the component-owned operation and operand menus", () => {
    const state = createInitialState();
    selectComputedVariableType(state, "number");

    showOperationChoiceMenu({ state }, { x: 10, y: 20 });
    let viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(viewData.operationChoiceMenu).toMatchObject({
      isOpen: true,
      x: 10,
      y: 20,
      items: [
        { label: "Add", value: "add" },
        { label: "Subtract", value: "subtract" },
        { label: "Multiply", value: "multiply" },
        { label: "Divide", value: "divide" },
        { label: "Minimum", value: "minimum" },
        { label: "Maximum", value: "maximum" },
        { label: "If", value: "if" },
      ],
    });

    showOperandSourceMenu({ state }, { x: 30, y: 40 });
    viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            children: [
              {
                id: "score",
                name: "Score",
                type: "variable",
                variableType: "number",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.operandSourceMenu).toMatchObject({
      isOpen: true,
      x: 30,
      y: 40,
      items: [
        {
          label: "Variable",
          value: "variable",
          items: [
            {
              type: "item",
              value: "variables.score",
              label: "Score",
              suffixText: "Number",
            },
          ],
        },
        { label: "Value", value: "value" },
      ],
    });
    createOperation({ state }, { operationType: "add" });
    addOperationOperand({ state }, { source: "value", value: 1 });
    showOperandSourceMenu({ state }, { x: 30, y: 40 });
    viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });
    expect(viewData.operandSourceMenu.items[1].items).toEqual([
      { label: "Add", type: "item", value: "add" },
      { label: "Subtract", type: "item", value: "subtract" },
      { label: "Multiply", type: "item", value: "multiply" },
      { label: "Divide", type: "item", value: "divide" },
      { label: "Minimum", type: "item", value: "minimum" },
      { label: "Maximum", type: "item", value: "maximum" },
    ]);
  });

  it("filters root operations by the selected computed variable type", () => {
    const state = createInitialState();

    selectComputedVariableType(state, "boolean");
    let viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(
      viewData.operationChoiceMenu.items.map((item) => item.value),
    ).toEqual([
      "equal",
      "notEqual",
      "greaterThan",
      "greaterOrEqual",
      "lessThan",
      "lessOrEqual",
      "and",
      "or",
      "not",
      "if",
    ]);

    selectComputedVariableType(state, "string");
    viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(viewData.operationChoiceMenu.items).toEqual([
      {
        label: "If",
        type: "item",
        value: "if",
      },
    ]);
  });

  it("excludes the edited variable from Add operand options", () => {
    const state = createInitialState();
    state.dialogMode = "edit";

    const viewData = selectViewData({
      state,
      props: {
        selectedItemId: "total",
        flatGroups: [
          {
            children: [
              {
                id: "total",
                name: "Total",
                type: "variable",
                variableType: "number",
              },
              {
                id: "score",
                name: "Score",
                type: "variable",
                variableType: "number",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.operandSourceMenu.items[0].items).toEqual([
      {
        type: "item",
        value: "variables.score",
        label: "Score",
        suffixText: "Number",
      },
    ]);
  });

  it("filters comparison operands by the first selected value type", () => {
    const state = createInitialState();
    selectComputedVariableType(state, "boolean");
    createOperation({ state }, { operationType: "equal" });
    showOperandSourceMenu({ state }, { x: 30, y: 40 });
    showOperationValuePopover({ state }, { x: 30, y: 40 });
    const props = {
      flatGroups: [
        {
          children: [
            {
              id: "score",
              name: "Score",
              type: "variable",
              variableType: "number",
            },
            {
              id: "status",
              name: "Status",
              type: "variable",
              variableType: "string",
            },
            {
              id: "ready",
              name: "Ready",
              type: "variable",
              variableType: "boolean",
            },
          ],
        },
      ],
    };

    let viewData = selectViewData({
      state,
      props,
      i18n: TEST_I18N,
    });
    expect(viewData.operandSourceMenu.items[0].items).toEqual([
      expect.objectContaining({ value: "variables.score" }),
      expect.objectContaining({ value: "variables.status" }),
      expect.objectContaining({ value: "variables.ready" }),
    ]);
    expect(viewData.operationValuePopover.valueTypes).toEqual([
      "number",
      "string",
      "boolean",
    ]);

    addOperationOperand(
      { state },
      { source: "variable", variablePath: "variables.status" },
    );
    showOperandSourceMenu({ state }, { x: 30, y: 40 });
    showOperationValuePopover({ state }, { x: 30, y: 40 });
    viewData = selectViewData({
      state,
      props,
      i18n: TEST_I18N,
    });

    expect(viewData.operandSourceMenu.items[0].items).toEqual([
      expect.objectContaining({ value: "variables.status" }),
    ]);
    expect(viewData.operandSourceMenu.items.map((item) => item.value)).toEqual([
      "variable",
      "value",
    ]);
    expect(viewData.operationValuePopover.valueTypes).toEqual(["string"]);

    showOperandSourceMenu(
      { state },
      {
        purpose: "operation-variable",
        operandIndex: 0,
        x: 30,
        y: 40,
      },
    );
    viewData = selectViewData({ state, props, i18n: TEST_I18N });
    expect(viewData.operandSourceMenu.items).toEqual([
      expect.objectContaining({
        label: "Status",
        value: "variables.status",
      }),
    ]);
  });

  it("omits unavailable choices from a Not Equal operand menu", () => {
    const state = createInitialState();
    selectComputedVariableType(state, "boolean");
    createOperation({ state }, { operationType: "notEqual" });
    addOperationOperand({ state }, { source: "value", value: "ready" });
    showOperandSourceMenu({ state }, { x: 30, y: 40 });

    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            children: [
              {
                id: "score",
                name: "Score",
                type: "variable",
                variableType: "number",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.operandSourceMenu.items).toEqual([
      {
        label: "Value",
        type: "item",
        value: "value",
      },
    ]);
  });

  it.each(["and", "or", "not"])(
    "offers variables and operations, but not Value, to %s operands",
    (operationType) => {
      const state = createInitialState();
      selectComputedVariableType(state, "boolean");
      createOperation({ state }, { operationType });
      showOperandSourceMenu({ state }, { x: 30, y: 40 });
      showOperationValuePopover({ state }, { x: 30, y: 40 });

      const viewData = selectViewData({
        state,
        props: {
          flatGroups: [
            {
              children: [
                {
                  id: "score",
                  name: "Score",
                  type: "variable",
                  variableType: "number",
                },
                {
                  id: "ready",
                  name: "Ready",
                  type: "variable",
                  variableType: "boolean",
                },
              ],
            },
          ],
        },
        i18n: TEST_I18N,
      });

      expect(
        viewData.operandSourceMenu.items.map((item) => item.value),
      ).toEqual(["variable", "operation"]);
      expect(viewData.operandSourceMenu.items[0].items).toEqual([
        expect.objectContaining({ value: "variables.ready" }),
      ]);
      expect(
        viewData.operandSourceMenu.items[1].items.map((item) => item.value),
      ).toEqual([
        "equal",
        "notEqual",
        "greaterThan",
        "greaterOrEqual",
        "lessThan",
        "lessOrEqual",
        "and",
        "or",
        "not",
      ]);
      expect(viewData.operationValuePopover.valueTypes).toEqual(["boolean"]);
    },
  );

  it("filters conditional node choices by condition and result type", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    createConditional({ state });
    const props = {
      flatGroups: [
        {
          children: [
            {
              id: "score",
              name: "Score",
              type: "variable",
              variableType: "number",
            },
            {
              id: "status",
              name: "Status",
              type: "variable",
              variableType: "string",
            },
            {
              id: "ready",
              name: "Ready",
              type: "variable",
              variableType: "boolean",
            },
          ],
        },
      ],
    };

    showOperandSourceMenu(
      { state },
      {
        purpose: "node",
        target: { kind: "condition", branchIndex: 0 },
        x: 30,
        y: 40,
      },
    );
    removeConditionalNode(
      { state },
      {
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    showOperationValuePopover(
      { state },
      {
        purpose: "node",
        target: { kind: "condition", branchIndex: 0 },
        x: 30,
        y: 40,
      },
    );
    let viewData = selectViewData({ state, props, i18n: TEST_I18N });

    expect(viewData.operandSourceMenu.items).toHaveLength(1);
    expect(viewData.operandSourceMenu.items[0].value).toBe("operation");
    expect(
      viewData.operandSourceMenu.items[0].items.map((item) => item.value),
    ).toEqual([
      "equal",
      "notEqual",
      "greaterThan",
      "greaterOrEqual",
      "lessThan",
      "lessOrEqual",
      "and",
      "or",
      "not",
    ]);
    expect(viewData.operationValuePopover.valueTypes).toEqual([]);

    setConditionalNode(
      { state },
      {
        source: "value",
        value: true,
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    setConditionalNode(
      { state },
      {
        source: "variable",
        variablePath: "variables.ready",
        target: { kind: "condition", branchIndex: 0 },
      },
    );
    expect(state.conditionalDraft.branches[0].when).toBeUndefined();

    showOperandSourceMenu(
      { state },
      {
        purpose: "node",
        target: { kind: "result", branchIndex: 0 },
        x: 30,
        y: 40,
      },
    );
    showOperationValuePopover(
      { state },
      {
        purpose: "node",
        target: { kind: "result", branchIndex: 0 },
        x: 30,
        y: 40,
      },
    );
    viewData = selectViewData({ state, props, i18n: TEST_I18N });

    expect(viewData.operandSourceMenu.items[0].items).toEqual([
      expect.objectContaining({ value: "variables.status" }),
    ]);
    expect(viewData.operandSourceMenu.items.map((item) => item.value)).toEqual([
      "variable",
      "value",
    ]);
    expect(viewData.operationValuePopover.valueTypes).toEqual(["string"]);

    showOperandSourceMenu(
      { state },
      {
        purpose: "node-variable",
        target: { kind: "default" },
        x: 30,
        y: 40,
      },
    );
    viewData = selectViewData({ state, props, i18n: TEST_I18N });
    expect(viewData.operandSourceMenu.items).toEqual([
      expect.objectContaining({
        label: "Status",
        value: "variables.status",
      }),
    ]);
  });

  it("collects a number before adding a Value operand", () => {
    const state = createInitialState();

    showOperationValuePopover({ state }, { x: 30, y: 40 });
    const viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });

    expect(viewData.operationValuePopover).toMatchObject({
      isOpen: true,
      x: 30,
      y: 40,
    });
  });

  it("restores a left-associated Add chain as flat operands", () => {
    const state = createInitialState();
    openEditDialog(
      { state },
      {
        groupId: "folder-1",
        itemId: "computed-1",
        defaultValues: {
          name: "Total",
          valueSource: "computed",
          variableType: "number",
          computed: {
            expr: {
              add: [
                {
                  add: [{ var: "variables.score" }, 4],
                },
                6,
              ],
            },
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            children: [
              {
                id: "score",
                name: "Score",
                type: "variable",
                variableType: "number",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.operationBlock).toEqual({
      type: "add",
      operationPath: [],
      operands: [
        {
          source: "variable",
          variablePath: "variables.score",
          variableLabel: "Score",
          variableTypeLabel: "Number",
          index: 0,
        },
        { source: "value", value: 4, index: 1 },
        { source: "value", value: 6, index: 2 },
      ],
    });
  });

  it("restores a left-associated Subtract chain as flat operands", () => {
    const state = createInitialState();
    openEditDialog(
      { state },
      {
        groupId: "folder-1",
        itemId: "computed-1",
        defaultValues: {
          name: "Remaining",
          valueSource: "computed",
          variableType: "number",
          computed: {
            expr: {
              sub: [
                {
                  sub: [{ var: "variables.score" }, 4],
                },
                2,
              ],
            },
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            children: [
              {
                id: "score",
                name: "Score",
                type: "variable",
                variableType: "number",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.operationBlock).toEqual({
      type: "subtract",
      operationPath: [],
      operands: [
        {
          source: "variable",
          variablePath: "variables.score",
          variableLabel: "Score",
          variableTypeLabel: "Number",
          index: 0,
        },
        { source: "value", value: 4, index: 1 },
        { source: "value", value: 2, index: 2 },
      ],
    });
  });

  it.each([
    ["Multiply", "multiply", "mul"],
    ["Divide", "divide", "div"],
    ["Minimum", "minimum", "min"],
    ["Maximum", "maximum", "max"],
  ])(
    "restores a left-associated %s chain as flat operands",
    (_label, operationType, expressionKey) => {
      const state = createInitialState();
      openEditDialog(
        { state },
        {
          groupId: "folder-1",
          itemId: "computed-1",
          defaultValues: {
            name: "Result",
            valueSource: "computed",
            variableType: "number",
            computed: {
              expr: {
                [expressionKey]: [
                  {
                    [expressionKey]: [{ var: "variables.score" }, 4],
                  },
                  2,
                ],
              },
            },
          },
        },
      );

      const viewData = selectViewData({
        state,
        props: {
          flatGroups: [
            {
              children: [
                {
                  id: "score",
                  name: "Score",
                  type: "variable",
                  variableType: "number",
                },
              ],
            },
          ],
        },
        i18n: TEST_I18N,
      });

      expect(viewData.operationBlock).toEqual({
        type: operationType,
        operationPath: [],
        operands: [
          {
            source: "variable",
            variablePath: "variables.score",
            variableLabel: "Score",
            variableTypeLabel: "Number",
            index: 0,
          },
          { source: "value", value: 4, index: 1 },
          { source: "value", value: 2, index: 2 },
        ],
      });
    },
  );

  it.each([
    ["Equal", "equal", "eq", [1, 1]],
    ["Not equal", "notEqual", "neq", [false, true]],
    ["Greater than", "greaterThan", "gt", [5, 3]],
    ["Greater or equal", "greaterOrEqual", "gte", [5, 5]],
    ["Less than", "lessThan", "lt", [3, 5]],
    ["Less or equal", "lessOrEqual", "lte", [5, 5]],
    ["And", "and", "and", [true, false, true]],
    ["Or", "or", "or", [false, true]],
    ["Not", "not", "not", [false]],
  ])(
    "restores a %s operation",
    (_label, operationType, expressionKey, values) => {
      const state = createInitialState();
      openEditDialog(
        { state },
        {
          groupId: "folder-1",
          itemId: "computed-1",
          defaultValues: {
            name: "Result",
            valueSource: "computed",
            variableType: "boolean",
            computed: {
              expr: {
                [expressionKey]: values,
              },
            },
          },
        },
      );

      const viewData = selectViewData({
        state,
        props: { flatGroups: [] },
        i18n: TEST_I18N,
      });

      expect(viewData.operationBlock).toMatchObject({
        type: operationType,
        operationPath: [],
        operands: values.map((value, index) => ({
          source: "value",
          value,
          index,
        })),
      });
    },
  );

  it("preserves an intentional right-side nested Add operation", () => {
    const state = createInitialState();
    openEditDialog(
      { state },
      {
        groupId: "folder-1",
        itemId: "computed-1",
        defaultValues: {
          name: "Total",
          valueSource: "computed",
          variableType: "number",
          computed: {
            expr: {
              add: [
                { var: "variables.score" },
                {
                  add: [4, 6],
                },
              ],
            },
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            children: [
              {
                id: "score",
                name: "Score",
                type: "variable",
                variableType: "number",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.operationBlock).toEqual({
      type: "add",
      operationPath: [],
      operands: [
        {
          source: "variable",
          variablePath: "variables.score",
          variableLabel: "Score",
          variableTypeLabel: "Number",
          index: 0,
        },
        {
          source: "operation",
          index: 1,
          operation: {
            type: "add",
            operationPath: [1],
            operands: [
              { source: "value", value: 4, index: 0 },
              { source: "value", value: 6, index: 1 },
            ],
          },
        },
      ],
    });
  });

  it("defaults legacy stored number variables to zero when editing", () => {
    const state = createInitialState();

    openEditDialog(
      { state },
      {
        groupId: "folder-1",
        itemId: "score",
        defaultValues: {
          name: "Score",
          valueSource: "variable",
          variableType: "number",
          scope: "context",
        },
      },
    );

    expect(state.defaultValues.default).toBe(0);
  });

  it("searches localized variable type labels", () => {
    const state = createInitialState();

    setSearchQuery({ state }, { query: "真偽値" });

    const viewData = selectViewData({
      state,
      props: createProps(),
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups).toHaveLength(1);
    expect(viewData.flatGroups[0].children).toMatchObject([
      {
        id: "variable-1",
        variableType: "真偽値",
      },
    ]);
  });

  it("searches localized boolean default labels", () => {
    const state = createInitialState();

    setSearchQuery({ state }, { query: "はい" });

    const viewData = selectViewData({
      state,
      props: createProps(),
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups).toHaveLength(1);
    expect(viewData.flatGroups[0].children).toMatchObject([
      {
        id: "variable-1",
        default: "はい",
      },
    ]);
  });

  it("shows zero for legacy number variables without a default", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            id: "folder-1",
            children: [
              {
                id: "score",
                name: "Score",
                scope: "context",
                variableType: "number",
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups[0].children[0].default).toBe(0);
  });

  it("does not show the empty add row for groups with child folders", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            id: "parent-folder",
            children: [],
            hasChildFolders: true,
          },
          {
            id: "empty-folder",
            children: [],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups[0]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
        showEmptyAdd: false,
      }),
    );
    expect(viewData.flatGroups[1]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
        showEmptyAdd: true,
      }),
    );
  });

  it("shows conditional computed variables in the resource list", () => {
    const state = createInitialState();
    state.defaultValues.valueSource = "computed";
    state.defaultValues.computed = {
      branches: [{ when: true, expr: "yes" }],
      default: { expr: "no" },
    };

    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            id: "folder-1",
            children: [
              {
                id: "computed-1",
                name: "Status",
                type: "variable",
                variableType: "string",
                computed: state.defaultValues.computed,
              },
            ],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups[0].children[0]).toMatchObject({
      isComputed: true,
      default: "If",
    });
  });

  it.each([
    ["Subtract", "sub", [10, 3], "number"],
    ["Multiply", "mul", [10, 3], "number"],
    ["Divide", "div", [10, 3], "number"],
    ["Minimum", "min", [10, 3], "number"],
    ["Maximum", "max", [10, 3], "number"],
    ["Equal", "eq", [10, 3], "boolean"],
    ["Not equal", "neq", [10, 3], "boolean"],
    ["Greater than", "gt", [10, 3], "boolean"],
    ["Greater or equal", "gte", [10, 3], "boolean"],
    ["Less than", "lt", [10, 3], "boolean"],
    ["Less or equal", "lte", [10, 3], "boolean"],
    ["And", "and", [true, false], "boolean"],
    ["Or", "or", [true, false], "boolean"],
    ["Not", "not", [true], "boolean"],
  ])(
    "shows %s computed variables in the resource list",
    (operationLabel, expressionKey, operands, variableType) => {
      const state = createInitialState();
      const viewData = selectViewData({
        state,
        props: {
          flatGroups: [
            {
              id: "folder-1",
              children: [
                {
                  id: "computed-1",
                  name: "Result",
                  type: "variable",
                  variableType,
                  computed: { expr: { [expressionKey]: operands } },
                },
              ],
            },
          ],
        },
        i18n: TEST_I18N,
      });

      expect(viewData.flatGroups[0].children[0]).toMatchObject({
        isComputed: true,
        default: operationLabel,
      });
    },
  );
});
