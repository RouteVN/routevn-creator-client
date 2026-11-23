import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

const buildContainer = (fields) =>
  buildLayoutElements(
    [{ id: "container-1", type: "container", ...fields }],
    {},
    { items: {}, tree: [] },
    { items: {}, tree: [] },
    { items: {}, tree: [] },
    {},
  ).elements[0];

describe("buildLayoutElements container reading direction", () => {
  it.each(["horizontal", "vertical"])(
    "passes right to left on for a %s container",
    (direction) => {
      expect(
        buildContainer({ direction, readingDirection: "rtl" }),
      ).toMatchObject({ direction, readingDirection: "rtl" });
    },
  );

  it("leaves the default left to right out", () => {
    expect(
      buildContainer({ direction: "horizontal", readingDirection: "ltr" }),
    ).not.toHaveProperty("readingDirection");
    expect(buildContainer({ direction: "horizontal" })).not.toHaveProperty(
      "readingDirection",
    );
  });
});

// Route Graphics references the browser's Worker when it loads. Parsing does
// not use it.
const loadRouteGraphicsParsers = async () => {
  globalThis.Worker ??= class Worker {};
  const { containerPlugin, rectPlugin } = await import("route-graphics");

  return [containerPlugin, rectPlugin];
};

describe("a right-to-left container in Route Graphics", () => {
  const children = [
    { id: "wide", type: "rect", width: 200, height: 80 },
    { id: "narrow", type: "rect", width: 100, height: 80 },
  ];
  const parseContainer = async (fields) => {
    const parserPlugins = await loadRouteGraphicsParsers();
    const state = buildContainer({ width: 500, gapX: 20, children, ...fields });

    return parserPlugins[0]
      .parse({ state, parserPlugins })
      .children.map(({ id, x }) => ({ id, x }));
  };

  it("starts a horizontal row at the right edge", async () => {
    expect(await parseContainer({ direction: "horizontal" })).toEqual([
      { id: "wide", x: 0 },
      { id: "narrow", x: 220 },
    ]);
    expect(
      await parseContainer({
        direction: "horizontal",
        readingDirection: "rtl",
      }),
    ).toEqual([
      { id: "wide", x: 300 },
      { id: "narrow", x: 180 },
    ]);
  });

  it("lines a column up on the right edge", async () => {
    expect(
      await parseContainer({ direction: "vertical", readingDirection: "rtl" }),
    ).toEqual([
      { id: "wide", x: 300 },
      { id: "narrow", x: 400 },
    ]);
  });
});
