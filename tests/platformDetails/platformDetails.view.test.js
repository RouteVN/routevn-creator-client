import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const platformDetailsView = readFileSync(
  new URL(
    "../../src/pages/platformDetails/platformDetails.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("platformDetails view", () => {
  it("uses a keyboard-operable button for adding or replacing the icon", () => {
    expect(platformDetailsView).toContain(
      "button#platformEditDialogIcon type=button",
    );
    expect(platformDetailsView).toContain(
      'aria-label="${clickToUploadLabel}"',
    );
  });
});
