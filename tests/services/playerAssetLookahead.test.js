import { describe, expect, it, vi } from "vitest";
import {
  collectLineJumps,
  createAssetKindLookup,
  createAssetSizeLookup,
  createLineAssetScanner,
  createLookaheadPlan,
  createLookaheadRunner,
  createPlayerAssetLookahead,
  createSceneStartIndex,
  createSectionLineIndex,
  createStoryPosition,
  MAX_LOOKAHEAD_RETRIES,
  selectAssetsToEvict,
  watchLineEntries,
} from "../../scripts/playerAssetLookahead.js";

const MB = 1024 * 1024;

// A line lists its pictures in `assets`, and may carry actions.
const line = (id, assets = [], actions = {}) => ({ id, assets, actions });
// A jump among a line's own actions is always taken.
const jump = (sectionId) => ({ sectionTransition: { sectionId } });
// A jump the player or a condition may or may not take.
const choice = (...sectionIds) => ({
  choice: {
    items: sectionIds.map((sectionId) => ({
      events: { click: { actions: jump(sectionId) } },
    })),
  },
});

const createProjectData = (sectionsById) => ({
  story: {
    scenes: {
      "scene-1": {
        sections: Object.fromEntries(
          Object.entries(sectionsById).map(([sectionId, lines]) => [
            sectionId,
            { lines },
          ]),
        ),
      },
    },
  },
});

const createPlan = (sectionsById, pointer, options = {}) =>
  createLookaheadPlan({
    sections: createSectionLineIndex(createProjectData(sectionsById)),
    pointer,
    getLineAssetIds: (item) => item.assets,
    getAssetSize: () => MB,
    maxBytes: 100 * MB,
    ...options,
  });
const plan = (...args) => createPlan(...args).assetIds;

describe("collectLineJumps", () => {
  it("marks a jump among the line's own actions as always taken", () => {
    expect(collectLineJumps(line("1", [], jump("next")))).toEqual([
      { sectionId: "next", unconditional: true },
    ]);
    expect(
      collectLineJumps(
        line("1", [], { resetStoryAtSection: { sectionId: "start" } }),
      ),
    ).toEqual([{ sectionId: "start", unconditional: true }]);
  });

  it("marks jumps in choices and conditional branches as optional", () => {
    expect(
      collectLineJumps(
        line("1", [], {
          ...choice("left", "right"),
          conditional: { branches: [{ actions: jump("other") }] },
        }),
      ),
    ).toEqual([
      { sectionId: "left", unconditional: false },
      { sectionId: "right", unconditional: false },
      { sectionId: "other", unconditional: false },
    ]);
  });

  it("reads the line a jumpToLine names", () => {
    expect(
      collectLineJumps(
        line("1", [], { jumpToLine: { sectionId: "next", lineId: "n4" } }),
      ),
    ).toEqual([
      { sectionId: "next", lineId: "n4", toLine: true, unconditional: true },
    ]);
  });

  it("ignores a sectionId that is not a jump", () => {
    expect(
      collectLineJumps(
        line("1", [], {
          dialogue: { sectionId: "next", content: [{ sectionId: "next" }] },
        }),
      ),
    ).toEqual([]);
    expect(collectLineJumps({ id: "1", sectionId: "next" })).toEqual([]);
  });

  it("keeps the scene of a jump that names one", () => {
    expect(
      collectLineJumps(
        line("1", [], { sectionTransition: { sceneId: "scene-2" } }),
      ),
    ).toEqual([
      { sectionId: undefined, sceneId: "scene-2", unconditional: true },
    ]);
  });

  it("finds the jumps of buttons in a layout or control the line shows", () => {
    const resources = {
      layouts: {
        title: {
          elements: [
            {
              type: "container",
              children: [
                { click: { payload: { actions: jump("chapter-1") } } },
                { click: { payload: { actions: jump("gallery") } } },
              ],
            },
          ],
        },
      },
      controls: {
        keys: { keyboard: { enter: { actions: jump("skip-target") } } },
      },
    };
    const titleLine = line("1", [], {
      layout: { resourceId: "title", resourceType: "layout" },
      control: { resourceId: "keys", resourceType: "control" },
      background: { resourceId: "image-1", resourceType: "image" },
    });

    expect(collectLineJumps(titleLine, resources)).toEqual([
      { sectionId: "chapter-1", unconditional: false },
      { sectionId: "gallery", unconditional: false },
      { sectionId: "skip-target", unconditional: false },
    ]);
    expect(collectLineJumps(titleLine)).toEqual([]);
  });
});

describe("createSceneStartIndex", () => {
  it("maps a scene to its initial section, or else its first one", () => {
    const sceneStarts = createSceneStartIndex({
      story: {
        scenes: {
          "scene-1": {
            initialSectionId: "b",
            sections: { a: { lines: [] }, b: { lines: [] } },
          },
          "scene-2": { sections: { c: { lines: [] } } },
          "scene-3": { sections: {} },
        },
      },
    });

    expect(Array.from(sceneStarts)).toEqual([
      ["scene-1", "b"],
      ["scene-2", "c"],
    ]);
  });
});

