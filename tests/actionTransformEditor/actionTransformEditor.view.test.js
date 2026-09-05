import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/actionTransformEditor/actionTransformEditor.store.js";

describe("actionTransformEditor view", () => {
  it.each([false, true])(
    "uses layout-editor canvas framing in touch mode %s",
    (isTouchMode) => {
      const view = yaml.load(
        readFileSync(
          new URL(
            "../../src/components/actionTransformEditor/actionTransformEditor.view.yaml",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const viewData = selectViewData({
        state: { ...createInitialState(), isTouchMode },
        props: {},
      });
      const template = JSON.stringify(parseAndRender(view.template, viewData));

      expect(template).toContain("#actionTransformCanvasBackground");
      expect(template).toContain(
        "background-image: radial-gradient(circle, var(--input) 1px, transparent 1px)",
      );
      expect(template).toContain("background-size: 24px 24px");
      expect(template).toContain(
        "#actionTransformCanvasFrame bwl=xs bwr=xs bc=bo",
      );
      expect(template).toContain(
        "rvn-scene-editor-preview-canvas#actionTransformCanvasHost",
      );
    },
  );

  it("leaves canvas pointer interaction to the graphics selection chrome", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/actionTransformEditor/actionTransformEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "rvn-scene-editor-preview-canvas#actionTransformCanvasHost",
    );
    expect(view).not.toContain("backgroundDragSurface");
    expect(view).not.toContain("handler: handleBackgroundPointerDown");
  });
});
