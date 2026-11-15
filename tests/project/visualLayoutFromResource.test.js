import { describe, expect, it } from "vitest";
import {
  countVisualLayoutElements,
  createVisualLayoutFromResource,
  getVisualLayoutMedia,
  isLinkedLayoutVisualItem,
  toCustomLayoutVisualItem,
  toLayoutVisualItem,
} from "../../src/internal/project/layout.js";

const resources = {
  images: {
    door: { id: "door", name: "Door", width: 400, height: 600 },
  },
  videos: {
    rain: { id: "rain", name: "Rain", width: 1920, height: 1080 },
  },
  spritesheets: {
    fire: {
      id: "fire",
      name: "Fire",
      width: 64,
      height: 96,
      animations: { burn: {}, smoke: {} },
    },
  },
  particles: {
    snow: { id: "snow", name: "Snow", width: 1920, height: 1080 },
  },
  layouts: {
    card: {
      id: "card",
      name: "Card",
      layoutSchemaVersion: 2,
      width: 300,
      height: 200,
      elements: {
        items: {
          frame: { type: "sprite", imageId: "door" },
        },
        tree: [{ id: "frame" }],
      },
    },
  },
};

const SCREEN_LAYER = {
  x: 0,
  y: 0,
  anchorX: 0,
  anchorY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

const resourcesWithTransforms = {
  ...resources,
  transforms: {
    center: {
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
};

const oneElementLayout = (element) => ({
  layoutSchemaVersion: 2,
  elements: {
    items: { content: element },
    tree: [{ id: "content" }],
  },
});

describe("createVisualLayoutFromResource", () => {
  it("puts an image on the screen where the visual placed it", () => {
    const placement = {
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 2,
      scaleY: 2,
      rotation: 10,
    };

    expect(
      createVisualLayoutFromResource({
        resourceType: "image",
        resourceId: "door",
        resources,
        placement,
      }),
    ).toEqual(
      oneElementLayout({
        ...placement,
        type: "sprite",
        name: "Door",
        imageId: "door",
        width: 400,
        height: 600,
      }),
    );
  });

  it("puts a resource at the screen's top left without a placement", () => {
    expect(
      createVisualLayoutFromResource({
        resourceType: "image",
        resourceId: "door",
        resources,
      }).elements.items.content,
    ).toMatchObject(SCREEN_LAYER);
  });

  it("keeps a video playing once, as a video visual did", () => {
    expect(
      createVisualLayoutFromResource({
        resourceType: "video",
        resourceId: "rain",
        resources,
      }).elements.items.content,
    ).toMatchObject({ type: "video", videoId: "rain", loop: false });
  });

  it("keeps the chosen spritesheet animation, or uses the first one", () => {
    const chosen = createVisualLayoutFromResource({
      resourceType: "spritesheet",
      resourceId: "fire",
      animationName: "smoke",
      resources,
    });
    const first = createVisualLayoutFromResource({
      resourceType: "spritesheet",
      resourceId: "fire",
      resources,
    });

    expect(chosen).not.toHaveProperty("width");
    expect(chosen.elements.items.content).toMatchObject({
      type: "spritesheet-animation",
      resourceId: "fire",
      animationName: "smoke",
      width: 64,
      height: 96,
    });
    expect(first.elements.items.content.animationName).toBe("burn");
  });

  it("finds the resource type when the visual did not save it", () => {
    expect(
      createVisualLayoutFromResource({ resourceId: "snow", resources }).elements
        .items.content,
    ).toMatchObject({ type: "particle", particleId: "snow" });
  });

  it("puts a shared layout with its own canvas in a container placed as the visual was", () => {
    const placement = { ...SCREEN_LAYER, x: 960, y: 540, anchorX: 0.5 };
    const layout = createVisualLayoutFromResource({
      resourceType: "layout",
      resourceId: "card",
      resources,
      placement,
    });

    expect(layout).toEqual({
      layoutSchemaVersion: 2,
      elements: {
        items: {
          frame: { type: "sprite", imageId: "door" },
          content: {
            type: "container",
            name: "Card",
            ...placement,
            direction: "absolute",
            gapX: 0,
            gapY: 0,
            width: 300,
            height: 200,
          },
        },
        tree: [{ id: "content", children: [{ id: "frame" }] }],
      },
    });
    expect(layout.elements.items.frame).not.toBe(
      resources.layouts.card.elements.items.frame,
    );
  });

  it("copies a shared layout drawn on the screen as it is", () => {
    const screenLayout = {
      ...resources.layouts.card,
      width: undefined,
      height: undefined,
    };
    expect(
      createVisualLayoutFromResource({
        resourceType: "layout",
        resourceId: "card",
        resources: { layouts: { card: screenLayout } },
      }),
    ).toEqual({
      layoutSchemaVersion: 2,
      elements: resources.layouts.card.elements,
    });
  });

  it("leaves the element's size out when the resource's is unknown", () => {
    const content = createVisualLayoutFromResource({
      resourceType: "image",
      resourceId: "missing",
      resources,
    }).elements.items.content;

    expect(content).not.toHaveProperty("width");
    expect(content).toMatchObject({
      type: "sprite",
      name: "missing",
      imageId: "missing",
    });
  });
});

describe("toLayoutVisualItem", () => {
  it("moves the visual's placement into its layout and keeps the rest", () => {
    const item = {
      id: "visual-1",
      resourceId: "door",
      resourceType: "image",
      transformId: "center",
      x: 100,
      flipX: true,
      layer: 50,
      opacity: 0.5,
    };

    expect(toLayoutVisualItem(item, resourcesWithTransforms)).toEqual({
      id: "visual-1",
      layer: 50,
      opacity: 0.5,
      layout: createVisualLayoutFromResource({
        resourceType: "image",
        resourceId: "door",
        resources,
        placement: {
          x: 100,
          y: 540,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: -1,
          scaleY: 1,
          rotation: 0,
        },
      }),
    });
    expect(item.resourceId).toBe("door");
  });

  it("makes a layout with its own canvas a screen layer", () => {
    const item = {
      id: "visual-1",
      transform: { ...SCREEN_LAYER, x: 960, y: 540 },
      layout: {
        layoutSchemaVersion: 2,
        width: 300,
        height: 200,
        elements: resources.layouts.card.elements,
      },
    };

    const layoutItem = toLayoutVisualItem(item, resources);
    expect(layoutItem).not.toHaveProperty("transform");
    expect(layoutItem.layout).not.toHaveProperty("width");
    expect(layoutItem.layout.elements.items.content).toMatchObject({
      type: "container",
      x: 960,
      y: 540,
      width: 300,
      height: 200,
    });
    expect(layoutItem.layout.elements.tree).toEqual([
      { id: "content", children: [{ id: "frame" }] },
    ]);
  });

  it("leaves a screen layer, or a visual that only moves", () => {
    const layoutItem = {
      id: "visual-1",
      layout: oneElementLayout({ type: "rect" }),
    };
    const movedLayer = { ...layoutItem, transformId: "center" };
    const moveItem = { id: "visual-2", transformId: "left" };

    expect(toLayoutVisualItem(layoutItem, resources)).toBe(layoutItem);
    expect(toLayoutVisualItem(movedLayer, resources)).toBe(movedLayer);
    expect(toLayoutVisualItem(moveItem, resources)).toBe(moveItem);
  });

  it("keeps a project layout by reference, with or without its type saved", () => {
    const linked = {
      id: "visual-1",
      resourceId: "card",
      resourceType: "layout",
    };
    const untyped = {
      id: "visual-2",
      resourceId: "card",
      transformId: "center",
    };

    expect(isLinkedLayoutVisualItem(linked, resources)).toBe(true);
    expect(isLinkedLayoutVisualItem(untyped, resources)).toBe(true);
    expect(toLayoutVisualItem(linked, resources)).toBe(linked);
    expect(toLayoutVisualItem(untyped, resources)).toBe(untyped);
  });

  it("does not take a custom layout or a single resource for a project layout", () => {
    expect(
      isLinkedLayoutVisualItem(
        { id: "visual-1", layout: oneElementLayout({ type: "rect" }) },
        resources,
      ),
    ).toBe(false);
    expect(
      isLinkedLayoutVisualItem(
        { id: "visual-2", resourceId: "door", resourceType: "image" },
        resources,
      ),
    ).toBe(false);
  });
});

describe("toCustomLayoutVisualItem", () => {
  it("copies a project layout into a custom layout of the visual's own", () => {
    const item = {
      id: "visual-1",
      resourceId: "card",
      resourceType: "layout",
      transformId: "center",
      layer: 70,
    };

    const customItem = toCustomLayoutVisualItem(item, resourcesWithTransforms);
    expect(customItem).toEqual({
      id: "visual-1",
      layer: 70,
      layout: createVisualLayoutFromResource({
        resourceType: "layout",
        resourceId: "card",
        resources,
        placement: {
          ...SCREEN_LAYER,
          x: 960,
          y: 540,
          anchorX: 0.5,
          anchorY: 0.5,
        },
      }),
    });
    expect(customItem.layout.elements.items.frame).not.toBe(
      resources.layouts.card.elements.items.frame,
    );
  });
});

describe("getVisualLayoutMedia", () => {
  it("returns the first resource in element order, inside containers too", () => {
    const layout = {
      elements: {
        items: {
          title: { type: "text", text: "Hello" },
          group: { type: "container" },
          fire: {
            type: "spritesheet-animation",
            resourceId: "fire",
            animationName: "burn",
          },
          door: { type: "sprite", imageId: "door" },
        },
        tree: [
          { id: "title" },
          { id: "group", children: [{ id: "fire" }] },
          { id: "door" },
        ],
      },
    };

    expect(getVisualLayoutMedia(layout)).toEqual({
      elementId: "fire",
      resourceType: "spritesheet",
      resourceId: "fire",
      animationName: "burn",
    });
    expect(countVisualLayoutElements(layout)).toBe(4);
  });

  it("reads a layout as built for the engine, as a presentation state has it", () => {
    expect(
      getVisualLayoutMedia({
        elements: [
          { id: "title", type: "text", content: "Hello" },
          {
            id: "group",
            type: "container",
            children: [{ id: "door", type: "sprite", imageId: "door" }],
          },
        ],
      }),
    ).toEqual({ elementId: "door", resourceType: "image", resourceId: "door" });
  });

  it("returns nothing for a layout without a resource", () => {
    expect(
      getVisualLayoutMedia({
        elements: {
          items: { title: { type: "text", text: "Hello" } },
          tree: [{ id: "title" }],
        },
      }),
    ).toBeUndefined();
    expect(getVisualLayoutMedia(undefined)).toBeUndefined();
    expect(countVisualLayoutElements(undefined)).toBe(0);
  });
});
