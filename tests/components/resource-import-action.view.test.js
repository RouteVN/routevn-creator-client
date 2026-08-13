import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync(
  new URL(
    "../../src/components/resourceImportAction/resourceImportAction.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("resourceImportAction.view", () => {
  it("renders a three-dot Import menu and the package import dialog", () => {
    expect(viewSource).toContain("rtgl-button#menuButton sq pre=ellipsis v=ol");
    expect(viewSource).toContain("rtgl-dropdown-menu#menu");
    expect(viewSource).toContain("rvn-resource-import-dialog#importDialog");
  });
});
