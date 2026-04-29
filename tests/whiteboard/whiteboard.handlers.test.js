import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  handleContainerWheel,
  handleWindowMouseMove,
  handleWindowMouseUp,
} from "../../src/components/whiteboard/whiteboard.handlers.js";

const OriginalHTMLElement = globalThis.HTMLElement;
const OriginalCustomEvent = globalThis.CustomEvent;

const createMinimapItemRefs = () => [
  {
    style: {},
    firstElementChild: {
      style: {},
    },
  },
  {
    style: {},
    firstElementChild: {
      style: {},
    },
  },
];

const createDeps = ({
  isDraggingMinimapViewport = true,
  pan = { x: -120, y: -80 },
} = {}) => {
  const minimapItemRefs = createMinimapItemRefs();

  const store = {
    selectContainerSize: vi.fn(() => ({ width: 100, height: 80 })),
    selectIsDraggingMinimapViewport: vi.fn(() => isDraggingMinimapViewport),
    selectIsPanMode: vi.fn(() => false),
    selectIsPanning: vi.fn(() => false),
    selectPan: vi.fn(() => pan),
    selectZoomLevel: vi.fn(() => 1.5),
    selectMinimapData: vi.fn(() => ({
      items: [
        { id: "scene-1", x: 12, y: 10 },
        { id: "scene-2", x: 42, y: 34 },
      ],
      scaledItem: { width: 18, height: 9 },
      viewport: {
        visible: true,
        x: 24,
        y: 16,
        width: 60,
        height: 40,
      },
    })),
    updatePanFromMinimapViewportDragging: vi.fn(),
    stopMinimapViewportDragging: vi.fn(),
    zoomAt: vi.fn(),
  };
  const refs = {
    container: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 80,
      }),
      style: {},
    },
    canvas: {
      style: {},
    },
    minimapContainer: {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        width: 200,
        height: 150,
      }),
      querySelectorAll: vi.fn(() => minimapItemRefs),
      style: {},
    },
    minimapViewport: {
      style: {},
    },
  };

  return {
    store,
    refs,
    props: {},
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    minimapItemRefs,
  };
};

describe("whiteboard minimap drag handlers", () => {
  beforeAll(() => {
    if (typeof globalThis.HTMLElement === "undefined") {
      globalThis.HTMLElement = class {};
    }

    if (typeof globalThis.CustomEvent === "undefined") {
      globalThis.CustomEvent = class CustomEvent extends Event {
        constructor(type, init = {}) {
          super(type, init);
          this.detail = init.detail;
        }
      };
    }
  });

  afterAll(() => {
    if (OriginalHTMLElement === undefined) {
      delete globalThis.HTMLElement;
    } else {
      globalThis.HTMLElement = OriginalHTMLElement;
    }

    if (OriginalCustomEvent === undefined) {
      delete globalThis.CustomEvent;
    } else {
      globalThis.CustomEvent = OriginalCustomEvent;
    }
  });

  it("does not dispatch pan persistence while minimap drag is moving", () => {
    const deps = createDeps();

    handleWindowMouseMove(deps, {
      _event: {
        clientX: 150,
        clientY: 230,
      },
    });

    expect(
      deps.store.updatePanFromMinimapViewportDragging,
    ).toHaveBeenCalledWith({
      mouseX: 50,
      mouseY: 30,
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.refs.container.style.backgroundPosition).toBe("-120px -80px");
    expect(deps.refs.canvas.style.transform).toBe(
      "translate(-120px, -80px) scale(1.5)",
    );
    expect(deps.minimapItemRefs[0].style.left).toBe("12px");
    expect(deps.minimapItemRefs[0].style.top).toBe("10px");
    expect(deps.minimapItemRefs[0].firstElementChild.style.width).toBe("18px");
    expect(deps.minimapItemRefs[0].firstElementChild.style.height).toBe("9px");
  });

  it("dispatches one pan-changed event when minimap drag ends", () => {
    const deps = createDeps();

    handleWindowMouseUp(deps);

    expect(deps.store.stopMinimapViewportDragging).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);

    const dispatchedEvent = deps.dispatchEvent.mock.calls[0][0];
    expect(dispatchedEvent.type).toBe("pan-changed");
    expect(dispatchedEvent.detail).toEqual({
      panX: -120,
      panY: -80,
    });
  });

  it("ignores wheel zoom while minimap viewport drag is active", () => {
    const deps = createDeps();
    const event = {
      deltaY: -120,
      preventDefault: vi.fn(),
    };

    handleContainerWheel(deps, {
      _event: event,
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.store.zoomAt).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });
});
