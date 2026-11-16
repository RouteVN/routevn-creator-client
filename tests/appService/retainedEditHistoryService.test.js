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

    expect(service.getRetainedEditHistory({ owner: "transform:one" })).toEqual({
      owner: "transform:one",
      history,
      content: undefined,
    });
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