describe("createLookaheadPlan", () => {
  it("lists the lines after the current one, nearest first", () => {
    const sections = {
      main: [line("1", ["a"]), line("2", ["b"]), line("3", ["c", "b"])],
    };

    expect(plan(sections, { sectionId: "main", lineId: "2" })).toEqual([
      "b",
      "c",
    ]);
  });

  it("stops after the line count", () => {
    const sections = {
      main: [line("1"), line("2", ["a"]), line("3", ["b"]), line("4", ["c"])],
    };

    expect(
      plan(sections, { sectionId: "main", lineId: "1" }, { lineCount: 2 }),
    ).toEqual(["a", "b"]);
  });

  it("adds the opening lines of every choice", () => {
    const sections = {
      main: [line("1", ["a"], choice("left", "right"))],
      left: [line("l1", ["l1"]), line("l2", ["l2"]), line("l3", ["l3"])],
      right: [line("r1", ["r1"]), line("r2", ["r2"]), line("r3", ["r3"])],
    };

    expect(
      plan(
        sections,
        { sectionId: "main", lineId: "1" },
        { branchLineCount: 2 },
      ),
    ).toEqual(["a", "l1", "l2", "r1", "r2"]);
  });

  it("puts an optional jump before the lines after it", () => {
    const sections = {
      main: [
        line("1"),
        line("2", ["near"], {
          conditional: { branches: [{ actions: jump("branch") }] },
        }),
        line("3", ["far"]),
      ],
      branch: [line("b1", ["branch"])],
    };

    expect(plan(sections, { sectionId: "main", lineId: "1" })).toEqual([
      "near",
      "branch",
      "far",
    ]);
  });

  it("follows a jump that is always taken and skips the lines behind it", () => {
    const sections = {
      main: [
        line("1", ["a"]),
        line("2", ["b"], jump("next")),
        line("3", ["never"]),
      ],
      next: [line("n1", ["n1"]), line("n2", ["n2"])],
    };

    expect(plan(sections, { sectionId: "main", lineId: "1" })).toEqual([
      "a",
      "b",
      "n1",
      "n2",
    ]);
  });

  it("gives the target of a jump the rest of the line count", () => {
    const next = Array.from({ length: 10 }, (_, index) =>
      line(`n${index + 1}`, [`n${index + 1}`]),
    );
    const sections = {
      main: [line("1", ["a"]), line("2", [], jump("next"))],
      next,
    };

    // The current line, the jump line, then six lines of the target.
    expect(
      plan(
        sections,
        { sectionId: "main", lineId: "1" },
        { lineCount: 7, branchLineCount: 2 },
      ),
    ).toEqual(["a", "n1", "n2", "n3", "n4", "n5", "n6"]);
  });

  it("follows a chain of short sections", () => {
    const sections = {
      one: [line("1", ["a"], jump("two"))],
      two: [line("2", ["b"], jump("three"))],
      three: [line("3", ["c"])],
    };

    expect(plan(sections, { sectionId: "one", lineId: "1" })).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("starts a jumpToLine at the line it names", () => {
    const sections = {
      main: [
        line("1", [], { jumpToLine: { sectionId: "next", lineId: "n3" } }),
      ],
      next: [line("n1", ["n1"]), line("n2", ["n2"]), line("n3", ["n3"])],
    };

    expect(plan(sections, { sectionId: "main", lineId: "1" })).toEqual(["n3"]);
  });

  it("keeps a jumpToLine without a section in the same section", () => {
    const sections = {
      main: [
        line("1", ["a"], {
          choice: {
            items: [
              {
                events: {
                  click: { actions: { jumpToLine: { lineId: "4" } } },
                },
              },
            ],
          },
        }),
        line("2", ["b"]),
        line("3", ["c"]),
        line("4", ["d"]),
        line("5", ["e"]),
      ],
    };

    expect(
      plan(
        sections,
        { sectionId: "main", lineId: "1" },
        { lineCount: 1, branchLineCount: 2 },
      ),
    ).toEqual(["a", "d", "e", "b"]);
  });

  it("ignores an optional jump to a section or line that does not exist", () => {
    const sections = {
      main: [
        line("1", ["a"], choice("missing")),
        line("2", ["b"], {
          conditional: {
            branches: [
              { actions: { jumpToLine: { sectionId: "main", lineId: "9" } } },
            ],
          },
        }),
        line("3", ["c"]),
      ],
    };

    expect(plan(sections, { sectionId: "main", lineId: "1" })).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ends at a jump that is always taken to an unknown place", () => {
    const pointer = { sectionId: "main", lineId: "1" };
    for (const actions of [
      jump("missing"),
      { jumpToLine: { sectionId: "main", lineId: "9" } },
      { sectionTransition: { sceneId: "missing-scene" } },
    ]) {
      const sections = {
        main: [line("1", ["a"]), line("2", ["b"], actions), line("3", ["c"])],
      };

      expect(createPlan(sections, pointer)).toEqual({
        assetIds: ["a", "b"],
        complete: true,
      });
    }
  });

  it("follows a jump that names only a scene to its initial section", () => {
    const projectData = {
      story: {
        scenes: {
          "scene-1": {
            sections: {
              main: {
                lines: [
                  line("1", ["a"], {
                    sectionTransition: { sceneId: "scene-2" },
                  }),
                  line("2", ["never"]),
                ],
              },
            },
          },
          "scene-2": {
            initialSectionId: "opening",
            sections: {
              other: { lines: [line("o1", ["other"])] },
              opening: { lines: [line("s1", ["b"])] },
            },
          },
        },
      },
    };

    expect(
      createLookaheadPlan({
        sections: createSectionLineIndex(projectData),
        sceneStarts: createSceneStartIndex(projectData),
        pointer: { sectionId: "main", lineId: "1" },
        getLineAssetIds: (item) => item.assets,
        getAssetSize: () => MB,
        maxBytes: 100 * MB,
      }).assetIds,
    ).toEqual(["a", "b"]);
  });

  it("ends when the story jumps back to a line already listed", () => {
    const sections = { main: [line("1", ["a"]), line("2", [], jump("main"))] };

    expect(plan(sections, { sectionId: "main", lineId: "2" })).toEqual(["a"]);
  });

  it("stops filling at the size limit and keeps the nearest lines", () => {
    const sections = {
      main: [line("1", ["a"]), line("2", ["b"]), line("3", ["c"])],
    };

    expect(
      plan(sections, { sectionId: "main", lineId: "1" }, { maxBytes: 2 * MB }),
    ).toEqual(["a", "b"]);
  });

  it("leaves out an asset that is too large and lists the ones after it", () => {
    const sizes = { a: MB, huge: 200 * MB, b: MB, music: 0 };
    const sections = {
      main: [line("1", ["a"]), line("2", ["huge", "music"]), line("3", ["b"])],
    };

    expect(
      plan(
        sections,
        { sectionId: "main", lineId: "1" },
        { getAssetSize: (assetId) => sizes[assetId], maxBytes: 80 * MB },
      ),
    ).toEqual(["a", "music", "b"]);
  });

  it("lists assets that count for nothing after the limit is reached", () => {
    const sizes = { a: MB, b: MB, music: 0 };
    const sections = {
      main: [line("1", ["a"]), line("2", ["b"]), line("3", ["music"])],
    };

    expect(
      plan(
        sections,
        { sectionId: "main", lineId: "1" },
        { getAssetSize: (assetId) => sizes[assetId], maxBytes: MB },
      ),
    ).toEqual(["a", "music"]);
  });

  it("stops short at a line whose assets are not read yet", () => {
    const sections = {
      main: [line("1", ["a"]), line("2", ["b"]), line("3", ["c"])],
    };
    const pointer = { sectionId: "main", lineId: "1" };

    expect(
      createPlan(sections, pointer, {
        getLineAssetIds: (item) => (item.id === "3" ? undefined : item.assets),
      }),
    ).toEqual({ assetIds: ["a", "b"], complete: false });
    expect(createPlan(sections, pointer)).toEqual({
      assetIds: ["a", "b", "c"],
      complete: true,
    });
  });

  it("stops short at an unread line of a branch", () => {
    const sections = {
      main: [line("1", ["a"], choice("left")), line("2", ["b"])],
      left: [line("l1", ["l1"]), line("l2", ["l2"])],
    };

    expect(
      createPlan(
        sections,
        { sectionId: "main", lineId: "1" },
        {
          getLineAssetIds: (item) =>
            item.id === "l2" ? undefined : item.assets,
        },
      ),
    ).toEqual({ assetIds: ["a", "l1"], complete: false });
  });

  it("is empty when the position is unknown", () => {
    const sections = { main: [line("1", ["a"])] };

    expect(plan(sections, undefined)).toEqual([]);
    expect(plan(sections, { sectionId: "main", lineId: "9" })).toEqual([]);
    expect(plan(sections, { sectionId: "gone", lineId: "1" })).toEqual([]);
  });
});

describe("selectAssetsToEvict", () => {
  const loaded = new Map([
    ["old", { size: 4 * MB, lastUsed: 1 }],
    ["kept", { size: 4 * MB, lastUsed: 2 }],
    ["recent", { size: 4 * MB, lastUsed: 3 }],
  ]);

  it("frees nothing under the limit", () => {
    expect(
      selectAssetsToEvict({ loaded, keep: new Set(), maxBytes: 12 * MB }),
    ).toEqual([]);
  });

  it("frees the assets used longest ago first", () => {
    expect(
      selectAssetsToEvict({ loaded, keep: new Set(), maxBytes: 5 * MB }),
    ).toEqual(["old", "kept"]);
  });

  it("never frees a kept asset, even over the limit", () => {
    expect(
      selectAssetsToEvict({
        loaded,
        keep: new Set(["old", "kept", "recent"]),
        maxBytes: MB,
      }),
    ).toEqual([]);
    expect(
      selectAssetsToEvict({
        loaded,
        keep: new Set(["old"]),
        maxBytes: 8 * MB,
      }),
    ).toEqual(["kept"]);
  });
});

// A player stand-in: the preloader loads the whole plan at once, and showing
// a line loads whatever it still needs.
const createPlayer = ({ sectionsById, maxBytes, sizes = {}, resources }) => {
  const sections = createSectionLineIndex(createProjectData(sectionsById));
  const loaded = new Set();
  const givenUp = new Set();
  const plans = [];
  const unloadAssets = vi.fn((assetIds) => {
    assetIds.forEach((assetId) => loaded.delete(assetId));
  });
  let pointer;
  let waitingStates = [];
  let unreadLineIds = new Set();
  const getStateAssetIds = vi.fn((state) => state.assets);
  const lookahead = createPlayerAssetLookahead({
    sections,
    resources,
    getPointer: () => pointer,
    getLineAssetIds: (item) =>
      unreadLineIds.has(item.id) ? undefined : item.assets,
    getStateAssetIds,
    getWaitingStates: () => waitingStates,
    getAssetSize: (assetId) => sizes[assetId] ?? MB,
    getLoadedAssetIds: () =>
      Array.from(loaded).filter((assetId) => !assetId.startsWith("sound")),
    isAssetLoaded: (assetId) => loaded.has(assetId),
    unloadAssets,
    preloader: {
      setPlan: (assetIds) => {
        const queued = assetIds.filter((id) => !givenUp.has(id));
        plans.push(queued);
        queued.forEach((id) => loaded.add(id));
        return queued;
      },
    },
    maxBytes,
  });

  return {
    sections,
    loaded,
    givenUp,
    plans,
    unloadAssets,
    lookahead,
    getStateAssetIds,
    setWaitingStates: (states) => {
      waitingStates = states;
    },
    setUnreadLineIds: (lineIds) => {
      unreadLineIds = new Set(lineIds);
    },
    setPointer: (sectionId, lineId) => {
      pointer = { sectionId, lineId };
    },
    // Draws the screens of new lines, without moving the plan's position.
    draw(...screens) {
      screens.flat().forEach((id) => loaded.add(id));
      return lookahead.update(
        screens.map((assets) => ({
          renderState: { assets },
          entersLine: true,
        })),
      );
    },
    // Draws screens the story did not enter a line for, such as a hovered
    // button.
    redraw(...screens) {
      screens.flat().forEach((id) => loaded.add(id));
      return lookahead.update(
        screens.map((assets) => ({
          renderState: { assets },
          entersLine: false,
        })),
      );
    },
    // Returns the pictures the line had to wait for.
    show(sectionId, lineId) {
      pointer = { sectionId, lineId };
      const shownLine = sections
        .get(sectionId)
        .find((item) => item.id === lineId);
      const missing = shownLine.assets.filter((id) => !loaded.has(id));
      shownLine.assets.forEach((id) => loaded.add(id));
      lookahead.update([
        { renderState: { assets: shownLine.assets }, entersLine: true },
      ]);
      return missing;
    },
  };
};

describe("createPlayerAssetLookahead", () => {
  const pictureLines = (count) =>
    Array.from({ length: count }, (_, index) =>
      line(`${index + 1}`, [`picture-${index + 1}`]),
    );

  it("has the next line loaded before the player gets there", () => {
    const player = createPlayer({
      sectionsById: { main: pictureLines(30) },
      maxBytes: 8 * MB,
    });

    expect(player.show("main", "1")).toEqual(["picture-1"]);
    for (let index = 2; index <= 30; index++) {
      expect(player.show("main", `${index}`)).toEqual([]);
    }
  });

  it("frees passed pictures and keeps the previous screen", () => {
    const player = createPlayer({
      sectionsById: { main: pictureLines(30) },
      maxBytes: 8 * MB,
    });

    for (let index = 1; index <= 12; index++) {
      player.show("main", `${index}`);
      expect(player.loaded.size).toBeLessThanOrEqual(8);
    }

    expect(player.loaded.has("picture-1")).toBe(false);
    expect(player.loaded.has("picture-11")).toBe(true);
    expect(player.loaded.has("picture-12")).toBe(true);
  });

  it("keeps the previous screen when nothing else can be freed", () => {
    const twoPictureLines = Array.from({ length: 6 }, (_, index) =>
      line(`${index + 1}`, [`left-${index + 1}`, `right-${index + 1}`]),
    );
    const player = createPlayer({
      sectionsById: { main: twoPictureLines },
      maxBytes: 2 * MB,
    });

    player.show("main", "1");
    player.show("main", "2");

    expect(Array.from(player.loaded).sort()).toEqual([
      "left-1",
      "left-2",
      "right-1",
      "right-2",
    ]);

    player.show("main", "3");
    expect(player.loaded.has("left-1")).toBe(false);
    expect(player.loaded.has("right-2")).toBe(true);
  });

  it("keeps pictures of screens that wait to be drawn", () => {
    const player = createPlayer({
      sectionsById: { main: pictureLines(30), menu: [line("m", ["menu"])] },
      maxBytes: 4 * MB,
    });
    player.loaded.add("menu");
    player.setWaitingStates([{ assets: ["menu"] }]);

    for (let index = 1; index <= 12; index++) {
      player.show("main", `${index}`);
    }

    expect(player.loaded.has("menu")).toBe(true);
  });

  // The limit is below what must be kept, so everything else is freed.
  describe("the screen that may still be fading out", () => {
    const createTightPlayer = () => {
      const player = createPlayer({
        sectionsById: { main: [line("1")] },
        maxBytes: MB,
      });
      player.setPointer("main", "1");
      return player;
    };

    it("stays loaded when the current screen is drawn again", () => {
      const player = createTightPlayer();
      player.draw(["old"]);
      player.draw(["new"]);

      // A text reveal or auto mode draws the same screen many times.
      player.redraw(["new"]);
      player.redraw(["new"], ["new"]);
      player.redraw();
      // A line that changes no picture is the same screen as well.
      player.draw(["new"]);

      expect(player.loaded.has("old")).toBe(true);
      expect(player.unloadAssets).not.toHaveBeenCalled();
    });

    it("stays loaded when the current screen gains or loses a picture", () => {
      const player = createTightPlayer();
      player.draw(["old"]);
      player.draw(["new"]);

      player.redraw(["new", "hover"]);
      player.redraw(["new"]);
      player.redraw([]);

      expect(player.loaded.has("old")).toBe(true);
      // The picture the screen lost may be fading out as well.
      expect(player.loaded.has("hover")).toBe(true);
    });

    it("stays loaded when a new line only adds or removes a picture", () => {
      const player = createTightPlayer();
      player.draw(["old"]);
      player.draw(["new"]);

      player.draw(["new", "character"]);
      player.draw(["new"]);
      player.draw([]);

      expect(player.unloadAssets).not.toHaveBeenCalled();
      expect(player.loaded.has("old")).toBe(true);
      expect(player.loaded.has("character")).toBe(true);
    });

    it("stays loaded when a redraw swaps one picture for another", () => {
      const player = createTightPlayer();
      player.draw(["old"]);
      player.draw(["new", "toggle-off"]);

      // A toggle button or a slider thumb replaces its picture.
      player.redraw(["new", "toggle-on"]);
      player.redraw(["new", "toggle-off"]);

      expect(player.unloadAssets).not.toHaveBeenCalled();
      expect(player.loaded.has("old")).toBe(true);
    });

    it("is replaced by a new line that swaps a picture", () => {
      const player = createTightPlayer();
      player.draw(["old"]);
      player.draw(["new", "left"]);

      player.draw(["new", "right"]);

      expect(player.loaded.has("old")).toBe(false);
      expect(Array.from(player.loaded).sort()).toEqual([
        "left",
        "new",
        "right",
      ]);
    });

    it("stays loaded when several screens are drawn in one burst", () => {
      const player = createTightPlayer();
      player.draw(["a"]);

      // Skip mode draws screens faster than the lookahead runs.
      player.draw(["b"], ["c"], ["d"]);

      expect(player.unloadAssets).not.toHaveBeenCalled();
      expect(Array.from(player.loaded).sort()).toEqual(["a", "b", "c", "d"]);
    });

    it("is freed once two other screens have replaced it", () => {
      const player = createTightPlayer();
      player.draw(["a"]);
      player.draw(["b"], ["c"], ["d"]);

      player.draw(["e"]);
      expect(Array.from(player.loaded).sort()).toEqual(["d", "e"]);

      player.draw(["f"]);
      expect(Array.from(player.loaded).sort()).toEqual(["e", "f"]);
    });
  });

  it("does not queue or count a sound that is already loaded", () => {
    const player = createPlayer({
      sectionsById: {
        main: [line("1", ["a"]), line("2", ["sound-1", "b"]), line("3")],
      },
      maxBytes: 8 * MB,
      sizes: { "sound-1": 0 },
    });

    player.show("main", "1");
    expect(player.plans.at(-1)).toEqual(["sound-1", "b"]);

    // The loader lists pictures only, so the sound is not among them.
    player.show("main", "1");
    expect(player.plans.at(-1)).toEqual([]);
    expect(player.loaded.has("sound-1")).toBe(true);
    expect(player.unloadAssets).not.toHaveBeenCalled();
  });

  it("makes no room for an asset the preloader gave up on", () => {
    const player = createPlayer({
      sectionsById: {
        main: [line("1", ["a"]), line("2", ["broken"]), line("3", ["b"])],
      },
      // Enough for the plan, and for every picture but the broken one.
      maxBytes: 6 * MB,
    });
    player.givenUp.add("broken");
    player.draw(["old-1"]);
    player.draw(["old-2"]);
    player.draw(["old-3"]);
    player.draw(["old-4"]);

    player.show("main", "1");

    expect(player.plans.at(-1)).toEqual(["b"]);
    expect(player.loaded.has("broken")).toBe(false);
    // old-1 to old-4, a and b: six pictures, exactly the limit.
    expect(player.unloadAssets).not.toHaveBeenCalled();
  });

  it("frees nothing while the plan is short, and asks to run again", () => {
    const player = createPlayer({
      sectionsById: { main: pictureLines(6) },
      maxBytes: 4 * MB,
    });
    ["old-1", "old-2", "old-3", "old-4", "old-5"].forEach((id) => {
      player.loaded.add(id);
    });
    player.setPointer("main", "1");
    player.setUnreadLineIds(["2", "3", "4", "5", "6"]);

    expect(
      player.lookahead.update([
        { renderState: { assets: ["picture-1"] }, entersLine: true },
      ]),
    ).toBe(false);
    expect(player.unloadAssets).not.toHaveBeenCalled();

    player.setUnreadLineIds([]);
    expect(player.lookahead.update([])).toBe(true);
    expect(player.unloadAssets).toHaveBeenCalled();
    expect(player.loaded.has("picture-1")).toBe(true);
    expect(player.loaded.has("picture-2")).toBe(true);
  });

  it("reads the pictures of a screen once while it waits to be drawn", () => {
    const player = createPlayer({
      sectionsById: { main: [line("1")] },
      maxBytes: 8 * MB,
    });
    const waiting = { assets: ["menu"] };
    const drawn = { renderState: { assets: ["a"] }, entersLine: true };
    player.setPointer("main", "1");
    player.setWaitingStates([waiting]);

    player.lookahead.update([drawn]);
    player.lookahead.update([]);
    player.lookahead.update([]);

    expect(player.getStateAssetIds).toHaveBeenCalledTimes(2);
  });

  it("loads the story behind a button of a layout the line shows", () => {
    const player = createPlayer({
      sectionsById: {
        title: [
          line("1", ["title-art"], {
            layout: { resourceId: "title-menu", resourceType: "layout" },
          }),
        ],
        "chapter-1": [line("c1", ["first-background"])],
      },
      resources: {
        layouts: {
          "title-menu": {
            elements: [{ click: { payload: { actions: jump("chapter-1") } } }],
          },
        },
      },
      maxBytes: 8 * MB,
    });

    player.show("title", "1");

    expect(player.show("chapter-1", "c1")).toEqual([]);
  });

  // Random stories and random walks through them. A failing seed is printed
  // by the assertion message so the walk can be replayed.
  it("never frees a picture that is in use, on random stories", () => {
    for (let seed = 1; seed <= 200; seed++) {
      let state = seed;
      const random = (limit) => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state % limit;
      };

      const sectionIds = Array.from(
        { length: 2 + random(4) },
        (_, index) => `section-${index}`,
      );
      const randomSectionId = () => sectionIds[random(sectionIds.length)];
      const sectionsById = Object.fromEntries(
        sectionIds.map((sectionId) => [
          sectionId,
          Array.from({ length: 1 + random(12) }, (_, index) => {
            const assets = Array.from(
              { length: random(3) },
              () => `picture-${random(25)}`,
            );
            const kind = random(8);
            let actions = {};
            if (kind === 0) {
              actions = jump(randomSectionId());
            } else if (kind === 1) {
              actions = choice(randomSectionId(), randomSectionId());
            }
            return line(`${sectionId}-${index}`, assets, actions);
          }),
        ]),
      );
      const maxBytes = (2 + random(14)) * MB;
      const player = createPlayer({ sectionsById, maxBytes });

      let sectionId = sectionIds[0];
      let index = 0;
      let previousAssets = [];
      for (let step = 0; step < 60; step++) {
        const lines = player.sections.get(sectionId);
        const current = lines[index];
        player.show(sectionId, current.id);
        // Now and then the same screen is drawn again.
        if (random(3) === 0) {
          player.redraw(current.assets);
        }

        const message = `seed ${seed}, step ${step}`;
        // The shown screen and the one before it stay loaded.
        for (const assetId of [...current.assets, ...previousAssets]) {
          expect(player.loaded.has(assetId), message).toBe(true);
        }
        // Only what must be kept may pass the limit: two screens of at most
        // two pictures each, and a plan of half the limit.
        expect(player.loaded.size * MB, message).toBeLessThanOrEqual(
          Math.max(maxBytes, 4 * MB + maxBytes / 2),
        );
        if (current.assets.length > 0) {
          previousAssets = current.assets;
        }

        const choices = current.actions.choice?.items;
        if (current.actions.sectionTransition) {
          sectionId = current.actions.sectionTransition.sectionId;
          index = 0;
        } else if (choices && random(2) === 0) {
          sectionId =
            choices[random(choices.length)].events.click.actions
              .sectionTransition.sectionId;
          index = 0;
        } else if (index + 1 < lines.length) {
          index += 1;
        } else {
          sectionId = randomSectionId();
          index = 0;
        }
      }
    }
  });
});

describe("createAssetKindLookup", () => {
  const getAssetKind = createAssetKindLookup({
    projectData: {
      resources: {
        images: { "image-1": { fileId: "generic-picture" } },
        spritesheets: { "sheet-1": { fileId: "generic-sheet" } },
        sounds: { "sound-1": { fileId: "generic-sound" } },
        voices: { "scene-1": { "voice-1": { fileId: "generic-voice" } } },
        fonts: { "font-1": { fileId: "generic-font" } },
        images2: {},
      },
    },
    manifestAssets: {
      picture: { mime: "image/png" },
      music: { mime: "audio/ogg" },
      font: { mime: "font/woff2" },
      video: { mime: "video/mp4" },
      "generic-picture": { mime: "application/octet-stream" },
      "generic-sheet": { mime: "application/octet-stream" },
      "generic-sound": { mime: "application/octet-stream" },
      "generic-voice": {},
      "generic-font": { mime: "application/octet-stream" },
    },
  });

  it("takes the kind from the type the package lists", () => {
    expect(getAssetKind("picture")).toBe("image");
    expect(getAssetKind("music")).toBe("audio");
  });

  it("looks up a file of another type in the project's resources", () => {
    expect(getAssetKind("generic-picture")).toBe("image");
    expect(getAssetKind("generic-sheet")).toBe("image");
    expect(getAssetKind("generic-sound")).toBe("audio");
    expect(getAssetKind("generic-voice")).toBe("audio");
  });

  it("gives no kind to other files and to ids outside the package", () => {
    expect(getAssetKind("font")).toBeUndefined();
    expect(getAssetKind("video")).toBeUndefined();
    expect(getAssetKind("generic-font")).toBeUndefined();
    expect(getAssetKind("image-1")).toBeUndefined();
    expect(getAssetKind("not-in-package")).toBeUndefined();
  });
});

describe("createAssetSizeLookup", () => {
  const getAssetSize = createAssetSizeLookup({
    projectData: {
      resources: {
        images: {
          "image-1": { fileId: "picture", width: 1000, height: 500 },
          "image-2": { fileId: "no-size" },
          "image-3": { fileId: "generic", width: 100, height: 100 },
          "image-4": { fileId: "nothing-known" },
        },
        spritesheets: {
          "sheet-1": { fileId: "sheet", sheetWidth: 4096, sheetHeight: 2048 },
          "sheet-2": {
            fileId: "atlas",
            width: 64,
            height: 64,
            jsonData: { meta: { size: { w: 2048, h: 1024 } } },
          },
        },
      },
    },
    manifestAssets: {
      picture: { mime: "image/png", size: 10 },
      "no-size": { mime: "image/webp", size: 1000 },
      sheet: { mime: "image/png", size: 10 },
      atlas: { mime: "image/png", size: 10 },
      diced: { mime: "image/png", size: 10, width: 300, height: 200 },
      generic: { mime: "application/octet-stream", size: 10 },
      "nothing-known": { mime: "image/png" },
      music: { mime: "audio/ogg", size: 25 * MB },
      font: { mime: "font/woff2", size: 1000 },
    },
  });

  it("counts four bytes per pixel for a picture", () => {
    expect(getAssetSize("picture")).toBe(1000 * 500 * 4);
  });

  it("counts a spritesheet as the whole sheet, not one frame", () => {
    expect(getAssetSize("sheet")).toBe(4096 * 2048 * 4);
    expect(getAssetSize("atlas")).toBe(2048 * 1024 * 4);
  });

  it("uses the pixel size the package lists for a picture", () => {
    expect(getAssetSize("diced")).toBe(300 * 200 * 4);
  });

  it("guesses high for a picture of unknown pixel size", () => {
    expect(getAssetSize("no-size")).toBe(16_000);
    expect(getAssetSize("nothing-known")).toBe(8 * MB);
  });

  it("counts a picture the package lists under a generic type", () => {
    expect(getAssetSize("generic")).toBe(100 * 100 * 4);
  });

  it("counts nothing for sounds and other files", () => {
    expect(getAssetSize("music")).toBe(0);
    expect(getAssetSize("font")).toBe(0);
    expect(getAssetSize("not-in-package")).toBe(0);
  });
});

describe("createLineAssetScanner", () => {
  const createScanner = () => {
    const clock = { time: 0 };
    const scanLine = vi.fn((item) => {
      clock.time += 3;
      return item.assets;
    });
    const scanner = createLineAssetScanner({
      scanLine,
      now: () => clock.time,
      budgetMs: 5,
    });
    return { scanner, scanLine };
  };
  const lines = [line("1", ["a"]), line("2", ["b"]), line("3", ["c"])];

  it("reads lines until the time for the pass is used up", () => {
    const { scanner } = createScanner();

    scanner.startPass();
    expect(scanner.getLineAssetIds(lines[0])).toEqual(["a"]);
    expect(scanner.getLineAssetIds(lines[1])).toEqual(["b"]);
    expect(scanner.getLineAssetIds(lines[2])).toBeUndefined();
  });

  it("goes on in the next pass and reads each line once", () => {
    const { scanner, scanLine } = createScanner();
    scanner.startPass();
    lines.forEach((item) => scanner.getLineAssetIds(item));

    scanner.startPass();
    expect(lines.map((item) => scanner.getLineAssetIds(item))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
    expect(scanLine).toHaveBeenCalledTimes(3);
  });

  it("reads one line in a pass even with no time", () => {
    const scanner = createLineAssetScanner({
      scanLine: (item) => item.assets,
      now: () => 0,
      budgetMs: 0,
    });

    scanner.startPass();
    expect(scanner.getLineAssetIds(lines[0])).toEqual(["a"]);
    expect(scanner.getLineAssetIds(lines[1])).toBeUndefined();
  });
});

describe("createLookaheadRunner", () => {
  const createRunner = (update) => {
    const scheduled = [];
    const onError = vi.fn();
    const runner = createLookaheadRunner({
      update,
      onError,
      schedule: (run) => scheduled.push(run),
    });
    return {
      runner,
      onError,
      scheduled,
      runScheduled: () => scheduled.splice(0).forEach((run) => run()),
    };
  };

  it("runs once for a burst of screens and passes every one", () => {
    const update = vi.fn(() => true);
    const { runner, scheduled, runScheduled } = createRunner(update);

    runner.onRendered("a");
    runner.onRendered("b");
    runner.onRendered("c");
    expect(update).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    runScheduled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(scheduled).toHaveLength(0);
  });

  it("runs again with no screens while the plan is short", () => {
    const update = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const { runner, scheduled, runScheduled } = createRunner(update);

    runner.onRendered("a");
    runScheduled();
    runScheduled();
    runScheduled();

    expect(update.mock.calls).toEqual([[["a"]], [[]], [[]]]);
    expect(scheduled).toHaveLength(0);
  });

  it("gives the screens of a failed pass to the next one", () => {
    const error = new Error("bad line");
    const update = vi.fn().mockImplementationOnce(() => {
      throw error;
    });
    update.mockReturnValue(true);
    const { runner, onError, scheduled, runScheduled } = createRunner(update);

    runner.onRendered("a");
    runner.onRendered("b");
    runScheduled();
    expect(onError).toHaveBeenCalledWith(error);
    expect(scheduled).toHaveLength(1);

    runner.onRendered("c");
    runScheduled();
    expect(update).toHaveBeenLastCalledWith(["a", "b", "c"]);
    expect(scheduled).toHaveLength(0);
  });

  it("stops running a pass again when it keeps failing", () => {
    const update = vi.fn(() => {
      throw new Error("always bad");
    });
    const { runner, onError, scheduled, runScheduled } = createRunner(update);

    runner.onRendered("a");
    for (let pass = 0; pass < MAX_LOOKAHEAD_RETRIES + 5; pass++) {
      runScheduled();
    }

    expect(update).toHaveBeenCalledTimes(MAX_LOOKAHEAD_RETRIES + 1);
    expect(onError).toHaveBeenCalledTimes(MAX_LOOKAHEAD_RETRIES + 1);
    expect(scheduled).toHaveLength(0);

    // The next screen starts it again.
    update.mockImplementation(() => true);
    runner.onRendered("b");
    runScheduled();
    expect(update).toHaveBeenLastCalledWith(["a", "b"]);
  });

  it("keeps only the last screens of passes that fail", () => {
    const update = vi.fn(() => {
      throw new Error("always bad");
    });
    const { runner, runScheduled } = createRunner(update);

    for (let index = 0; index < 30; index++) {
      runner.onRendered(index);
      runScheduled();
    }

    // Eight kept screens and the one just drawn.
    expect(update.mock.lastCall[0]).toEqual([
      21, 22, 23, 24, 25, 26, 27, 28, 29,
    ]);
  });
});

describe("watchLineEntries", () => {
  const createHandler = () => {
    const handleEffects = vi.fn(() => "handled");
    handleEffects.reset = vi.fn();
    handleEffects.dispose = vi.fn();
    handleEffects.reconcilePlaybackScheduleV1 = vi.fn();
    return handleEffects;
  };

  it("reports the position of each line the engine enters", () => {
    const handleEffects = createHandler();
    const onLineEntered = vi.fn();
    const watched = watchLineEntries(handleEffects, onLineEntered);
    const effects = [
      { name: "render" },
      {
        name: "handleLineActions",
        payload: { pointer: { sectionId: "main", lineId: "2" } },
      },
      // The effect of the engine's start carries no position.
      { name: "handleLineActions" },
    ];

    expect(watched(effects)).toBe("handled");

    expect(onLineEntered.mock.calls).toEqual([
      [{ sectionId: "main", lineId: "2" }],
    ]);
    expect(handleEffects).toHaveBeenCalledWith(effects);
  });

  it("keeps the other abilities of the effects handler", () => {
    const handleEffects = createHandler();
    const watched = watchLineEntries(handleEffects, vi.fn());

    watched.reset();
    watched.dispose();
    watched.reconcilePlaybackScheduleV1("schedule");

    expect(handleEffects.reset).toHaveBeenCalled();
    expect(handleEffects.dispose).toHaveBeenCalled();
    expect(handleEffects.reconcilePlaybackScheduleV1).toHaveBeenCalledWith(
      "schedule",
    );
  });
});

describe("createStoryPosition", () => {
  it("follows the lines the engine enters without reading its state", () => {
    const readSystemState = vi.fn();
    const position = createStoryPosition({ readSystemState });

    position.onLineEntered({ sectionId: "main", lineId: "1" });
    expect(position.getPointer()).toEqual({ sectionId: "main", lineId: "1" });

    position.onLineEntered({ sectionId: "main", lineId: "2" });
    expect(position.getPointer()).toEqual({ sectionId: "main", lineId: "2" });
    expect(position.getPointer()).toEqual({ sectionId: "main", lineId: "2" });
    expect(readSystemState).not.toHaveBeenCalled();
  });

  it("reads the engine state once when no line was seen yet", () => {
    const readSystemState = vi.fn(() => ({
      contexts: [
        { pointers: { read: { sectionId: "menu", lineId: "m1" } } },
        {
          currentPointerMode: "history",
          pointers: {
            read: { sectionId: "main", lineId: "9" },
            history: { sectionId: "main", lineId: "3" },
          },
        },
      ],
    }));
    const position = createStoryPosition({ readSystemState });

    // The line the engine shows, which is not always the one it reads.
    expect(position.getPointer()).toEqual({ sectionId: "main", lineId: "3" });
    position.getPointer();
    expect(readSystemState).toHaveBeenCalledTimes(1);
  });

  it("has no position for an engine without a story context", () => {
    const readSystemState = vi.fn(() => ({ contexts: [] }));
    const position = createStoryPosition({ readSystemState });

    expect(position.getPointer()).toBeUndefined();
    expect(position.getPointer()).toBeUndefined();
    expect(readSystemState).toHaveBeenCalledTimes(1);
  });

  it("marks the first screen queued after a line was entered", () => {
    const position = createStoryPosition({ readSystemState: vi.fn() });
    const [first, second, redraw, third] = [{}, {}, {}, {}];

    position.onScreenQueued(first);
    position.onLineEntered({ sectionId: "main", lineId: "1" });
    position.onScreenQueued(second);
    position.onScreenQueued(redraw);
    position.onLineEntered({ sectionId: "main", lineId: "2" });
    position.onLineEntered({ sectionId: "main", lineId: "3" });
    position.onScreenQueued(third);

    expect([first, second, redraw, third].map(position.entersLine)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });
});
