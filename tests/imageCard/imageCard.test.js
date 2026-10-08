import { describe, expect, it } from "vitest";
import { selectViewData } from "../../src/components/imageCard/imageCard.store.js";
import { renderViewYaml } from "../support/renderView.js";

const TEMPLATE = "src/components/imageCard/imageCard.view.yaml";
const render = (props) =>
  renderViewYaml(TEMPLATE, selectViewData({ state: {}, props }));

describe("rvn-image-card", () => {
  it("shows the image on a 16:9 transparency grid with its name below", () => {
    const html = render({ imageId: "image-1", name: "Arrow" });

    expect(html).toContain('class="imageCardTransparencyGrid"');
    expect(html).toContain('imageId="image-1"');
    expect(html).toContain('source="thumbnail"');
    expect(html.indexOf('imageId="image-1"')).toBeLessThan(
      html.indexOf(">Arrow<"),
    );
  });

  it("shows an image by its file id", () => {
    expect(render({ fileId: "file-1", name: "Arrow" })).toContain(
      'fileId="file-1"',
    );
  });

  it("shows a slotted preview, such as a spritesheet, when it has no image", () => {
    const html = render({ hasPreview: true, name: "Sparks / idle" });

    expect(html).toContain('<slot name="preview">');
    expect(html).not.toContain("rvn-file-image");
    expect(html).toContain(">Sparks / idle<");
  });

  it("shows the empty label without an image, and no name row without a name", () => {
    const html = render({ emptyLabel: "Select image" });

    expect(html).toContain(">Select image<");
    expect(html).toContain("aspect-ratio: 16 / 9;");
    expect(html).not.toContain("imageCardTransparencyGrid");
    expect(html).not.toContain('ellipsis="true"');
  });
});
