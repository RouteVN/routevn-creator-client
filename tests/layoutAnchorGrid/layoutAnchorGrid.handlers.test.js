import { describe, expect, it, vi } from "vitest";
import {
  handleAnchorCellClick,
  handleAnchorCellKeyDown,
} from "../../src/components/layout-anchor-grid/layout-anchor-grid.handlers.js";

const OPTIONS = [
  { label: "Top Left", value: { x: 0, y: 0 } },
  { label: "Top Center", value: { x: 0.5, y: 0 } },
  { label: "Top Right", value: { x: 1, y: 0 } },
  { label: "Center Left", value: { x: 0, y: 0.5 } },
  { label: "Center", value: { x: 0.5, y: 0.5 } },
  { label: "Center Right", value: { x: 1, y: 0.5 } },
  { label: "Bottom Left", value: { x: 0, y: 1 } },
  { label: "Bottom Center", value: { x: 0.5, y: 1 } },
  { label: "Bottom Right", value: { x: 1, y: 1 } },
];

const createDeps = () => {
  const focusedCell = {
    focus: vi.fn(),
  };
  return {
    deps: {
      dispatchEvent: vi.fn(),
      props: {
        options: OPTIONS,
      },
      refs: {
        anchorGrid: {
          querySelector: vi.fn(() => focusedCell),
        },
      },
    },
    focusedCell,
  };
};

describe("layoutAnchorGrid handlers", () => {
  it("emits the selected option when a cell is clicked", () => {
    const { deps } = createDeps();

    handleAnchorCellClick(deps, {
      _event: {
        currentTarget: {
          dataset: { anchorIndex: "8" },
          getAttribute: vi.fn(() => "false"),
        },
      },
    });

    const event = deps.dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe("value-change");
    expect(event.detail).toEqual({
      item: OPTIONS[8],
      value: { x: 1, y: 1 },
    });
  });

  it("moves and selects by row with arrow keys", () => {
    const { deps, focusedCell } = createDeps();
    const preventDefault = vi.fn();

    handleAnchorCellKeyDown(deps, {
      _event: {
        currentTarget: {
          dataset: { anchorIndex: "1" },
        },
        key: "ArrowDown",
        preventDefault,
      },
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(deps.refs.anchorGrid.querySelector).toHaveBeenCalledWith(
      '[data-anchor-index="4"]',
    );
    expect(focusedCell.focus).toHaveBeenCalled();
    expect(deps.dispatchEvent.mock.calls[0][0].detail.value).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("does not emit when the selected cell is clicked again", () => {
    const { deps } = createDeps();

    handleAnchorCellClick(deps, {
      _event: {
        currentTarget: {
          dataset: { anchorIndex: "4" },
          getAttribute: vi.fn(() => "true"),
        },
      },
    });

    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });
});
