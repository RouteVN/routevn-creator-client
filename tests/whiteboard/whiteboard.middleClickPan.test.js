import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as handlers from "../../src/components/whiteboard/whiteboard.handlers.js";
import * as storeModule from "../../src/components/whiteboard/whiteboard.store.js";

const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;

const createDeps = () => {
  const state = storeModule.createInitialState();
  const context = { state, props: { items: [] } };
  const store = Object.fromEntries(
    Object.entries(storeModule).map(([name, method]) => [
      name,
      (...args) => method(context, ...args),
    ]),
  );
  const container = {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    }),
    style: {},
  };
  store.setContainerSize({ width: 800, height: 600 });
  store.setInitialZoomAndPan({ zoomLevel: 1, panX: -100, panY: -50 });
  return {
    store,
    refs: {
      container,
      // The canvas is translated by the pan, as in the browser.
      canvas: {
        style: {},
        getBoundingClientRect: () => {
          const pan = store.selectPan();
          return { left: pan.x, top: pan.y, width: 800, height: 600 };
        },
      },
      itemRef0: {
        dataset: { itemId: "scene-1" },
        style: { left: "300px", top: "200px" },
      },
    },
    props: context.props,
    render: vi.fn(),
    dispatchEvent: vi.fn(),
  };
};

const createMouseEvent = ({ button, clientX, clientY }) => {
  const event = {
    button,
    clientX,
    clientY,
    ctrlKey: false,
    propagationStopped: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(() => {
      event.propagationStopped = true;
    }),
  };
  return event;
};

// Presses a mouse button on empty space in the scene map.
const pressOnMap = (deps, { button, clientX, clientY }) => {
  const event = createMouseEvent({ button, clientX, clientY });
  handlers.handleContainerMouseDown(deps, { _event: event });
  return event;
};

// Presses a mouse button on a scene box. The press bubbles from the box to
// the scene map unless the box's handler stops it.
const pressOnSceneBox = (deps, { itemId, button, clientX, clientY }) => {
  const event = createMouseEvent({ button, clientX, clientY });
  event.currentTarget = { dataset: { itemId } };
  handlers.handleItemMouseDown(deps, { _event: event });
  if (!event.propagationStopped) {
    handlers.handleContainerMouseDown(deps, { _event: event });
  }
  return event;
};

// Presses a mouse button on the minimap's viewport rectangle. The press
// bubbles to the scene map unless the rectangle's handler stops it.
const pressOnMinimapViewport = (deps, { button, clientX, clientY }) => {
  const event = createMouseEvent({ button, clientX, clientY });
  handlers.handleMinimapViewportMouseDown(deps, { _event: event });
  if (!event.propagationStopped) {
    handlers.handleContainerMouseDown(deps, { _event: event });
  }
  return event;
};

const dispatchedEvents = (deps, type) =>
  deps.dispatchEvent.mock.calls
    .map(([event]) => event)
    .filter((event) => event.type === type);

// Which buttons are held, as the browser's MouseEvent.buttons reports them.
const HELD_BUTTONS = {
  none: 0,
  left: 1,
  middle: 4,
  leftAndMiddle: 5,
};

const moveMouse = (
  deps,
  { clientX, clientY, buttons = HELD_BUTTONS.middle },
) => {
  const event = createMouseEvent({ button: LEFT_BUTTON, clientX, clientY });
  event.buttons = buttons;
  handlers.handleWindowMouseMove(deps, { _event: event });
};

const releaseMouse = (deps, { button = MIDDLE_BUTTON } = {}) => {
  const event = createMouseEvent({ button, clientX: 0, clientY: 0 });
  handlers.handleWindowMouseUp(deps, { _event: event });
  return event;
};

