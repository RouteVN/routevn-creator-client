import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleResizeStart,
} from "../../src/components/resizablePanel/resizablePanel.handlers.js";

const originalDocument = globalThis.document;

describe("resizablePanel.handlers", () => {
  beforeEach(() => {
    const listeners = new Map();

    globalThis.document = {
      addEventListener: vi.fn((eventName, listener) => {
        listeners.set(eventName, listener);
      }),
      removeEventListener: vi.fn((eventName) => {
        listeners.delete(eventName);
      }),
    };

    globalThis.__resizablePanelListeners = listeners;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    delete globalThis.__resizablePanelListeners;
  });

  it("loads stored panel widths as numeric userConfig values", () => {
    const store = {
      initializePanelWidth: vi.fn(),
    };

    handleBeforeMount({
      store,
      props: {
        panelType: "file-explorer",
        w: "280",
        minW: "200",
        maxW: "600",
      },
      appService: {
        getUserConfig: vi.fn(() => 360),
      },
    });

    expect(store.initializePanelWidth).toHaveBeenCalledWith({
      width: 360,
      minWidth: 200,
      maxWidth: 600,
    });
  });

  it("persists resized panel widths as numbers", () => {
    const store = {
      selectPanelWidth: vi.fn(() => 340),
      startResize: vi.fn(),
      setIsResizing: vi.fn(),
    };
    const appService = {
      setUserConfig: vi.fn(),
    };

    handleResizeStart(
      {
        store,
        render: vi.fn(),
        props: {
          panelType: "detail-panel",
          resizeSide: "right",
        },
        appService,
        subject: {
          dispatch: vi.fn(),
        },
      },
      {
        _event: {
          preventDefault: vi.fn(),
          clientX: 100,
        },
      },
    );

    const mouseUpListener = globalThis.__resizablePanelListeners.get("mouseup");
    mouseUpListener({});

    expect(appService.setUserConfig).toHaveBeenCalledWith(
      "resizablePanel.detailPanelWidth",
      340,
    );
  });
});
