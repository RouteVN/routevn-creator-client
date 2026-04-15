import { describe, expect, it } from "vitest";
import { selectItems } from "../../src/components/commandLineActions/commandLineActions.store.js";

describe("commandLineActions.store", () => {
  it("offers resetStoryAtSection in system actions and drops resetStorySession", () => {
    const modes = selectItems({
      props: {
        actionsType: "system",
      },
    }).map((item) => item.mode);

    expect(modes).toContain("resetStoryAtSection");
    expect(modes).not.toContain("resetStorySession");
  });
});
