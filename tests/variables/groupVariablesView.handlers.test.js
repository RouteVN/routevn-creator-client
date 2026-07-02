import { describe, expect, it, vi } from "vitest";
import {
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

describe("groupVariablesView.handlers", () => {
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
});
