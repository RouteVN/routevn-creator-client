import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("animations view", () => {
  it("uses the shared resource import action", () => {
    const animationsView = readFileSync(
      new URL(
        "../../src/pages/animations/animations.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const catalogView = readFileSync(
      new URL(
        "../../src/components/catalogResourcesView/catalogResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(animationsView).not.toContain("import-in-actions-menu");
    expect(catalogView).toContain("rvn-resource-import-action");
  });

  it("passes property defaults to every catalog timeline with curves", () => {
    const catalogView = readFileSync(
      new URL(
        "../../src/components/catalogResourcesView/catalogResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    expect(
      catalogView.match(/:defaultValues=\$\{item\.timelineDefaultValues\}/g),
    ).toHaveLength(3);
    expect(catalogView).toContain(
      "$for maskTimelineRow in item.maskTimelineRows",
    );
    expect(catalogView).toContain(
      ":properties=${maskTimelineRow.properties} :defaultValues=${item.maskTimelineDefaultValues}",
    );
  });

  it("uses edit, duplicate, and delete icons in the mobile detail sheet", () => {
    const animationsView = readFileSync(
      new URL(
        "../../src/pages/animations/animations.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const mobileDetailStart = animationsView.indexOf(
      "$if showMobileDetailSheet",
    );
    const folderDialogStart = animationsView.indexOf(
      "rtgl-dialog#folderNameDialog",
      mobileDetailStart,
    );
    const mobileDetailBranch = animationsView.slice(
      mobileDetailStart,
      folderDialogStart,
    );

    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailOpenButton w=1fg v=se pre=edit: ${editButton}",
    );
    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailDuplicateButton w=1fg v=se pre=duplicate: ${duplicateButton}",
    );
    expect(mobileDetailBranch).toContain(
      "rtgl-button#mobileDetailDeleteButton w=1fg v=se pre=trash: ${deleteButton}",
    );
    expect(mobileDetailBranch).not.toContain(
      "rtgl-button#mobileDetailOpenButton w=1fg v=se: ${openButton}",
    );
  });
});
