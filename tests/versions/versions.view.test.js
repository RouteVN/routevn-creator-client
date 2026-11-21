import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const versionsView = readFileSync(
  new URL("../../src/pages/versions/versions.view.yaml", import.meta.url),
  "utf8",
);

describe("versions view export actions", () => {
  it("renders a labeled create-version button", () => {
    expect(versionsView).toContain("rtgl-button#saveVersionBtn v=pr pre=plus");
    expect(versionsView).toContain(
      'aria-label="${createButton}"\': ${createButton}',
    );
    expect(versionsView).not.toContain("rtgl-button#saveVersionBtn v=pr sq");
  });

  it("uses the image-style dialog and sticky version form", () => {
    expect(versionsView).toContain("$if isVersionDialogOpen:");
    expect(versionsView).toContain(
      "rtgl-dialog#versionDialog ?open=${isVersionDialogOpen} s=md md-layout=fixed-top:",
    );
    expect(versionsView).toContain(
      "rtgl-view slot=content d=v w=f h=f overflow=hidden:",
    );
    // Check the sticky layout attributes on the form's line, so other
    // attributes can be added to the form without breaking this test.
    const versionFormLine = versionsView
      .split("\n")
      .find((line) =>
        line.includes(
          "rtgl-form#versionForm key=${isVersionDialogOpen} :form=${versionForm} ",
        ),
      );
    expect(versionFormLine).toContain(" sticky ");
    expect(versionFormLine).toContain("bottom-spacer=96");
    expect(versionFormLine).toContain("w=f h=f");
  });

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
    expect(versionsView).not.toContain(
      "rtgl-button#exportConfirmationCancelButton",
    );
    expect(versionsView).toContain(
      "rtgl-button#exportConfirmationConfirmButton",
    );
    expect(versionsView).toContain("rtgl-view w=f d=h ah=e av=c g=sm wrap");
    expect(versionsView).toContain("handler: handleExportConfirmationClose");
    expect(versionsView).toContain("handler: handleExportConfirmationConfirm");
  });

  it("hosts the platform details create form in a dialog", () => {
    expect(versionsView).toContain("$if isPlatformDetailsDialogOpen:");
    expect(versionsView).toContain(
      "rtgl-dialog#platformDetailsDialog ?open=${isPlatformDetailsDialogOpen}",
    );
    expect(versionsView).toContain(
      "rvn-platform-details-create-dialog#platformDetailsCreateDialog :platform=${platformDetailsDialogPlatform} :applicationInfo=${platformDetailsDialogApplicationInfo}",
    );
    expect(versionsView).toContain("handler: handlePlatformDetailsDialogClose");
    expect(versionsView).toContain("handler: handlePlatformDetailsCreated");
  });

  it("offers one Export button in the desktop and mobile details", () => {
    expect(
      versionsView.match(
        /rtgl-button#detailExportBtn data-version-id="\$\{selectedItemId\}"/g,
      ),
    ).toHaveLength(2);
    expect(versionsView).toContain("handler: handleExportClick");
    expect(versionsView).not.toContain("detailDownloadBtn");
    expect(versionsView).not.toContain("detailWindowsExeBtn");
  });

  it("lists the export options as a grid of boxes in a dialog", () => {
    expect(versionsView).toContain(
      "rtgl-dialog#exportOptionsDialog ?open=${isExportOptionsOpen} s=md:",
    );
    expect(versionsView).toContain("$for option, i in exportOptions:");
    expect(versionsView).toContain(
      'rtgl-view#exportOptionRef${i} data-export-option="${option.id}" data-version-id="${exportOptionsVersionId}"',
    );
    expect(versionsView).toContain("rtgl-svg svg=${option.icon} wh=56");
    expect(versionsView).toContain("handler: handleExportOptionClick");
    expect(versionsView).toContain("handler: handleExportOptionsClose");
  });

  it("offers the Windows installer as a second button of the confirmation", () => {
    expect(versionsView).toContain("$if showWindowsInstallerButton:");
    expect(versionsView).toContain(
      "rtgl-button#exportConfirmationInstallerButton v=se pre=download: ${exportWindowsInstallerButton}",
    );
    expect(versionsView).toContain(
      "handler: handleExportConfirmationInstallerClick",
    );
  });
});
