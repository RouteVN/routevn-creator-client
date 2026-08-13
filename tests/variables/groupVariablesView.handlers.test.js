import { describe, expect, it, vi } from "vitest";
import {
  handleAddConditionalBranchClick,
  handleAddConditionalNodeClick,
  handleAddComputedExampleClick,
  handleAddOperationClick,
  handleAddOperationOperandClick,
  handleAddVariableClick,
  handleConditionalNodeContextMenu,
  handleConditionalValueClick,
  handleConditionalVariableClick,
  handleComputedExampleContextMenu,
  handleComputedExampleFormAction,
  handleDialogFormChange,
  handleDuplicateConditionalBranchClick,
  handleEditOperationVariableClick,
  handleEditOperationValueClick,
  handleFormActionClick,
  handleVariableFormKeyDown,
  handleVariableSubmitClick,
  handleMoveConditionalBranchClick,
  handleOperandSourceMenuClose,
  handleOperandSourceMenuClick,
  handleOperationBlockContextMenu,
  handleOperationBlockMenuClick,
  handleOperationChoiceMenuClick,
  handleOperationOperandContextMenu,
  handleOperationValueSubmit,
  handleRemoveConditionalBranchClick,
  handleRemoveOperationOperandClick,
  handleRowClick,
  handleRowContextMenu,
  handleRowDoubleClick,
} from "../../src/components/groupVariablesView/groupVariablesView.handlers.js";

const createRowEvent = (itemId, id = "rowRef0x0") => ({
  currentTarget: {
    id,
    getAttribute: vi.fn((name) =>
      name === "data-item-id" ? itemId : undefined,
    ),
  },
});

const createDropdownMenuRef = () => {
  const popover = {
    removeAttribute: vi.fn(),
  };
  const menu = {
    open: true,
    shadowRoot: {
      querySelector: vi.fn(() => popover),
    },
  };
  return { menu, popover };
};

