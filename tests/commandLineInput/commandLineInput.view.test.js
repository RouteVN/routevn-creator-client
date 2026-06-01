import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineInput view", () => {
  it("uses stable string field ids in input field row dataset attributes", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineInput/commandLineInput.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("$for fieldRow, index in fieldRows:");
    expect(view).toContain('data-field="${fieldRow.field}"');
    expect(view).not.toContain("$for field, index in fieldRows:");
    expect(view).not.toContain("data-field=${field.field}");
  });

  it("does not show submit action choices", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineInput/commandLineInput.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).not.toContain("Submit Action");
    expect(view).not.toContain("Move to Section");
  });
});
