import { describe, expect, it } from "vitest";
import {
  addOperationOperand,
  createAddOperation,
  createInitialState,
  openAddDialog,
  openEditDialog,
  removeOperation,
  removeOperationOperand,
  selectViewData,
  setSearchQuery,
  showOperandSourceMenu,
  showOperationBlockMenu,
  showOperationChoiceMenu,
  showOperationValuePopover,
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
          name: "Can Continue",
          scope: "context",
          variableType: "boolean",
          default: true,
        },
      ],
    },
  ],
});

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
    expect(computedView.operationBlock).toBeUndefined();
  });

  it("authors an Add operation from multiple variables and values", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });

    createAddOperation({ state });
    expect(state.defaultValues.variableType).toBe("number");
    expect(state.defaultValues.computed).toBeUndefined();

    addOperationOperand(
      { state },
      { source: "variable", variablePath: "variables.score" },
    );
    addOperationOperand({ state }, { source: "value", value: 4 });
    addOperationOperand({ state }, { source: "value" });
    updateOperationValueOperand({ state }, { index: 2, value: 6 });

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

  it("authors a nested Add operation as an operand", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    createAddOperation({ state });
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

  it("keeps a nested operation on the right when replacing its leading operand", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "folder-1", valueSource: "computed" });
    createAddOperation({ state });
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
    createAddOperation({ state });
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
        { label: "If", value: "if", disabled: true },
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
        {
          label: "Operation",
          value: "operation",
          disabled: true,
        },
      ],
    });
    expect(viewData.operandSourceMenu.items[0]).not.toHaveProperty("disabled");
    createAddOperation({ state });
    addOperationOperand({ state }, { source: "value", value: 1 });
    showOperandSourceMenu({ state }, { x: 30, y: 40 });
    viewData = selectViewData({
      state,
      props: { flatGroups: [] },
      i18n: TEST_I18N,
    });
    expect(viewData.operandSourceMenu.items[2]).not.toHaveProperty("disabled");
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
});
