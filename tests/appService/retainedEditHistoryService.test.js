import { describe, expect, it } from "vitest";
import { createRetainedEditHistoryService } from "../../src/deps/services/shared/retainedEditHistoryService.js";
import {
  createEditHistory,
  getEditHistoryOwner,
  recordEditHistoryStep,
  resumeEditHistory,
} from "../../src/internal/editHistory.js";

const createHistoryWithStep = () => {
  const history = createEditHistory();
  recordEditHistoryStep(history, {
    before: { value: 1 },
    after: { value: 2 },
    time: 0,
  });
  return history;
};

describe("retained edit history", () => {
  it("gives a page its history back when it is opened again", () => {
    const service = createRetainedEditHistoryService();
    const history = createHistoryWithStep();
    service.retainEditHistory({ owner: "transform:one", history });

    expect(
      service.getRetainedEditHistory({ owner: "transform:one" }),
    ).toMatchObject({ owner: "transform:one", history });
    expect(
      service.getRetainedEditHistory({ owner: "transform:two" }),
    ).toBeUndefined();
  });

  it("keeps the history when another page is left without an edit", () => {
    const service = createRetainedEditHistoryService();
    const history = createHistoryWithStep();
    service.retainEditHistory({ owner: "transform:one", history });

    service.retainEditHistory({
      owner: "layout:layouts:two",
      history: createEditHistory(),
    });

    expect(
      service.getRetainedEditHistory({ owner: "transform:one" }).history,
    ).toBe(history);
  });

  it("drops the history when another page is left with an edit", () => {
    const service = createRetainedEditHistoryService();
    service.retainEditHistory({
      owner: "transform:one",
      history: createHistoryWithStep(),
    });

    const history = createHistoryWithStep();
    service.retainEditHistory({ owner: "transform:two", history });

    expect(
      service.getRetainedEditHistory({ owner: "transform:one" }),
    ).toBeUndefined();
    expect(
      service.getRetainedEditHistory({ owner: "transform:two" }).history,
    ).toBe(history);
  });

  it("drops a page's own history when it is left with none", () => {
    const service = createRetainedEditHistoryService();
    service.retainEditHistory({
      owner: "transform:one",
      history: createHistoryWithStep(),
    });

    service.retainEditHistory({
      owner: "transform:one",
      history: createEditHistory(),
    });

    expect(
      service.getRetainedEditHistory({ owner: "transform:one" }),
    ).toBeUndefined();
  });

  it("keeps nothing for a page that never opened its item", () => {
    const service = createRetainedEditHistoryService();
    const history = createHistoryWithStep();
    service.retainEditHistory({ owner: "transform:one", history });

    service.retainEditHistory({
      owner: getEditHistoryOwner("transform", undefined),
      history: createHistoryWithStep(),
    });

    expect(
      service.getRetainedEditHistory({ owner: "transform:one" }).history,
    ).toBe(history);
  });

  it("drops the history when an editor opens in another project", () => {
    let projectKey = "project-1";
    const service = createRetainedEditHistoryService({
      getProjectKey: () => projectKey,
    });
    service.retainEditHistory({
      owner: "scene:one",
      history: createHistoryWithStep(),
    });
    // Leaving the project for the project list changes nothing yet.
    projectKey = "";
    projectKey = "project-1";
    expect(
      service.getRetainedEditHistory({ owner: "layout:layouts:two" }),
    ).toBeUndefined();
    expect(
      service.getRetainedEditHistory({ owner: "scene:one" }),
    ).toBeDefined();

    // A copy of the project has a scene with the same id.
    projectKey = "project-2";
    expect(
      service.getRetainedEditHistory({ owner: "scene:one" }),
    ).toBeUndefined();
    projectKey = "project-1";
    expect(
      service.getRetainedEditHistory({ owner: "scene:one" }),
    ).toBeUndefined();
  });

  const createCollection = (items) => ({
    items: Object.fromEntries(items.map((item) => [item.id, item])),
    tree: items.map(({ id }) => ({ id })),
  });

  const createProjectState = ({
    fontIds = ["font-1"],
    spriteIds = [],
  } = {}) => ({
    project: { resolution: { width: 1920, height: 1080 } },
    fonts: createCollection(fontIds.map((id) => ({ id }))),
    characters: createCollection([
      {
        id: "character-1",
        sprites: createCollection(spriteIds.map((id) => ({ id }))),
      },
    ]),
    scenes: createCollection([
      {
        id: "scene-1",
        sections: createCollection([
          { id: "section-1", lines: createCollection([{ id: "line-1" }]) },
        ]),
      },
    ]),
    layouts: createCollection([
      { id: "layout-1", elements: createCollection([{ id: "element-1" }]) },
    ]),
  });

  it("drops the history when something in the project was deleted since", () => {
    let projectState = createProjectState({
      fontIds: ["font-1", "font-2"],
      spriteIds: ["sprite-1"],
    });
    const service = createRetainedEditHistoryService({
      getProjectState: () => projectState,
    });
    const retain = () =>
      service.retainEditHistory({
        owner: "textStyle:one",
        history: createHistoryWithStep(),
      });
    const getRetained = () =>
      service.getRetainedEditHistory({ owner: "textStyle:one" });

    // Items added since, and lines and elements that come and go as scenes
    // load and layouts save, keep the history.
    retain();
    projectState = createProjectState({
      fontIds: ["font-1", "font-2", "font-3"],
      spriteIds: ["sprite-1", "sprite-2"],
    });
    projectState.scenes.items["scene-1"].sections.items["section-1"].lines =
      createCollection([]);
    projectState.layouts.items["layout-1"].elements = createCollection([]);
    expect(getRetained()).toBeDefined();

    // A deleted font could be one that undo puts back.
    retain();
    projectState = createProjectState({ spriteIds: ["sprite-1"] });
    expect(getRetained()).toBeUndefined();

    // So could an item inside another, such as a character's sprite.
    projectState = createProjectState({ spriteIds: ["sprite-1"] });
    retain();
    projectState = createProjectState();
    expect(getRetained()).toBeUndefined();
  });

  it("keeps nothing when the project can no longer be read", () => {
    let closed = false;
    const service = createRetainedEditHistoryService({
      getProjectState: () => {
        if (closed) {
          throw new Error("No project is open.");
        }
        return createProjectState();
      },
    });
    service.retainEditHistory({
      owner: "scene:one",
      history: createHistoryWithStep(),
    });

    closed = true;
    service.retainEditHistory({
      owner: "scene:two",
      history: createHistoryWithStep(),
    });

    closed = false;
    expect(
      service.getRetainedEditHistory({ owner: "scene:one" }),
    ).toBeUndefined();
    expect(
      service.getRetainedEditHistory({ owner: "scene:two" }),
    ).toBeUndefined();
  });

  it("clears one owner's history, or any", () => {
    const service = createRetainedEditHistoryService();
    service.retainEditHistory({
      owner: "scene:one",
      history: createHistoryWithStep(),
    });

    service.clearRetainedEditHistory({ owner: "scene:two" });
    expect(
      service.getRetainedEditHistory({ owner: "scene:one" }),
    ).toBeDefined();

    service.clearRetainedEditHistory({ owner: "scene:one" });
    expect(
      service.getRetainedEditHistory({ owner: "scene:one" }),
    ).toBeUndefined();

    service.retainEditHistory({
      owner: "scene:one",
      history: createHistoryWithStep(),
    });
    service.clearRetainedEditHistory();
    expect(
      service.getRetainedEditHistory({ owner: "scene:one" }),
    ).toBeUndefined();
  });
});

describe("resumeEditHistory", () => {
  it("starts a new history when none was kept", () => {
    expect(resumeEditHistory(undefined, { value: 1 })).toEqual(
      createEditHistory(),
    );
  });

  it("uses the kept history while the item is as the page left it", () => {
    const history = createHistoryWithStep();

    expect(
      resumeEditHistory({ history, content: { value: 2 } }, { value: 2 }),
    ).toBe(history);
  });

  it("starts a new history when the item changed somewhere else", () => {
    expect(
      resumeEditHistory(
        { history: createHistoryWithStep(), content: { value: 2 } },
        { value: 3 },
      ),
    ).toEqual(createEditHistory());
  });

  it("uses the kept history of a page that keeps no content", () => {
    const history = createHistoryWithStep();

    expect(resumeEditHistory({ history })).toBe(history);
  });
});
