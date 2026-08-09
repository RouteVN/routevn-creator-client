import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("asset package view", () => {
  it("shows the description above the create package action", () => {
    const assetPackageView = readFileSync(
      new URL(
        "../../src/pages/assetPackage/assetPackage.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(assetPackageView).toContain("rvn-resource-types");
    expect(assetPackageView).toContain(
      ":selectedResourceId=${selectedResourceId}",
    );
    expect(assetPackageView.indexOf("${description}")).toBeLessThan(
      assetPackageView.indexOf("rtgl-button#createPackageButton"),
    );
    expect(assetPackageView).toContain("rtgl-button#createPackageButton");
  });

  it("renders a dialog form with a full-width plus button and resource menu", () => {
    const assetPackageView = readFileSync(
      new URL(
        "../../src/pages/assetPackage/assetPackage.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(assetPackageView).toContain("rtgl-dialog#createPackageDialog");
    expect(assetPackageView).toContain("rtgl-form#createPackageForm");
    expect(assetPackageView).toContain(
      "rtgl-button#addPackageResourceButton w=f v=ol pre=plus",
    );
    expect(assetPackageView).toContain("rtgl-dropdown-menu#resourceTypeMenu");
    expect(assetPackageView).toContain("rtgl-dialog#folderNameDialog");
    expect(assetPackageView).toContain("rtgl-form#folderNameForm");
  });

  it("uses the Layout Editor image selector flow and renders selected images", () => {
    const assetPackageView = readFileSync(
      new URL(
        "../../src/pages/assetPackage/assetPackage.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(assetPackageView).toContain("rtgl-dialog#imageSelectorDialog");
    expect(assetPackageView).toContain(
      "rvn-base-file-explorer#baseFileExplorer",
    );
    expect(assetPackageView).toContain("rvn-image-selector#imageSelector");
    expect(assetPackageView).toContain("$for section, i in resourceSections");
    expect(assetPackageView).toContain("${section.name}");
    expect(assetPackageView).toContain("${section.typeLabel}");
    expect(assetPackageView).toContain('$if section.type == "images"');
    expect(assetPackageView).toContain(
      "rtgl-view w=f d=h av=s g=md p=md bgc=bg bw=xs bc=bo br=md",
    );
    expect(assetPackageView).toContain("rtgl-view w=160 h=90");
    expect(assetPackageView).toContain("${image.title}");
    expect(assetPackageView).toContain("${image.description}");
    expect(assetPackageView).toContain("rtgl-view w=f d=v g=md:");
    expect(assetPackageView).not.toContain(
      "rtgl-view w=f d=v g=md p=md bw=xs bc=bo br=md",
    );
    expect(assetPackageView).toContain("rtgl-button#addSectionImageButton${i}");
    expect(assetPackageView).toContain(
      "rvn-file-image imageId=${image.imageId} source=thumbnail",
    );
    expect(assetPackageView).toContain("rtgl-button#confirmImageSelection");
  });
});
