import { describe, expect, it } from "vitest";
import { localizeCommandLineForm } from "../../src/internal/ui/sceneEditor/commandLineCopy.js";

describe("command-line form layout", () => {
  it("stacks form rows at the large breakpoint by default", () => {
    const form = localizeCommandLineForm({
      fields: [
        {
          type: "row",
          fields: [
            { name: "first", type: "input-text" },
            { name: "second", type: "input-text" },
          ],
        },
        {
          type: "row",
          stackAt: "sm",
          fields: [
            { name: "third", type: "input-text" },
            { name: "fourth", type: "input-text" },
          ],
        },
      ],
    });

    expect(form.rowStackAt).toBe("lg");
    expect(form.fields[1].stackAt).toBe("sm");
  });
});
