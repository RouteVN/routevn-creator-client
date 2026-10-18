import { describe, expect, it } from "vitest";
import {
  formatCommandLineActionCount,
  localizeCommandLineForm,
  selectCommandLineCopy,
} from "../../src/internal/ui/sceneEditor/commandLineCopy.js";
import { EN_I18N, RU_I18N } from "../support/i18n.js";

describe("command-line action counts", () => {
  it("picks the singular or plural English template", () => {
    const copy = selectCommandLineCopy(EN_I18N);

    expect(formatCommandLineActionCount(1, copy)).toBe("1 action");
    expect(formatCommandLineActionCount(3, copy)).toBe("3 actions");
  });

  it("lets the catalog place the count", () => {
    const copy = selectCommandLineCopy(RU_I18N);

    expect(formatCommandLineActionCount(1, copy)).toBe("Действий: 1");
    expect(formatCommandLineActionCount(21, copy)).toBe("Действий: 21");
  });
});

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
