import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileExplorerKeyboardScopeHandlers } from "../../src/internal/ui/fileExplorerKeyboardScope.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const createKeyEvent = (key, overrides = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...overrides,
});

const createDeps = ({
  fileExplorer = {},
  keyboardScopeRefName = "fileExplorerKeyboardScope",
} = {}) => {
  return {
    refs: {
      fileExplorer,
      [keyboardScopeRefName]: {
        focus: vi.fn(),
      },
    },
  };
};

describe("fileExplorerKeyboardScope", () => {
  beforeEach(() => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("focuses the keyboard scope after non-interactive clicks", () => {
    const { handleKeyboardScopeClick } =
      createFileExplorerKeyboardScopeHandlers();
    const deps = createDeps();

    handleKeyboardScopeClick(deps, {
      _event: {
        target: {
          tagName: "DIV",
        },
      },
    });

    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(1);
  });

  it("does not steal focus from interactive click targets", () => {
    const { handleKeyboardScopeClick } =
      createFileExplorerKeyboardScopeHandlers();
    const deps = createDeps();

    handleKeyboardScopeClick(deps, {
      _event: {
        target: {
          tagName: "BUTTON",
        },
      },
    });

    expect(deps.refs.fileExplorerKeyboardScope.focus).not.toHaveBeenCalled();
  });

  it("navigates explorer selection with up and down arrows", () => {
    const fileExplorer = {
      navigateSelection: vi.fn(() => ({
        itemId: "item-2",
      })),
    };
    const deps = createDeps({
      fileExplorer,
    });
    const { handleKeyboardScopeKeyDown } =
      createFileExplorerKeyboardScopeHandlers();
    const event = createKeyEvent("ArrowDown");

    handleKeyboardScopeKeyDown(deps, {
      _event: event,
    });

    expect(fileExplorer.navigateSelection).toHaveBeenCalledWith({
      direction: "next",
    });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(1);
  });

  it("expands and collapses the selected folder with right and left arrows", () => {
    const fileExplorer = {
      getSelectedItem: vi.fn(() => ({
        itemId: "folder-1",
        isFolder: true,
      })),
      setSelectedFolderExpanded: vi.fn(),
    };
    const deps = createDeps({
      fileExplorer,
    });
    const { handleKeyboardScopeKeyDown } =
      createFileExplorerKeyboardScopeHandlers();
    const rightEvent = createKeyEvent("ArrowRight");
    const leftEvent = createKeyEvent("ArrowLeft");

    handleKeyboardScopeKeyDown(deps, {
      _event: rightEvent,
    });
    handleKeyboardScopeKeyDown(deps, {
      _event: leftEvent,
    });

    expect(fileExplorer.setSelectedFolderExpanded).toHaveBeenNthCalledWith(1, {
      expanded: true,
    });
    expect(fileExplorer.setSelectedFolderExpanded).toHaveBeenNthCalledWith(2, {
      expanded: false,
    });
    expect(rightEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(leftEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(2);
  });

  it("selects the first visible explorer item when arrows are used with no selection", () => {
    const fileExplorer = {
      getSelectedItem: vi.fn(() => undefined),
      navigateSelection: vi.fn(() => ({
        itemId: "item-1",
      })),
      setSelectedFolderExpanded: vi.fn(),
    };
    const deps = createDeps({
      fileExplorer,
    });
    const { handleKeyboardScopeKeyDown } =
      createFileExplorerKeyboardScopeHandlers();
    const upEvent = createKeyEvent("ArrowUp");
    const rightEvent = createKeyEvent("ArrowRight");

    handleKeyboardScopeKeyDown(deps, {
      _event: upEvent,
    });
    handleKeyboardScopeKeyDown(deps, {
      _event: rightEvent,
    });

    expect(fileExplorer.navigateSelection).toHaveBeenNthCalledWith(1, {
      direction: "next",
    });
    expect(fileExplorer.navigateSelection).toHaveBeenNthCalledWith(2, {
      direction: "next",
    });
    expect(fileExplorer.setSelectedFolderExpanded).not.toHaveBeenCalled();
    expect(upEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(rightEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(2);
  });

  it("runs the enter handler for the selected explorer item", () => {
    const onEnterKey = vi.fn();
    const fileExplorer = {
      getSelectedItem: vi.fn(() => ({
        itemId: "item-1",
        isFolder: false,
      })),
    };
    const deps = createDeps({
      fileExplorer,
    });
    const { handleKeyboardScopeKeyDown } =
      createFileExplorerKeyboardScopeHandlers({
        onEnterKey,
      });
    const event = createKeyEvent("Enter");

    handleKeyboardScopeKeyDown(deps, {
      _event: event,
    });

    expect(onEnterKey).toHaveBeenCalledWith({
      deps,
      event,
      selectedItemId: "item-1",
      selectedExplorerItem: {
        itemId: "item-1",
        isFolder: false,
      },
    });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("ignores blocked or text-entry key events", () => {
    const fileExplorer = {
      navigateSelection: vi.fn(),
      setSelectedFolderExpanded: vi.fn(),
    };
    const deps = createDeps({
      fileExplorer,
    });
    const blockedHandlers = createFileExplorerKeyboardScopeHandlers({
      isNavigationBlocked: () => true,
    });
    const blockedEvent = createKeyEvent("ArrowDown");

    blockedHandlers.handleKeyboardScopeKeyDown(deps, {
      _event: blockedEvent,
    });

    expect(fileExplorer.navigateSelection).not.toHaveBeenCalled();

    const textEntryHandlers = createFileExplorerKeyboardScopeHandlers();
    const textEntryEvent = createKeyEvent("ArrowRight", {
      target: {
        tagName: "INPUT",
      },
    });

    textEntryHandlers.handleKeyboardScopeKeyDown(deps, {
      _event: textEntryEvent,
    });

    expect(fileExplorer.setSelectedFolderExpanded).not.toHaveBeenCalled();
  });
});
