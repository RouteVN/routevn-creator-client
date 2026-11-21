import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  hideDropdownMenu,
  selectActionsData,
  selectDropdownMenuActionType,
  setRepositoryState,
  showDropdownMenu,
} from "../../src/components/systemActions/systemActions.store.js";
import {
  handleActionItemRightClick,
  handleDropdownMenuClickItem,
  handleDropdownMenuClose,
} from "../../src/components/systemActions/systemActions.handlers.js";
import { getRuntimeActionModes } from "../../src/internal/runtimeActions.js";
import { EN_I18N } from "../support/i18n.js";

const systemActionsView = readFileSync(
  new URL(
    "../../src/components/systemActions/systemActions.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

// Every action row of the presentation state list, with the `preview` key
// that shows it. The preview key is the key the action is stored under.
const readActionRows = () => {
  const lines = systemActionsView.split("\n");
  const indentOf = (line) => line.length - line.trimStart().length;
  const rows = [];

  lines.forEach((line, index) => {
    const row = line.match(/rtgl-view#(actionItem[\w${}]+) data-mode=(\S+)/);
    if (!row) {
      return;
    }

    const [, id, mode] = row;
    let actionType;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (indentOf(lines[i]) >= indentOf(line)) {
        continue;
      }
      actionType = lines[i].match(/\$if preview\.(\w+)/)?.[1];
      break;
    }
    rows.push({ id, mode, actionType });
  });

  return rows;
};

const actionRows = readActionRows();
const staticActionRows = actionRows.filter((row) => !row.mode.includes("${"));

const createDeps = () => {
  const state = createInitialState();
  const dispatchedEvents = [];
  const render = vi.fn();

  return {
    state,
    dispatchedEvents,
    render,
    deps: {
      store: {
        showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
        hideDropdownMenu: () => hideDropdownMenu({ state }),
        selectDropdownMenuActionType: () =>
          selectDropdownMenuActionType({ state }),
      },
      render,
      dispatchEvent: (event) => dispatchedEvents.push(event),
    },
  };
};

const rightClickRow = (deps, mode) => {
  const preventDefault = vi.fn();
  handleActionItemRightClick(deps, {
    _event: {
      preventDefault,
      clientX: 12,
      clientY: 34,
      currentTarget: { dataset: { mode } },
    },
  });
  return { preventDefault };
};

const deleteItem = {
  label: "Delete",
  icon: "trash",
  type: "item",
  value: "delete",
};

// Right-click the row, then pick Delete in the menu that opens.
const deleteRow = (mode, detail = { item: deleteItem }) => {
  const context = createDeps();
  rightClickRow(context.deps, mode);
  handleDropdownMenuClickItem(context.deps, { _event: { detail } });
  return context;
};

describe("systemActions action row delete", () => {
  it("opens the menu at the pointer for the clicked row", () => {
    const { deps, state, render, dispatchedEvents } = createDeps();

    const { preventDefault } = rightClickRow(deps, "input");

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(state.dropdownMenu.isOpen).toBe(true);
    expect(state.dropdownMenu.position).toEqual({ x: 12, y: 34 });
    expect(selectDropdownMenuActionType({ state })).toBe("input");
    expect(dispatchedEvents).toEqual([]);
    expect(render).toHaveBeenCalledOnce();
  });

  it("offers Delete in the row menu", () => {
    const state = createInitialState();

    expect(state.dropdownMenu.items).toEqual([deleteItem]);
  });

  it("deletes the Input row by the key the action is stored under", () => {
    const { state, dispatchedEvents, render } = deleteRow("input");

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("action-delete");
    expect(dispatchedEvents[0].detail).toEqual({ actionType: "form" });
    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("deletes the Input row when the menu sends the item as the detail", () => {
    const { dispatchedEvents } = deleteRow("input", deleteItem);

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].detail).toEqual({ actionType: "form" });
  });

  it("shows the Input row for a stored form action", () => {
    const state = createInitialState();
    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: {
            items: {
              "layout-input": {
                id: "layout-input",
                type: "layout",
                name: "Name Input",
                layoutType: "input",
              },
            },
            tree: [{ id: "layout-input" }],
          },
        },
      },
    );

    const { preview, actions } = selectActionsData({
      props: {
        actions: { form: { resourceId: "layout-input", fields: {} } },
      },
      state,
      copy: EN_I18N.commandLinePage,
      dateTime: EN_I18N.dateTime,
    });

    expect(actions.form).toEqual({ resourceId: "layout-input", fields: {} });
    expect(actions.input).toBeUndefined();
    expect(preview.form.layoutName).toBe("Name Input");
    expect(preview.input).toBeUndefined();
  });

  it("finds every action row in the view", () => {
    expect(staticActionRows.length).toBeGreaterThanOrEqual(29);
    expect(actionRows.map((row) => row.id)).toContain("actionItemInput");
    expect(
      actionRows.find((row) => row.id === "actionItemInput"),
    ).toMatchObject({ mode: "input", actionType: "form" });
    staticActionRows.forEach((row) => {
      expect(row.actionType, `${row.id} has no preview condition`).toEqual(
        expect.any(String),
      );
    });
  });

  it.each(staticActionRows)(
    "deletes the $id row as $actionType",
    ({ mode, actionType }) => {
      const { state, dispatchedEvents } = deleteRow(mode);

      expect(dispatchedEvents).toHaveLength(1);
      expect(dispatchedEvents[0].type).toBe("action-delete");
      expect(dispatchedEvents[0].detail).toEqual({ actionType });
      expect(state.dropdownMenu.isOpen).toBe(false);
    },
  );

  it("deletes a runtime action row by its mode", () => {
    const runtimeRows = actionRows.filter((row) => row.mode.includes("${"));
    expect(runtimeRows.map((row) => row.mode)).toEqual([
      "${runtimeAction.mode}",
    ]);

    const runtimeModes = getRuntimeActionModes();
    expect(runtimeModes.length).toBeGreaterThan(0);
    runtimeModes.forEach((mode) => {
      const { dispatchedEvents } = deleteRow(mode);

      expect(dispatchedEvents).toHaveLength(1);
      expect(dispatchedEvents[0].detail).toEqual({ actionType: mode });
    });
  });

  it("deletes nothing when another menu item is picked", () => {
    const { state, dispatchedEvents } = deleteRow("input", {
      item: { label: "Other", type: "item", value: "other" },
    });

    expect(dispatchedEvents).toEqual([]);
    expect(state.dropdownMenu.isOpen).toBe(false);
  });

  it("deletes nothing when the menu is closed without a choice", () => {
    const { deps, state, dispatchedEvents } = createDeps();
    rightClickRow(deps, "input");

    handleDropdownMenuClose(deps);
    handleDropdownMenuClickItem(deps, {
      _event: { detail: { item: deleteItem } },
    });

    expect(dispatchedEvents).toEqual([]);
    expect(state.dropdownMenu.isOpen).toBe(false);
  });

  it("deletes each row once when rows are deleted one after another", () => {
    const { deps, dispatchedEvents } = createDeps();

    ["input", "choice", "input"].forEach((mode) => {
      rightClickRow(deps, mode);
      handleDropdownMenuClickItem(deps, {
        _event: { detail: { item: deleteItem } },
      });
    });

    expect(dispatchedEvents.map((event) => event.detail.actionType)).toEqual([
      "form",
      "choice",
      "form",
    ]);
  });
});
