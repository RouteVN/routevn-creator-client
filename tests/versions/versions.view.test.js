import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const versionsView = readFileSync(
  new URL("../../src/pages/versions/versions.view.yaml", import.meta.url),
  "utf8",
);

describe("versions view export actions", () => {
  it("hides Windows export actions from all detail layouts", () => {
    expect(versionsView).not.toContain("detailWindowsExeBtn");
    expect(versionsView).not.toContain("detailWindowsInstallerBtn");
    expect(versionsView).not.toContain("canExportWindowsExecutable");
    expect(versionsView).not.toContain("canExportWindowsInstaller");
  });

  it("hides macOS export actions from all detail layouts", () => {
    expect(versionsView).not.toContain("detailMacosApplicationBtn");
    expect(versionsView).not.toContain("canExportMacosApplication");
  });
});