describe("groupVariablesView.handlers", () => {
  const createVariableSubmitDeps = () => {
    const defaultValues = {
      name: "",
      valueSource: "variable",
      scope: "context",
      variableType: "number",
      default: 0,
    };
    const dispatchEvent = vi.fn();
    return {
      deps: {
        appService: { showAlert: vi.fn() },
        dispatchEvent,
        i18n: { resourcePages: {}, variablesPage: {} },
        props: { flatGroups: [] },
        refs: {
          variableForm: {
            getValues: vi.fn(() => ({
              name: "Score",
              valueSource: "variable",
              scope: "context",
              variableType: "number",
              default: 10,
            })),
          },
        },
        store: {
          selectDefaultValues: vi.fn(() => defaultValues),
          selectSubmitContext: vi.fn(() => ({
            targetGroupId: "folder-1",
            dialogMode: "add",
            editingItemId: undefined,
            defaultValues,
          })),
        },
      },
      dispatchEvent,
    };
  };

  it("submits the active form from the pinned dialog action", () => {
    const { deps, dispatchEvent } = createVariableSubmitDeps();

    handleVariableSubmitClick(deps);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "variable-created",
      detail: {
        groupId: "folder-1",
        name: "Score",
        scope: "context",
        variableType: "number",
        default: 10,
      },
    });
  });

  it("submits on Enter but keeps textarea Enter available", () => {
    const first = createVariableSubmitDeps();
    const preventDefault = vi.fn();

    handleVariableFormKeyDown(first.deps, {
      _event: {
        key: "Enter",
        shiftKey: false,
        composedPath: () => [{ tagName: "RTGL-INPUT" }],
        preventDefault,
      },
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(first.dispatchEvent).toHaveBeenCalledOnce();

    const second = createVariableSubmitDeps();
    handleVariableFormKeyDown(second.deps, {
      _event: {
        key: "Enter",
        shiftKey: false,
        composedPath: () => [{ tagName: "RTGL-TEXTAREA" }],
        preventDefault: vi.fn(),
      },
    });

    expect(second.dispatchEvent).not.toHaveBeenCalled();
  });

  it("opens a computed dialog from the Add dropdown selection", async () => {
    const openAddDialog = vi.fn();
    const render = vi.fn();
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "computed" },
    });

    await handleAddVariableClick(
      {
        appService: { showDropdownMenu },
        i18n: { resourcePages: {}, variablesPage: {} },
        props: {},
        store: { openAddDialog },
        render,
      },
      {
        _event: {
          stopPropagation: vi.fn(),
          currentTarget: {
            id: "addVariableButtonRef0",
            getAttribute: (name) =>
              name === "data-group-id" ? "folder-1" : undefined,
            getBoundingClientRect: () => ({ left: 20, bottom: 40 }),
          },
        },
      },
    );

    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: [
        { type: "item", label: "Variable", key: "variable" },
        { type: "item", label: "Computed", key: "computed" },
      ],
      x: 20,
      y: 40,
      place: "bs",
    });
    expect(openAddDialog).toHaveBeenCalledWith({
      groupId: "folder-1",
      valueSource: "computed",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens a computed example form with every referenced input", () => {
    const reset = vi.fn();
    const setValues = vi.fn();
    const openComputedExampleDialog = vi.fn();
    const render = vi.fn();

    handleAddComputedExampleClick({
      props: {
        flatGroups: [
          {
            children: [
              {
                id: "score",
                type: "variable",
                name: "Score",
                variableType: "number",
                default: 5,
              },
            ],
          },
        ],
      },
      refs: { computedExampleForm: { reset, setValues } },
      render,
      store: {
        selectComputedExampleInputDefinition: () => ({
          expr: { var: "variables.score" },
        }),
        openComputedExampleDialog,
        selectComputedExampleDialogDefaultValues: () => ({ input0: 5 }),
      },
    });

    expect(openComputedExampleDialog).toHaveBeenCalledWith({
      exampleId: undefined,
      inputItems: [
        expect.objectContaining({
          source: "variables",
          id: "score",
          formName: "input0",
          defaultValue: 5,
        }),
      ],
    });
    expect(render).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(setValues).toHaveBeenCalledWith({ values: { input0: 5 } });
  });

  it("opens the example form while the computed formula is incomplete", () => {
    const openComputedExampleDialog = vi.fn();

    handleAddComputedExampleClick({
      props: { flatGroups: [] },
      refs: {
        computedExampleForm: {
          reset: vi.fn(),
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
      store: {
        selectComputedExampleInputDefinition: () => ({
          expr: { exampleInputs: [] },
        }),
        openComputedExampleDialog,
        selectComputedExampleDialogDefaultValues: () => ({}),
      },
    });

    expect(openComputedExampleDialog).toHaveBeenCalledWith({
      exampleId: undefined,
      inputItems: [],
    });
  });

  it("saves a computed example without persisting its derived result", () => {
    const saveComputedExample = vi.fn();
    const closeComputedExampleDialog = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();

    handleComputedExampleFormAction(
      {
        appService: { showAlert: vi.fn() },
        i18n: { resourcePages: {}, variablesPage: {} },
        refs: { computedForm: { setValues } },
        render,
        store: {
          selectComputedExampleDialog: () => ({
            editingExampleId: "example-1",
            inputItems: [
              {
                source: "variables",
                id: "score",
                type: "number",
                formName: "input0",
              },
            ],
          }),
          saveComputedExample,
          closeComputedExampleDialog,
          selectDefaultValues: () => ({
            computed: { expr: { var: "variables.score" } },
          }),
        },
      },
      {
        _event: {
          detail: {
            actionId: "submit",
            values: { name: "High score", input0: "12" },
          },
        },
      },
    );

    expect(saveComputedExample).toHaveBeenCalledWith({
      id: "example-1",
      name: "High score",
      input: { variables: { score: 12 } },
    });
    expect(saveComputedExample.mock.calls[0][0]).not.toHaveProperty("result");
    expect(closeComputedExampleDialog).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(setValues).toHaveBeenCalledOnce();
  });

  it("requires a computed example name", () => {
    const showAlert = vi.fn();
    const saveComputedExample = vi.fn();

    handleComputedExampleFormAction(
      {
        appService: { showAlert },
        i18n: { resourcePages: {}, variablesPage: {} },
        refs: { computedForm: { setValues: vi.fn() } },
        render: vi.fn(),
        store: {
          selectComputedExampleDialog: () => ({ inputItems: [] }),
          saveComputedExample,
        },
      },
      {
        _event: {
          detail: { actionId: "submit", values: { name: "   " } },
        },
      },
    );

    expect(showAlert).toHaveBeenCalledWith({
      message: "Example name is required.",
      title: "Warning",
    });
    expect(saveComputedExample).not.toHaveBeenCalled();
  });

  it("removes a computed example from its context menu", async () => {
    const removeComputedExample = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "remove" },
    });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await handleComputedExampleContextMenu(
      {
        appService: { showDropdownMenu },
        i18n: { resourcePages: {}, variablesPage: {} },
        refs: { computedForm: { setValues } },
        render,
        store: {
          removeComputedExample,
          selectDefaultValues: () => ({}),
        },
      },
      {
        _event: {
          preventDefault,
          stopPropagation,
          clientX: 20,
          clientY: 30,
          currentTarget: {
            dataset: { exampleId: "example-1" },
            getBoundingClientRect: () => ({ left: 5, bottom: 10 }),
          },
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: [{ type: "item", label: "Remove", key: "remove" }],
      x: 20,
      y: 30,
      place: "bs",
    });
    expect(removeComputedExample).toHaveBeenCalledWith({
      exampleId: "example-1",
    });
    expect(setValues).toHaveBeenCalledWith({ values: {} });
    expect(render).toHaveBeenCalledOnce();
  });

  it("ignores mobile row double clicks", () => {
    const store = {
      openEditDialog: vi.fn(),
    };

    handleRowDoubleClick(
      {
        props: {
          mobileLayout: true,
        },
        store,
      },
      {
        _event: createRowEvent("variable-1"),
      },
    );

    expect(store.openEditDialog).not.toHaveBeenCalled();
  });

  it("opens the edit dialog instead of the row context menu on mobile contextmenu gestures", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const store = {
      openEditDialog: vi.fn(),
      showContextMenu: vi.fn(),
    };
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    handleRowContextMenu(
      {
        props: {
          mobileLayout: true,
          flatGroups: [
            {
              id: "folder-1",
              children: [
                {
                  id: "variable-1",
                  name: "Score",
                  variableType: "number",
                },
              ],
            },
          ],
        },
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          ...createRowEvent("variable-1"),
          preventDefault,
          stopPropagation,
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "variable-item-click",
        detail: {
          itemId: "variable-1",
          suppressMobileDetailSheet: true,
        },
      }),
    );
    expect(store.openEditDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "variable-1",
      }),
    );
    expect(store.showContextMenu).not.toHaveBeenCalled();
  });

  it("selects the row when opening its desktop context menu", () => {
    const dispatchEvent = vi.fn();
    const showContextMenu = vi.fn();

    handleRowContextMenu(
      {
        props: {
          mobileLayout: false,
        },
        dispatchEvent,
        store: {
          showContextMenu,
        },
        render: vi.fn(),
      },
      {
        _event: {
          ...createRowEvent("variable-1"),
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(showContextMenu).toHaveBeenCalledWith({
      itemId: "variable-1",
      x: 10,
      y: 20,
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "variable-item-click",
        detail: { itemId: "variable-1" },
      }),
    );
  });

  it("ignores placeholder row events with empty data ids", () => {
    const dispatchEvent = vi.fn();

    handleRowClick(
      {
        dispatchEvent,
      },
      {
        _event: createRowEvent(""),
      },
    );

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("opens the component-owned operation menu", () => {
    const showOperationChoiceMenu = vi.fn();
    const render = vi.fn();
    const stopPropagation = vi.fn();

    handleAddOperationClick(
      {
        store: { showOperationChoiceMenu },
        render,
      },
      {
        _event: {
          stopPropagation,
          currentTarget: {
            getBoundingClientRect: () => ({ left: 10, bottom: 20 }),
          },
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(showOperationChoiceMenu).toHaveBeenCalledWith({
      x: 10,
      y: 20,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it.each([
    ["Add", "add"],
    ["Subtract", "subtract"],
    ["Multiply", "multiply"],
    ["Divide", "divide"],
    ["Minimum", "minimum"],
    ["Maximum", "maximum"],
    ["Equal", "equal"],
    ["Not equal", "notEqual"],
    ["Greater than", "greaterThan"],
    ["Greater or equal", "greaterOrEqual"],
    ["Less than", "lessThan"],
    ["Less or equal", "lessOrEqual"],
    ["And", "and"],
    ["Or", "or"],
    ["Not", "not"],
  ])(
    "creates a %s block from the component-owned operation menu",
    (_label, operationType) => {
      const createOperation = vi.fn();
      const hideOperationChoiceMenu = vi.fn();
      const setValues = vi.fn();
      const render = vi.fn();
      const operationChoiceMenu = { open: true };

      handleOperationChoiceMenuClick(
        {
          props: {},
          refs: { computedForm: { setValues }, operationChoiceMenu },
          store: {
            createOperation,
            hideOperationChoiceMenu,
            selectDefaultValues: () => ({
              valueSource: "computed",
              variableType: "number",
            }),
          },
          render,
        },
        {
          _event: {
            detail: {
              item: { value: operationType },
            },
          },
        },
      );

      expect(hideOperationChoiceMenu).toHaveBeenCalledOnce();
      expect(operationChoiceMenu.open).toBe(false);
      expect(createOperation).toHaveBeenCalledWith({ operationType });
      expect(render).toHaveBeenCalledOnce();
      expect(setValues).toHaveBeenCalledWith({
        values: {
          valueSource: "computed",
          variableType: "number",
        },
      });
    },
  );

  it("creates an If builder from the root operation menu", () => {
    const createConditional = vi.fn();
    const hideOperationChoiceMenu = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();
    const operationChoiceMenu = { open: true };
    const values = {
      valueSource: "computed",
      variableType: "string",
      computed: undefined,
    };

    handleOperationChoiceMenuClick(
      {
        refs: { computedForm: { setValues }, operationChoiceMenu },
        store: {
          createConditional,
          hideOperationChoiceMenu,
          selectDefaultValues: () => values,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "if" },
          },
        },
      },
    );

    expect(operationChoiceMenu.open).toBe(false);
    expect(hideOperationChoiceMenu).toHaveBeenCalledOnce();
    expect(createConditional).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(setValues).toHaveBeenCalledWith({ values });
  });

  it("opens the Add block context menu at the pointer", () => {
    const showOperationBlockMenu = vi.fn();
    const render = vi.fn();

    handleOperationBlockContextMenu(
      {
        store: { showOperationBlockMenu },
        render,
      },
      {
        _event: {
          detail: {
            operationPath: [1],
            x: 30,
            y: 40,
          },
        },
      },
    );

    expect(showOperationBlockMenu).toHaveBeenCalledWith({
      operationPath: [1],
      x: 30,
      y: 40,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the Remove context menu for a selected conditional variable", () => {
    const showOperationBlockMenu = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const render = vi.fn();

    handleConditionalNodeContextMenu(
      {
        store: { showOperationBlockMenu },
        render,
      },
      {
        _event: {
          preventDefault,
          stopPropagation,
          currentTarget: {
            dataset: {
              targetKind: "result",
              branchIndex: "2",
            },
          },
          clientX: 30,
          clientY: 40,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(showOperationBlockMenu).toHaveBeenCalledWith({
      purpose: "node",
      target: { kind: "result", branchIndex: 2 },
      x: 30,
      y: 40,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens variable choices directly for a selected conditional variable", () => {
    const showOperandSourceMenu = vi.fn();
    const stopPropagation = vi.fn();
    const render = vi.fn();

    handleConditionalVariableClick(
      {
        store: { showOperandSourceMenu },
        render,
      },
      {
        _event: {
          stopPropagation,
          currentTarget: {
            dataset: {
              targetKind: "default",
            },
            getBoundingClientRect: () => ({
              left: 30,
              bottom: 40,
            }),
          },
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(showOperandSourceMenu).toHaveBeenCalledWith({
      purpose: "node-variable",
      target: { kind: "default" },
      x: 30,
      y: 40,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it.each([
    ["Then", { kind: "result", branchIndex: 1 }],
    ["Otherwise", { kind: "default" }],
  ])("opens the value editor for a selected %s value", (_label, target) => {
    const selectConditionalNodeValue = vi.fn(() => "Ready");
    const showOperationValuePopover = vi.fn();
    const stopPropagation = vi.fn();
    const render = vi.fn();

    handleConditionalValueClick(
      {
        store: {
          selectConditionalNodeValue,
          showOperationValuePopover,
        },
        render,
      },
      {
        _event: {
          stopPropagation,
          currentTarget: {
            dataset: {
              targetKind: target.kind,
              branchIndex: target.branchIndex?.toString(),
            },
            getBoundingClientRect: () => ({
              left: 30,
              bottom: 40,
            }),
          },
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(selectConditionalNodeValue).toHaveBeenCalledWith({ target });
    expect(showOperationValuePopover).toHaveBeenCalledWith({
      purpose: "node",
      target,
      initialValue: { value: "Ready" },
      x: 30,
      y: 40,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("removes the Add block from its context menu", () => {
    const hideOperationBlockMenu = vi.fn();
    const removeOperation = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();
    const values = {
      valueSource: "computed",
      variableType: "number",
      computed: undefined,
    };
    const operationBlockMenu = { open: true };

    handleOperationBlockMenuClick(
      {
        refs: { computedForm: { setValues }, operationBlockMenu },
        store: {
          hideOperationBlockMenu,
          removeOperation,
          selectOperationBlockMenuPosition: () => ({
            operationPath: [1],
          }),
          selectDefaultValues: () => values,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "remove" },
          },
        },
      },
    );

    expect(hideOperationBlockMenu).toHaveBeenCalledOnce();
    expect(operationBlockMenu.open).toBe(false);
    expect(removeOperation).toHaveBeenCalledWith({ operationPath: [1] });
    expect(render).toHaveBeenCalledOnce();
    expect(setValues).toHaveBeenCalledWith({ values });
  });

  it("removes a conditional variable from its context menu", () => {
    const hideOperationBlockMenu = vi.fn();
    const removeConditionalNode = vi.fn();
    const removeOperation = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();
    const values = {
      valueSource: "computed",
      variableType: "string",
      computed: undefined,
    };
    const operationBlockMenu = { open: true };
    const target = { kind: "default" };

    handleOperationBlockMenuClick(
      {
        refs: { computedForm: { setValues }, operationBlockMenu },
        store: {
          hideOperationBlockMenu,
          removeConditionalNode,
          removeOperation,
          selectOperationBlockMenuPosition: () => ({
            purpose: "node",
            target,
          }),
          selectDefaultValues: () => values,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "remove" },
          },
        },
      },
    );

    expect(hideOperationBlockMenu).toHaveBeenCalledOnce();
    expect(operationBlockMenu.open).toBe(false);
    expect(removeConditionalNode).toHaveBeenCalledWith({ target });
    expect(removeOperation).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledOnce();
    expect(setValues).toHaveBeenCalledWith({ values });
  });

  it("removes a variable operand from its context menu", () => {
    const hideOperationBlockMenu = vi.fn();
    const removeOperationOperand = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();
    const values = {
      valueSource: "computed",
      variableType: "boolean",
      computed: undefined,
    };
    const operationBlockMenu = { open: true };
    const target = { kind: "condition", branchIndex: 0 };

    handleOperationBlockMenuClick(
      {
        refs: { computedForm: { setValues }, operationBlockMenu },
        store: {
          hideOperationBlockMenu,
          removeOperationOperand,
          selectOperationBlockMenuPosition: () => ({
            operationPath: [1],
            purpose: "operand",
            target,
            operandIndex: 0,
          }),
          selectDefaultValues: () => values,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "remove" },
          },
        },
      },
    );

    expect(removeOperationOperand).toHaveBeenCalledWith({
      operationPath: [1],
      target,
      index: 0,
    });
    expect(render).toHaveBeenCalledOnce();
    expect(setValues).toHaveBeenCalledWith({ values });
  });

  it("opens the component-owned operand menu", () => {
    const showOperandSourceMenu = vi.fn();
    const render = vi.fn();

    handleAddOperationOperandClick(
      {
        store: { showOperandSourceMenu },
        render,
      },
      {
        _event: {
          detail: {
            operationPath: [1],
            x: 10,
            y: 20,
          },
        },
      },
    );

    expect(showOperandSourceMenu).toHaveBeenCalledWith({
      operationPath: [1],
      x: 10,
      y: 20,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("closes the operand dropdown overlay before rendering its closed state", () => {
    const { menu: operandSourceMenu, popover } = createDropdownMenuRef();
    const hideOperandSourceMenu = vi.fn();
    const render = vi.fn(() => {
      expect(operandSourceMenu.open).toBe(false);
      expect(popover.removeAttribute).toHaveBeenCalledWith("open");
    });

    handleOperandSourceMenuClose({
      refs: { operandSourceMenu },
      store: { hideOperandSourceMenu },
      render,
    });

    expect(hideOperandSourceMenu).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("adds a nested variable-menu selection as an operand", () => {
    const addOperationOperand = vi.fn();
    const hideOperandSourceMenu = vi.fn();
    const render = vi.fn();
    const { menu: operandSourceMenu } = createDropdownMenuRef();

    handleOperandSourceMenuClick(
      {
        refs: { operandSourceMenu },
        store: {
          addOperationOperand,
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [1],
          }),
        },
        render,
      },
      {
        _event: {
          detail: {
            indexPath: [0, 0],
            item: { value: "variables.score" },
          },
        },
      },
    );

    expect(hideOperandSourceMenu).toHaveBeenCalledOnce();
    expect(operandSourceMenu.open).toBe(false);
    expect(addOperationOperand).toHaveBeenCalledWith({
      source: "variable",
      variablePath: "variables.score",
      operationPath: [1],
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("adds a conditional result from the nested variable menu", () => {
    const setConditionalNode = vi.fn();
    const hideOperandSourceMenu = vi.fn();
    const render = vi.fn();
    const { menu: operandSourceMenu } = createDropdownMenuRef();
    const target = { kind: "result", branchIndex: 0 };

    handleOperandSourceMenuClick(
      {
        refs: { operandSourceMenu },
        store: {
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            purpose: "node",
            target,
            x: 30,
            y: 40,
          }),
          setConditionalNode,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "variables.status" },
          },
        },
      },
    );

    expect(setConditionalNode).toHaveBeenCalledWith({
      source: "variable",
      variablePath: "variables.status",
      target,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("updates a variable operand from its direct variable menu", () => {
    const updateOperationVariableOperand = vi.fn();
    const hideOperandSourceMenu = vi.fn();
    const render = vi.fn();
    const { menu: operandSourceMenu } = createDropdownMenuRef();
    const target = { kind: "condition", branchIndex: 0 };

    handleOperandSourceMenuClick(
      {
        refs: { operandSourceMenu },
        store: {
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            purpose: "operation-variable",
            operationPath: [1],
            target,
            operandIndex: 0,
          }),
          updateOperationVariableOperand,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "variables.status" },
          },
        },
      },
    );

    expect(updateOperationVariableOperand).toHaveBeenCalledWith({
      variablePath: "variables.status",
      operationPath: [1],
      target,
      index: 0,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the source menu for a conditional node", () => {
    const showOperandSourceMenu = vi.fn();
    const stopPropagation = vi.fn();
    const render = vi.fn();

    handleAddConditionalNodeClick(
      {
        store: { showOperandSourceMenu },
        render,
      },
      {
        _event: {
          stopPropagation,
          currentTarget: {
            dataset: {
              targetKind: "result",
              branchIndex: "2",
            },
            getBoundingClientRect: () => ({
              left: 15,
              bottom: 25,
            }),
          },
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(showOperandSourceMenu).toHaveBeenCalledWith({
      purpose: "node",
      target: { kind: "result", branchIndex: 2 },
      x: 15,
      y: 25,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("adds, duplicates, moves, and removes conditional branches", () => {
    const store = {
      addConditionalBranch: vi.fn(),
      duplicateConditionalBranch: vi.fn(),
      moveConditionalBranch: vi.fn(),
      removeConditionalBranch: vi.fn(),
    };
    const render = vi.fn();
    const deps = { store, render };

    handleAddConditionalBranchClick(deps);
    handleDuplicateConditionalBranchClick(deps, {
      _event: { currentTarget: { dataset: { branchIndex: "1" } } },
    });
    handleMoveConditionalBranchClick(deps, {
      _event: {
        currentTarget: {
          dataset: { branchIndex: "2", offset: "-1" },
        },
      },
    });
    handleRemoveConditionalBranchClick(deps, {
      _event: { currentTarget: { dataset: { branchIndex: "3" } } },
    });

    expect(store.addConditionalBranch).toHaveBeenCalledOnce();
    expect(store.duplicateConditionalBranch).toHaveBeenCalledWith({
      branchIndex: 1,
    });
    expect(store.moveConditionalBranch).toHaveBeenCalledWith({
      branchIndex: 2,
      offset: -1,
    });
    expect(store.removeConditionalBranch).toHaveBeenCalledWith({
      branchIndex: 3,
    });
    expect(render).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["Add", "add", [2, 0]],
    ["Subtract", "subtract", [2, 1]],
    ["Multiply", "multiply", [2, 2]],
    ["Divide", "divide", [2, 3]],
    ["Minimum", "minimum", [2, 4]],
    ["Maximum", "maximum", [2, 5]],
    ["Equal", "equal", [2, 6]],
    ["Not equal", "notEqual", [2, 7]],
    ["Greater than", "greaterThan", [2, 8]],
    ["Greater or equal", "greaterOrEqual", [2, 9]],
    ["Less than", "lessThan", [2, 10]],
    ["Less or equal", "lessOrEqual", [2, 11]],
    ["And", "and", [2, 12]],
    ["Or", "or", [2, 13]],
    ["Not", "not", [2, 14]],
  ])(
    "adds a nested %s selection from the Operation submenu",
    (_label, operationType, indexPath) => {
      const addOperationOperand = vi.fn();
      const hideOperandSourceMenu = vi.fn();
      const render = vi.fn();
      const { menu: operandSourceMenu } = createDropdownMenuRef();

      handleOperandSourceMenuClick(
        {
          refs: { operandSourceMenu },
          store: {
            addOperationOperand,
            hideOperandSourceMenu,
            selectOperandSourceMenuPosition: () => ({
              x: 30,
              y: 40,
              operationPath: [1],
            }),
          },
          render,
        },
        {
          _event: {
            detail: {
              indexPath,
              item: { value: operationType },
            },
          },
        },
      );

      expect(hideOperandSourceMenu).toHaveBeenCalledOnce();
      expect(operandSourceMenu.open).toBe(false);
      expect(addOperationOperand).toHaveBeenCalledWith({
        source: "operation",
        operationType,
        operationPath: [1],
      });
      expect(render).toHaveBeenCalledOnce();
    },
  );

  it("opens the number popover from the Value operand menu item", () => {
    const addOperationOperand = vi.fn();
    const hideOperandSourceMenu = vi.fn();
    const showOperationValuePopover = vi.fn();
    const { menu: operandSourceMenu, popover } = createDropdownMenuRef();
    const render = vi.fn(() => {
      expect(operandSourceMenu.open).toBe(false);
      expect(popover.removeAttribute).toHaveBeenCalledWith("open");
    });

    handleOperandSourceMenuClick(
      {
        refs: { operandSourceMenu },
        store: {
          addOperationOperand,
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [1],
          }),
          showOperationValuePopover,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "value" },
          },
        },
      },
    );

    expect(hideOperandSourceMenu).toHaveBeenCalledOnce();
    expect(operandSourceMenu.open).toBe(false);
    expect(addOperationOperand).not.toHaveBeenCalled();
    expect(showOperationValuePopover).toHaveBeenCalledWith({
      x: 30,
      y: 40,
      operationPath: [1],
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it.each([
    ["number", 3.5],
    ["string", "ready"],
    ["boolean", false],
  ])("submits a %s Value operand from the popover form", (_type, value) => {
    const addOperationOperand = vi.fn();
    const hideOperationValuePopover = vi.fn();
    const render = vi.fn();
    const store = {
      addOperationOperand,
      hideOperationValuePopover,
      selectOperationValuePopoverPosition: () => ({
        operationPath: [1],
        purpose: "operand",
      }),
    };

    handleOperationValueSubmit(
      { store, render },
      {
        _event: {
          detail: { value },
        },
      },
    );

    expect(addOperationOperand).toHaveBeenCalledWith({
      source: "value",
      value,
      operationPath: [1],
    });
    expect(hideOperationValuePopover).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens a prefilled popover when a Value operand is clicked", () => {
    const showOperationValuePopover = vi.fn();
    const render = vi.fn();
    const target = { kind: "condition", branchIndex: 0 };

    handleEditOperationValueClick(
      {
        store: { showOperationValuePopover },
        render,
      },
      {
        _event: {
          detail: {
            operationPath: [1],
            target,
            index: 0,
            value: "ready",
            x: 30,
            y: 40,
          },
        },
      },
    );

    expect(showOperationValuePopover).toHaveBeenCalledWith({
      operationPath: [1],
      target,
      purpose: "edit",
      operandIndex: 0,
      initialValue: { value: "ready" },
      x: 30,
      y: 40,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens compatible variables when a variable operand is clicked", () => {
    const showOperandSourceMenu = vi.fn();
    const render = vi.fn();
    const target = { kind: "condition", branchIndex: 0 };

    handleEditOperationVariableClick(
      {
        store: { showOperandSourceMenu },
        render,
      },
      {
        _event: {
          detail: {
            operationPath: [1],
            target,
            index: 0,
            x: 30,
            y: 40,
          },
        },
      },
    );

    expect(showOperandSourceMenu).toHaveBeenCalledWith({
      operationPath: [1],
      target,
      purpose: "operation-variable",
      operandIndex: 0,
      x: 30,
      y: 40,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens Remove for a right-clicked variable operand", () => {
    const showOperationBlockMenu = vi.fn();
    const render = vi.fn();
    const target = { kind: "condition", branchIndex: 0 };

    handleOperationOperandContextMenu(
      {
        store: { showOperationBlockMenu },
        render,
      },
      {
        _event: {
          detail: {
            operationPath: [1],
            target,
            index: 0,
            x: 30,
            y: 40,
          },
        },
      },
    );

    expect(showOperationBlockMenu).toHaveBeenCalledWith({
      operationPath: [1],
      target,
      purpose: "operand",
      operandIndex: 0,
      x: 30,
      y: 40,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("updates a clicked Value operand from the popover", () => {
    const updateOperationValueOperand = vi.fn();
    const hideOperationValuePopover = vi.fn();
    const render = vi.fn();
    const target = { kind: "condition", branchIndex: 0 };

    handleOperationValueSubmit(
      {
        store: {
          updateOperationValueOperand,
          hideOperationValuePopover,
          selectOperationValuePopoverPosition: () => ({
            operationPath: [1],
            purpose: "edit",
            target,
            operandIndex: 0,
          }),
        },
        render,
      },
      {
        _event: {
          detail: { value: "updated" },
        },
      },
    );

    expect(updateOperationValueOperand).toHaveBeenCalledWith({
      value: "updated",
      operationPath: [1],
      target,
      index: 0,
    });
    expect(hideOperationValuePopover).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("removes an operand from its owning nested operation", () => {
    const removeOperationOperand = vi.fn();
    const render = vi.fn();

    handleRemoveOperationOperandClick(
      {
        store: { removeOperationOperand },
        render,
      },
      {
        _event: {
          detail: {
            operationPath: [1],
            index: 2,
          },
        },
      },
    );

    expect(removeOperationOperand).toHaveBeenCalledWith({
      operationPath: [1],
      index: 2,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("shows feedback when no compatible variable can be added", () => {
    const addOperationOperand = vi.fn();
    const hideOperandSourceMenu = vi.fn();
    const showToast = vi.fn();
    const render = vi.fn();
    const { menu: operandSourceMenu } = createDropdownMenuRef();

    handleOperandSourceMenuClick(
      {
        appService: { showToast },
        i18n: { resourcePages: {}, variablesPage: {} },
        refs: { operandSourceMenu },
        store: {
          addOperationOperand,
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [],
          }),
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "variable" },
          },
        },
      },
    );

    expect(addOperationOperand).not.toHaveBeenCalled();
    expect(operandSourceMenu.open).toBe(false);
    expect(showToast).toHaveBeenCalledWith({
      message: "Create a compatible variable before adding a Variable operand.",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("preserves the operation when another computed form field changes", () => {
    const computed = {
      expr: {
        add: [{ var: "variables.score" }, 10],
      },
    };
    const updateFormValues = vi.fn();

    handleDialogFormChange(
      {
        refs: {},
        store: {
          selectDefaultValues: () => ({
            name: "Total",
            valueSource: "computed",
            variableType: "number",
            computed,
          }),
          selectIsEditMode: () => false,
          updateFormValues,
        },
        render: vi.fn(),
      },
      {
        _event: {
          detail: {
            values: { name: "New total" },
          },
        },
      },
    );

    expect(updateFormValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New total",
        computed,
      }),
    );
  });

  it("explains that an incomplete If needs an Otherwise result", () => {
    const showAlert = vi.fn();
    const dispatchEvent = vi.fn();

    handleFormActionClick(
      {
        appService: { showAlert },
        dispatchEvent,
        i18n: {
          resourcePages: {},
          variablesPage: {
            computedConditionalIncomplete:
              "Complete every condition and result, including Otherwise.",
            warningTitle: "Warning",
          },
        },
        props: { flatGroups: [] },
        render: vi.fn(),
        store: {
          selectSubmitContext: () => ({
            targetGroupId: "folder-1",
            dialogMode: "add",
            editingItemId: undefined,
            computedMode: "conditional",
            defaultValues: {
              valueSource: "computed",
              variableType: "string",
              computed: undefined,
            },
          }),
        },
      },
      {
        _event: {
          detail: {
            actionId: "submit",
            values: {
              name: "Availability",
              valueSource: "computed",
              variableType: "string",
            },
          },
        },
      },
    );

    expect(showAlert).toHaveBeenCalledWith({
      message: "Complete every condition and result, including Otherwise.",
      title: "Warning",
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("submits duplicate variable names when form values omit slot data", () => {
    const computed = {
      expr: {
        add: [{ var: "variables.score" }, 10],
      },
    };
    const dispatchEvent = vi.fn();
    const closeDialog = vi.fn();

    handleFormActionClick(
      {
        appService: { showAlert: vi.fn() },
        dispatchEvent,
        i18n: { resourcePages: {}, variablesPage: {} },
        props: {
          flatGroups: [
            {
              children: [{ id: "existing", name: "Total" }],
            },
          ],
        },
        render: vi.fn(),
        store: {
          closeDialog,
          selectSubmitContext: () => ({
            targetGroupId: "folder-1",
            dialogMode: "add",
            editingItemId: undefined,
            defaultValues: {
              valueSource: "computed",
              variableType: "number",
              computed,
            },
          }),
        },
      },
      {
        _event: {
          detail: {
            actionId: "submit",
            values: {
              name: "Total",
              valueSource: "computed",
              variableType: "number",
            },
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "variable-created",
        detail: expect.objectContaining({
          name: "Total",
          computed,
        }),
      }),
    );
    expect(closeDialog).not.toHaveBeenCalled();
  });
});
