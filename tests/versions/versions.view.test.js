import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const versionsView = readFileSync(
  new URL("../../src/pages/versions/versions.view.yaml", import.meta.url),
  "utf8",
);

describe("versions view export actions", () => {
  it("shows loading before the settled empty-version state", () => {
    const loadingIndex = versionsView.indexOf("$if isVersionsLoading:");
    const emptyIndex = versionsView.indexOf("$elif versions.length == 0:");

    expect(loadingIndex).toBeGreaterThan(-1);
    expect(emptyIndex).toBeGreaterThan(loadingIndex);
    expect(versionsView).toContain("rtgl-text s=lg c=mu-fg: ${loadingMessage}");
  });

  it("renders a read-only confirmation dialog before exporting", () => {
    expect(versionsView).toContain(
      "rtgl-dialog#exportConfirmationDialog ?open=${isExportConfirmationOpen}",
    );
    expect(versionsView).toContain("rvn-detail-view#exportConfirmationDetail");
    expect(versionsView).toContain(
      "rtgl-button#exportConfirmationCancelButton",
    );
    expect(versionsView).toContain(
      "rtgl-button#exportConfirmationConfirmButton",
    );
    expect(versionsView).toContain("handler: handleExportConfirmationClose");
    expect(versionsView).toContain("handler: handleExportConfirmationConfirm");
  });

  it("renders gated Windows export actions in desktop and mobile details", () => {
    expect(
      versionsView.match(/\$if canExportWindowsExecutable:/g),
    ).toHaveLength(2);
    expect(versionsView.match(/rtgl-button#detailWindowsExeBtn/g)).toHaveLength(
      2,
    );
    expect(versionsView.match(/\$if canExportWindowsInstaller:/g)).toHaveLength(
      2,
    );
    expect(
      versionsView.match(/rtgl-button#detailWindowsInstallerBtn/g),
    ).toHaveLength(2);
  });

  it("renders gated macOS application actions in desktop and mobile details", () => {
    expect(versionsView.match(/\$if canExportMacosApplication:/g)).toHaveLength(
      2,
    );
    expect(
      versionsView.match(/rtgl-button#detailMacosApplicationBtn/g),
    ).toHaveLength(2);
  });
});
