import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const versionsView = readFileSync(
  new URL("../../src/pages/versions/versions.view.yaml", import.meta.url),
  "utf8",
);

describe("versions view export actions", () => {
  it("renders gated Windows installer actions in desktop and mobile details", () => {
    expect(versionsView.match(/\$if canExportWindowsInstaller:/g)).toHaveLength(
      2,
    );
    expect(
      versionsView.match(/rtgl-button#detailWindowsInstallerBtn/g),
    ).toHaveLength(2);
    expect(
      versionsView.match(/\$\{exportWindowsInstallerButton\}/g),
    ).toHaveLength(2);
  });
});
