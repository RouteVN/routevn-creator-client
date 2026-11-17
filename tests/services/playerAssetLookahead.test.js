import { describe, expect, it, vi } from "vitest";
import {
  createLookaheadPlan,
  createPlayerAssetLookahead,
  createSectionLineIndex,
  selectAssetsToEvict,
} from "../../scripts/playerAssetLookahead.js";

const MB = 1024 * 1024;

// A line lists its pictures in `assets`, and may carry a jump.
const line = (id, assets = [], actions = {}) => ({ id, assets, actions });
const jump = (sectionId) => ({ sectionTransition: { sectionId } });

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

const plan = (sectionsById, pointer, options = {}) =>
  createLookaheadPlan({
    sections: createSectionLineIndex(createProjectData(sectionsById)),
    pointer,
    getLineAssetIds: (item) => item.assets,
    getAssetSize: () => MB,
    maxBytes: 100 * MB,
    ...options,
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
      main: [
        line("1", ["a"], {
          choice: {
            items: [
              { events: { click: { actions: jump("left") } } },
              { events: { click: { actions: jump("right") } } },
            ],
          },
        }),
      ],
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

  it("follows a jump and a conditional branch", () => {
    const sections = {
      main: [
        line("1", [], jump("next")),
        line("2", [], {
          conditional: { branches: [{ actions: jump("other") }] },
        }),
      ],
      next: [line("n1", ["n"])],
      other: [line("o1", ["o"])],
    };

    expect(plan(sections, { sectionId: "main", lineId: "1" })).toEqual([
      "n",
      "o",
    ]);
  });

  it("puts a jump two lines ahead before the lines after it", () => {
    const sections = {
      main: [
        line("1"),
        line("2", ["near"], jump("branch")),
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

  it("ignores a jump to a section that does not exist", () => {
    const sections = { main: [line("1", ["a"], jump("missing"))] };

    expect(plan(sections, { sectionId: "main", lineId: "1" })).toEqual(["a"]);
  });

  it("ends when a section jumps to itself", () => {
    const sections = { main: [line("1", ["a"]), line("2", [], jump("main"))] };

    expect(plan(sections, { sectionId: "main", lineId: "2" })).toEqual(["a"]);
  });

  it("stops at the size limit and keeps the nearest lines", () => {
    const sections = {
      main: [line("1", ["a"]), line("2", ["b"]), line("3", ["c"])],
    };

    expect(
      plan(sections, { sectionId: "main", lineId: "1" }, { maxBytes: 2 * MB }),
    ).toEqual(["a", "b"]);
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
const createPlayer = ({ sectionsById, maxBytes }) => {
  const sections = createSectionLineIndex(createProjectData(sectionsById));
  const loaded = new Set();
  const unloadAssets = vi.fn((assetIds) => {
    assetIds.forEach((assetId) => loaded.delete(assetId));
  });
  let pointer;
  let waitingStates = [];
  const lookahead = createPlayerAssetLookahead({
    sections,
    getPointer: () => pointer,
    getLineAssetIds: (item) => item.assets,
    getStateAssetIds: (state) => state.assets,
    getWaitingStates: () => waitingStates,
    getAssetSize: () => MB,
    getLoadedAssetIds: () => Array.from(loaded),
    unloadAssets,
    preloader: {
      setPlan: (assetIds) => assetIds.forEach((id) => loaded.add(id)),
    },
    maxBytes,
  });

  return {
    sections,
    loaded,
    unloadAssets,
    setWaitingStates: (states) => {
      waitingStates = states;
    },
    // Returns the pictures the line had to wait for.
    show(sectionId, lineId) {
      pointer = { sectionId, lineId };
      const shownLine = sections
        .get(sectionId)
        .find((item) => item.id === lineId);
      const missing = shownLine.assets.filter((id) => !loaded.has(id));
      shownLine.assets.forEach((id) => loaded.add(id));
      lookahead.update({ assets: shownLine.assets });
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
      const sectionsById = Object.fromEntries(
        sectionIds.map((sectionId) => [
          sectionId,
          Array.from({ length: 1 + random(12) }, (_, index) => {
            const assets = Array.from(
              { length: random(3) },
              () => `picture-${random(25)}`,
            );
            const actions =
              random(4) === 0
                ? jump(sectionIds[random(sectionIds.length)])
                : {};
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
        previousAssets = current.assets;

        const target = current.actions.sectionTransition?.sectionId;
        if (target && random(2) === 0) {
          sectionId = target;
          index = 0;
        } else if (index + 1 < lines.length) {
          index += 1;
        } else {
          sectionId = sectionIds[random(sectionIds.length)];
          index = 0;
        }
      }
    }
  });
});
