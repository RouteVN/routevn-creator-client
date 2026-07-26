import { describe, expect, it, vi } from "vitest";
import {
  handleAddOperationClick,
  handleAddOperationOperandClick,
  handleAddVariableClick,
  handleDialogFormChange,
  handleFormActionClick,
  handleOperandSourceMenuClose,
  handleOperandSourceMenuClick,
  handleOperationBlockContextMenu,
  handleOperationBlockMenuClick,
  handleOperationChoiceMenuClick,
  handleOperationVariableMenuClick,
  handleOperationValueSubmit,
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

  it("creates an Add block from the component-owned operation menu", () => {
    const createAddOperation = vi.fn();
    const hideOperationChoiceMenu = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();
    const operationChoiceMenu = { open: true };

    handleOperationChoiceMenuClick(
      {
        props: {},
        refs: { computedForm: { setValues }, operationChoiceMenu },
        store: {
          createAddOperation,
          hideOperationChoiceMenu,
          selectOperationChoiceMenuParentPath: () => undefined,
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
            item: { value: "add" },
          },
        },
      },
    );

    expect(hideOperationChoiceMenu).toHaveBeenCalledOnce();
    expect(operationChoiceMenu.open).toBe(false);
    expect(createAddOperation).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(setValues).toHaveBeenCalledWith({
      values: {
        valueSource: "computed",
        variableType: "number",
      },
    });
  });

  it("creates a nested Add operand from the operation menu", () => {
    const addOperationOperand = vi.fn();
    const hideOperationChoiceMenu = vi.fn();
    const setValues = vi.fn();
    const render = vi.fn();
    const values = {
      valueSource: "computed",
      variableType: "number",
      computed: undefined,
    };
    const operationChoiceMenu = { open: true };

    handleOperationChoiceMenuClick(
      {
        refs: { computedForm: { setValues }, operationChoiceMenu },
        store: {
          addOperationOperand,
          hideOperationChoiceMenu,
          selectOperationChoiceMenuParentPath: () => [1],
          selectDefaultValues: () => values,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "add" },
          },
        },
      },
    );

    expect(addOperationOperand).toHaveBeenCalledWith({
      source: "operation",
      operationType: "add",
      operationPath: [1],
    });
    expect(operationChoiceMenu.open).toBe(false);
    expect(setValues).toHaveBeenCalledWith({ values });
    expect(render).toHaveBeenCalledOnce();
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
          selectOperationBlockMenuPath: () => [1],
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

  it("opens the variable menu from the component-owned operand menu", () => {
    const addOperationOperand = vi.fn();
    const hideOperandSourceMenu = vi.fn();
    const showOperationVariableMenu = vi.fn();
    const render = vi.fn();
    const { menu: operandSourceMenu } = createDropdownMenuRef();

    handleOperandSourceMenuClick(
      {
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
                  id: "title",
                  name: "Title",
                  type: "variable",
                  variableType: "string",
                },
              ],
            },
          ],
        },
        refs: { operandSourceMenu },
        store: {
          addOperationOperand,
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [1],
          }),
          selectSubmitContext: () => ({ editingItemId: undefined }),
          showOperationVariableMenu,
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

    expect(hideOperandSourceMenu).toHaveBeenCalledOnce();
    expect(operandSourceMenu.open).toBe(false);
    expect(addOperationOperand).not.toHaveBeenCalled();
    expect(showOperationVariableMenu).toHaveBeenCalledWith({
      x: 30,
      y: 40,
      operationPath: [1],
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the operation menu from the operand menu", () => {
    const hideOperandSourceMenu = vi.fn();
    const showOperationChoiceMenu = vi.fn();
    const render = vi.fn();
    const { menu: operandSourceMenu } = createDropdownMenuRef();

    handleOperandSourceMenuClick(
      {
        props: {},
        refs: { operandSourceMenu },
        store: {
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [1],
          }),
          showOperationChoiceMenu,
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "operation" },
          },
        },
      },
    );

    expect(hideOperandSourceMenu).toHaveBeenCalledOnce();
    expect(operandSourceMenu.open).toBe(false);
    expect(showOperationChoiceMenu).toHaveBeenCalledWith({
      x: 30,
      y: 40,
      parentOperationPath: [1],
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the filtered variable menu without selecting self", () => {
    const addOperationOperand = vi.fn();
    const showOperationVariableMenu = vi.fn();

    handleOperandSourceMenuClick(
      {
        appService: { showToast: vi.fn() },
        i18n: { resourcePages: {}, variablesPage: {} },
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
        refs: { operandSourceMenu: createDropdownMenuRef().menu },
        store: {
          addOperationOperand,
          hideOperandSourceMenu: vi.fn(),
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [],
          }),
          selectSubmitContext: () => ({
            dialogMode: "edit",
            editingItemId: undefined,
          }),
          showOperationVariableMenu,
        },
        render: vi.fn(),
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
    expect(showOperationVariableMenu).toHaveBeenCalledWith({
      x: 30,
      y: 40,
      operationPath: [],
    });
  });

  it("adds the selected variable as a read-only operand", () => {
    const addOperationOperand = vi.fn();
    const hideOperationVariableMenu = vi.fn();
    const render = vi.fn();
    const operationVariableMenu = { open: true };

    handleOperationVariableMenuClick(
      {
        refs: { operationVariableMenu },
        store: {
          addOperationOperand,
          hideOperationVariableMenu,
          selectOperationVariableMenuPath: () => [1],
        },
        render,
      },
      {
        _event: {
          detail: {
            item: { value: "variables.score" },
          },
        },
      },
    );

    expect(hideOperationVariableMenu).toHaveBeenCalledOnce();
    expect(operationVariableMenu.open).toBe(false);
    expect(addOperationOperand).toHaveBeenCalledWith({
      source: "variable",
      variablePath: "variables.score",
      operationPath: [1],
    });
    expect(render).toHaveBeenCalledOnce();
  });

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
        props: { flatGroups: [] },
        refs: { operandSourceMenu },
        store: {
          addOperationOperand,
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [1],
          }),
          selectSubmitContext: () => ({ editingItemId: undefined }),
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

  it("submits a numeric Value operand from the popover form", () => {
    const addOperationOperand = vi.fn();
    const hideOperationValuePopover = vi.fn();
    const render = vi.fn();
    const store = {
      addOperationOperand,
      hideOperationValuePopover,
      selectOperationValuePopoverPath: () => [1],
    };

    handleOperationValueSubmit(
      { store, render },
      {
        _event: {
          detail: { value: 3.5 },
        },
      },
    );

    expect(addOperationOperand).toHaveBeenCalledWith({
      source: "value",
      value: 3.5,
      operationPath: [1],
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

  it("shows feedback when no number variable can be added", () => {
    const addOperationOperand = vi.fn();
    const hideOperandSourceMenu = vi.fn();
    const showToast = vi.fn();
    const render = vi.fn();
    const { menu: operandSourceMenu } = createDropdownMenuRef();

    handleOperandSourceMenuClick(
      {
        appService: { showToast },
        i18n: { resourcePages: {}, variablesPage: {} },
        props: { flatGroups: [] },
        refs: { operandSourceMenu },
        store: {
          addOperationOperand,
          hideOperandSourceMenu,
          selectOperandSourceMenuPosition: () => ({
            x: 30,
            y: 40,
            operationPath: [],
          }),
          selectSubmitContext: () => ({ editingItemId: undefined }),
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
      message: "Create a number variable before adding a Variable operand.",
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

  it("submits the stored operation when form values omit the slot data", () => {
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
        props: { flatGroups: [] },
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
    expect(closeDialog).toHaveBeenCalledOnce();
  });
});
