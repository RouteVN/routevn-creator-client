import { describe, expect, it } from "vitest";
import { createInitialState } from "../../src/components/commandLineControl/commandLineControl.store.js";

describe("commandLineControl.store", () => {
  it("does not allow the selected control to be cleared", () => {
    const state = createInitialState();

    expect(state.form.fields[0]).toMatchObject({
      name: "resourceId",
      type: "select",
      clearable: false,
    });
  });
});
