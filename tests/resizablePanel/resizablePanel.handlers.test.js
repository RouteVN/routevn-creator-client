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
      setUiConfig: vi.fn(),
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

  it("prefers CSS length panel defaults over stored shared widths", () => {
    const store = {
      initializePanelWidth: vi.fn(),
      setUiConfig: vi.fn(),
    };

    handleBeforeMount({
      store,
      props: {
        panelType: "detail-panel",
        w: "50%",
        minW: "360",
        maxW: "50%",
      },
      appService: {
        getUserConfig: vi.fn(() => 300),
      },
    });

    expect(store.initializePanelWidth).toHaveBeenCalledWith({
      width: "50%",
      minWidth: 360,
      maxWidth: undefined,
    });
  });

  it("starts resizing CSS length panels from the rendered width", () => {
    const store = {
      selectPanelWidth: vi.fn(() => "50%"),
      startResize: vi.fn(),
      setIsResizing: vi.fn(),
    };

    handleResizeStart(
      {
        store,
        render: vi.fn(),
        props: {
          panelType: "detail-panel",
          resizeSide: "left",
        },
        appService: {
          setUserConfig: vi.fn(),
        },
        subject: {
          dispatch: vi.fn(),
        },
      },
      {
        _event: {
          preventDefault: vi.fn(),
          clientX: 100,
          currentTarget: {
            parentElement: {
              getBoundingClientRect: vi.fn(() => ({ width: 640 })),
            },
          },
        },
      },
    );

    expect(store.startResize).toHaveBeenCalledWith({
      startX: 100,
      startWidth: 640,
    });
  });

  it("resolves percentage resize constraints against the panel parent", () => {
    const store = {
      selectPanelWidth: vi.fn(() => 500),
      selectIsResizing: vi.fn(() => true),
      selectStartX: vi.fn(() => 100),
      selectStartWidth: vi.fn(() => 500),
      startResize: vi.fn(),
      setPanelWidth: vi.fn(),
      setIsResizing: vi.fn(),
    };
    const parentElement = {
      getBoundingClientRect: vi.fn(() => ({ width: 1000 })),
    };
    const panelElement = {
      parentElement,
      getBoundingClientRect: vi.fn(() => ({ width: 500 })),
    };

    handleResizeStart(
      {
        store,
        render: vi.fn(),
        props: {
          panelType: "detail-panel",
          minW: "25%",
          maxW: "50%",
          resizeSide: "right",
        },
        appService: {
          setUserConfig: vi.fn(),
        },
        subject: {
          dispatch: vi.fn(),
        },
      },
      {
        _event: {
          preventDefault: vi.fn(),
          clientX: 100,
          currentTarget: {
            parentElement: panelElement,
          },
        },
      },
    );

    const mouseMoveListener =
      globalThis.__resizablePanelListeners.get("mousemove");
    mouseMoveListener({ clientX: 900 });

    expect(store.setPanelWidth).toHaveBeenCalledWith({
      width: 1300,
      minWidth: 250,
      maxWidth: 500,
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