describe("scene map middle-click pan", () => {
  // The cursor sync checks scene boxes' children against HTMLElement.
  beforeAll(() => {
    vi.stubGlobal("HTMLElement", class {});
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("pans the map by how far a middle-button drag on empty space moves", () => {
    const deps = createDeps();

    pressOnMap(deps, { button: MIDDLE_BUTTON, clientX: 300, clientY: 200 });
    moveMouse(deps, { clientX: 340, clientY: 170 });
    releaseMouse(deps);

    expect(deps.store.selectPan()).toEqual({ x: -60, y: -80 });
  });

  it("pans instead of selecting or dragging a scene box the drag starts on", () => {
    const deps = createDeps();

    pressOnSceneBox(deps, {
      itemId: "scene-1",
      button: MIDDLE_BUTTON,
      clientX: 300,
      clientY: 200,
    });
    moveMouse(deps, { clientX: 340, clientY: 170 });
    releaseMouse(deps);

    expect(deps.store.selectPan()).toEqual({ x: -60, y: -80 });
    expect(dispatchedEvents(deps, "item-selected")).toHaveLength(0);
    expect(dispatchedEvents(deps, "item-position-updating")).toHaveLength(0);
    expect(dispatchedEvents(deps, "item-position-changed")).toHaveLength(0);
    expect(deps.store.selectIsDragging()).toBe(false);
  });

  it("pans the map instead of dragging the minimap viewport the drag starts on", () => {
    const deps = createDeps();

    pressOnMinimapViewport(deps, {
      button: MIDDLE_BUTTON,
      clientX: 700,
      clientY: 500,
    });
    moveMouse(deps, { clientX: 740, clientY: 470 });
    releaseMouse(deps);

    expect(deps.store.selectIsDraggingMinimapViewport()).toBe(false);
    expect(deps.store.selectPan()).toEqual({ x: -60, y: -80 });
  });

  it("keeps the browser's own middle-click action, such as autoscroll, from starting", () => {
    const deps = createDeps();

    const press = pressOnMap(deps, {
      button: MIDDLE_BUTTON,
      clientX: 300,
      clientY: 200,
    });

    expect(press.preventDefault).toHaveBeenCalledOnce();
  });

  it("shows the grabbing cursor only while the middle button is held", () => {
    const deps = createDeps();

    pressOnMap(deps, { button: MIDDLE_BUTTON, clientX: 300, clientY: 200 });
    expect(deps.refs.container.style.cursor).toBe("grabbing");

    releaseMouse(deps);
    expect(deps.refs.container.style.cursor).toBe("default");
  });

  it("reports where the map was panned to, including past the map's edge", () => {
    const deps = createDeps();

    pressOnMap(deps, { button: MIDDLE_BUTTON, clientX: 300, clientY: 200 });
    moveMouse(deps, { clientX: 900, clientY: -20 });
    releaseMouse(deps);

    expect(dispatchedEvents(deps, "pan-changed").at(-1).detail).toEqual({
      panX: 500,
      panY: -270,
    });
  });

  it("keeps the browser's own middle-click paste from the release that ends the pan", () => {
    const deps = createDeps();

    pressOnMap(deps, { button: MIDDLE_BUTTON, clientX: 300, clientY: 200 });
    const release = releaseMouse(deps);

    expect(release.preventDefault).toHaveBeenCalledOnce();
  });

  it("keeps panning through a left click on a scene box and ends on the middle button's release", () => {
    const deps = createDeps();

    pressOnMap(deps, { button: MIDDLE_BUTTON, clientX: 300, clientY: 200 });
    pressOnSceneBox(deps, {
      itemId: "scene-1",
      button: LEFT_BUTTON,
      clientX: 320,
      clientY: 190,
    });
    releaseMouse(deps, { button: LEFT_BUTTON });
    moveMouse(deps, { clientX: 340, clientY: 170 });

    expect(deps.store.selectPan()).toEqual({ x: -60, y: -80 });
    expect(dispatchedEvents(deps, "item-selected")).toHaveLength(0);
    expect(deps.store.selectIsDragging()).toBe(false);

    releaseMouse(deps);
    moveMouse(deps, { clientX: 400, clientY: 100 });

    expect(deps.store.selectPan()).toEqual({ x: -60, y: -80 });
  });

  it("leaves a scene box drag alone when the middle button is pressed and released during it", () => {
    const deps = createDeps();
    pressOnSceneBox(deps, {
      itemId: "scene-1",
      button: LEFT_BUTTON,
      clientX: 300,
      clientY: 200,
    });
    moveMouse(deps, {
      clientX: 320,
      clientY: 200,
      buttons: HELD_BUTTONS.left,
    });
    expect(deps.store.selectIsDragging()).toBe(true);

    pressOnSceneBox(deps, {
      itemId: "scene-1",
      button: MIDDLE_BUTTON,
      clientX: 320,
      clientY: 200,
    });
    moveMouse(deps, {
      clientX: 340,
      clientY: 200,
      buttons: HELD_BUTTONS.leftAndMiddle,
    });
    releaseMouse(deps);

    expect(deps.store.selectPan()).toEqual({ x: -100, y: -50 });
    expect(deps.store.selectIsDragging()).toBe(true);
    expect(
      dispatchedEvents(deps, "item-position-updating").at(-1).detail,
    ).toEqual({ itemId: "scene-1", x: 340, y: 200 });

    releaseMouse(deps, { button: LEFT_BUTTON });
    expect(deps.store.selectIsDragging()).toBe(false);
  });

  it("ends a pan whose release the page missed on the next move without the middle button held", () => {
    const deps = createDeps();

    pressOnMap(deps, { button: MIDDLE_BUTTON, clientX: 300, clientY: 200 });
    moveMouse(deps, { clientX: 340, clientY: 170 });
    moveMouse(deps, {
      clientX: 400,
      clientY: 100,
      buttons: HELD_BUTTONS.none,
    });

    expect(deps.store.selectIsPanning()).toBe(false);
    expect(deps.store.selectPan()).toEqual({ x: -60, y: -80 });
    expect(deps.refs.container.style.cursor).toBe("default");
  });
});
