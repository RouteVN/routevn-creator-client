import { describe, expect, it } from "vitest";
import {
  createInitialState,
  closeDialog,
  openAddDialog,
  openEditDialog,
  selectViewData,
} from "../../src/components/groupVariablesView/groupVariablesView.store.js";

describe("groupVariablesView.store", () => {
  it("uses the variable id as the edit form key", () => {
    const state = createInitialState();

    openEditDialog(
      { state },
      {
        groupId: "group-1",
        itemId: "variable-1",
        defaultValues: {
          name: "Label with spaces",
          variableType: "string",
          isEnum: true,
          enumValues: ["enum value (one)"],
          default: "()9f 0e faw faw fe awfaw efawe fawef awef",
        },
      },
    );

    const viewData = selectViewData({ state, props: {} });

    expect(viewData.dialogKey).toBe("variable-1");
    expect(viewData.dialogKey).not.toContain("()9f");
    expect(viewData.dialogKey).not.toContain("enum value");
    expect(viewData.dialogKey).not.toContain("Label with spaces");
  });

  it("uses the target group id as the add form key", () => {
    const state = createInitialState();

    openAddDialog({ state }, { groupId: "group-1" });
    const firstKey = selectViewData({ state, props: {} }).dialogKey;

    closeDialog({ state });
    const closedKey = selectViewData({ state, props: {} }).dialogKey;

    openAddDialog({ state }, { groupId: "group-1" });
    const secondKey = selectViewData({ state, props: {} }).dialogKey;

    expect(firstKey).toBe("group-1");
    expect(closedKey).toBe("new");
    expect(secondKey).toBe("group-1");
  });
});
