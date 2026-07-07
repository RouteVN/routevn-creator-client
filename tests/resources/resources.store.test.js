import { describe, expect, it } from "vitest";

import {
  createInitialState,
  selectResourceRoute,
  selectViewData,
} from "../../src/pages/resources/resources.store.js";

describe("resources store", () => {
  it("shows variables in system resources", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state });

    expect(viewData.system.map((item) => item.id)).toEqual([
      "controls",
      "variables",
    ]);
    expect(selectResourceRoute({ state }, "variables")).toBe(
      "/project/variables",
    );
  });
});
