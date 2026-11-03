// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "../../src/components/fileImage/fileImage.store.js";
import { handleAfterMount } from "../../src/components/fileImage/fileImage.handlers.js";

// A lazy image waits for an IntersectionObserver whose root is the nearest
// scroll container it is laid out in. jsdom has no layout, so the test gives
// scroll containers and the image their sizes and positions.

const observers = [];

class FakeIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    observers.push(this);
  }

  observe() {}

  disconnect() {}
}

const makeScrollable = (element) => {
  element.style.overflow = "auto";
  Object.defineProperty(element, "scrollHeight", { value: 2000 });
  Object.defineProperty(element, "clientHeight", { value: 400 });
};

// Below the viewport and any scroll container's margin, so the image waits.
const placeOffscreen = (element) => {
  element.getBoundingClientRect = () => ({
    top: 3000,
    bottom: 3120,
    left: 0,
    right: 200,
    width: 200,
    height: 120,
  });
};

const mountLazyImage = async (target) => {
  const context = {
    state: actions.createInitialState(),
    props: { fileId: "file-sprite", lazy: true },
  };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  const projectService = {
    getRepositoryState: () => ({}),
    getFileContent: vi.fn(async (id) => ({ url: `asset://${id}` })),
  };
  await handleAfterMount({
    store,
    props: context.props,
    refs: { image: target },
    render: vi.fn(),
    projectService,
  });
  return { context, projectService };
};

// A page column that scrolls, holding a dialog surface whose shadow tree puts
// its slotted content in a fixed panel, as the scene editor's action panel
// does in the side-by-side touch layout.
const createFixedPanelPage = ({ panelContent }) => {
  const pageColumn = document.createElement("div");
  makeScrollable(pageColumn);
  const surface = document.createElement("div");
  const shadowRoot = surface.attachShadow({ mode: "open" });
  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.append(document.createElement("slot"));
  shadowRoot.append(panel);
  surface.append(panelContent);
  pageColumn.append(surface);
  document.body.append(pageColumn);
  return { pageColumn };
};

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lazy file image observer root", () => {
  it("observes an image in a fixed panel against the viewport, not a scroll container outside the panel", async () => {
    const target = document.createElement("div");
    placeOffscreen(target);
    createFixedPanelPage({ panelContent: target });

    const { context, projectService } = await mountLazyImage(target);

    expect(observers).toHaveLength(1);
    expect(observers[0].options.root).toBeUndefined();
    expect(context.state.isLazyObserved).toBe(true);
    expect(projectService.getFileContent).not.toHaveBeenCalled();

    // Once the panel shows the image, it loads.
    observers[0].callback([{ isIntersecting: true, intersectionRatio: 1 }]);
    await vi.waitFor(() =>
      expect(projectService.getFileContent).toHaveBeenCalledWith("file-sprite"),
    );
  });

  it("observes an image against a scroll container inside the fixed panel", async () => {
    const list = document.createElement("div");
    makeScrollable(list);
    list.getBoundingClientRect = () => ({
      top: 0,
      bottom: 400,
      left: 0,
      right: 400,
      width: 400,
      height: 400,
    });
    const target = document.createElement("div");
    placeOffscreen(target);
    list.append(target);
    createFixedPanelPage({ panelContent: list });

    await mountLazyImage(target);

    expect(observers).toHaveLength(1);
    expect(observers[0].options.root).toBe(list);
  });
});
