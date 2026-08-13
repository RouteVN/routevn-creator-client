import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readView = (relativePath) =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), "utf8");

const RESOURCE_DIALOGS = [
  ["pages/animations/animations.view.yaml", ["addDialog", "editDialog"]],
  ["pages/audioEffects/audioEffects.view.yaml", ["addDialog", "editDialog"]],
  ["pages/characterSprites/characterSprites.view.yaml", ["editDialog"]],
  [
    "pages/characters/characters.view.yaml",
    ["addCharacterDialog", "editDialog"],
  ],
  ["pages/colors/colors.view.yaml", ["addColorDialog", "editDialog"]],
  ["pages/controls/controls.view.yaml", ["addControlDialog"]],
  ["pages/fonts/fonts.view.yaml", ["editDialog"]],
  ["pages/layouts/layouts.view.yaml", ["addLayoutDialog", "editDialog"]],
  ["pages/particles/particles.view.yaml", ["particleDialog"]],
  ["pages/sounds/sounds.view.yaml", ["editDialog"]],
  ["pages/spritesheets/spritesheets.view.yaml", ["spritesheetDialog"]],
  ["pages/transforms/transforms.view.yaml", ["transformDialog"]],
  ["pages/videos/videos.view.yaml", ["editDialog"]],
];

const RESOURCE_FORMS_WITH_EXTERNAL_SUBMIT = [
  [
    "pages/animations/animations.view.yaml",
    [
      ["addForm", "handleAddFormSubmitKeyDown"],
      ["editForm", "handleEditFormSubmitKeyDown"],
    ],
  ],
  [
    "pages/audioEffects/audioEffects.view.yaml",
    [
      ["addForm", "handleAddFormSubmitKeyDown"],
      ["editForm", "handleEditFormSubmitKeyDown"],
    ],
  ],
  [
    "pages/characterSprites/characterSprites.view.yaml",
    [
      ["editForm", "handleEditFormSubmitKeyDown"],
      ["spritesheetDialogForm", "handleSpritesheetDialogFormSubmitKeyDown"],
    ],
  ],
  [
    "pages/characters/characters.view.yaml",
    [
      ["characterForm", "handleCharacterFormSubmitKeyDown"],
      ["editForm", "handleEditFormSubmitKeyDown"],
    ],
  ],
  [
    "pages/colors/colors.view.yaml",
    [
      ["editForm", "handleEditFormSubmitKeyDown"],
      ["addColorForm", "handleAddFormSubmitKeyDown"],
    ],
  ],
  [
    "pages/controls/controls.view.yaml",
    [["controlForm", "handleControlFormSubmitKeyDown"]],
  ],
  [
    "pages/fonts/fonts.view.yaml",
    [["editForm", "handleEditFormSubmitKeyDown"]],
  ],
  [
    "pages/layouts/layouts.view.yaml",
    [
      ["layoutForm", "handleAddFormSubmitKeyDown"],
      ["editForm", "handleEditFormSubmitKeyDown"],
    ],
  ],
  [
    "pages/particles/particles.view.yaml",
    [["particleForm", "handleParticleFormSubmitKeyDown"]],
  ],
  [
    "pages/sounds/sounds.view.yaml",
    [["editForm", "handleEditFormSubmitKeyDown"]],
  ],
  [
    "pages/spritesheets/spritesheets.view.yaml",
    [["dialogForm", "handleDialogFormSubmitKeyDown"]],
  ],
  [
    "pages/textStyles/textStyles.view.yaml",
    [
      ["textStyleForm", "handleTextStyleFormSubmitKeyDown"],
      ["addColorForm", "handleAddColorFormSubmitKeyDown"],
      ["addFontForm", "handleAddFontFormSubmitKeyDown"],
    ],
  ],
  [
    "pages/transforms/transforms.view.yaml",
    [["transformForm", "handleTransformFormSubmitKeyDown"]],
  ],
  [
    "pages/videos/videos.view.yaml",
    [["editForm", "handleEditFormSubmitKeyDown"]],
  ],
];

const selectRefBlock = (view, refName) => {
  const lines = view.split("\n");
  const start = lines.findIndex((line) => line === `  ${refName}:`);
  const end = lines.findIndex(
    (line, index) => index > start && /^  \S/.test(line),
  );
  return lines.slice(start, end === -1 ? lines.length : end).join("\n");
};

describe("resource add/edit dialog layout", () => {
  it("uses form-owned scrolling and actions for the image editor", () => {
    const view = readView("pages/images/images.view.yaml");
    const dialogLine = view
      .split("\n")
      .find((line) => line.includes("rtgl-dialog#editDialog "));

    expect(dialogLine).toContain("md-layout=fixed-top");
    expect(dialogLine).toContain("p=none");
    expect(view).toContain(
      "rtgl-view slot=content d=v w=f h=f overflow=hidden:",
    );
    expect(view).toContain(
      "rtgl-form#editForm key=${isEditDialogOpen} :defaultValues=${editDefaultValues} :form=${editForm} w=f h=f:",
    );
    expect(view).not.toContain("editImageSubmitButton");
    expect(view).not.toContain("h=80 aria-hidden=true");
  });

  it.each(RESOURCE_DIALOGS)(
    "uses fixed-top dialogs with app-owned scrolling and actions in %s",
    (relativePath, dialogIds) => {
      const view = readView(relativePath);

      for (const dialogId of dialogIds) {
        const dialogLine = view
          .split("\n")
          .find((line) => line.includes(`rtgl-dialog#${dialogId} `));
        expect(dialogLine).toContain("md-layout=fixed-top");
        expect(dialogLine).toContain("p=none");
      }

      expect(view).toContain('style="min-height: 0;"');
      expect(view).toContain('h=80 aria-hidden=true style="flex: 0 0 80px;"');
      expect(view).toContain('style="flex: 0 0 auto;"');
    },
  );

  it("uses the same pattern for text-style and variable editors", () => {
    const textStylesView = readView("pages/textStyles/textStyles.view.yaml");
    const variablesView = readView(
      "components/groupVariablesView/groupVariablesView.view.yaml",
    );

    for (const dialogId of [
      "addTypographyDialog",
      "addColorDialog",
      "addFontDialog",
    ]) {
      expect(textStylesView).toContain(`rtgl-dialog#${dialogId} ?open=\${`);
    }
    expect(textStylesView.match(/md-layout=fixed-top p=none/g)).toHaveLength(3);
    expect(textStylesView).toContain("rtgl-button#mobileTextStyleSubmitButton");
    expect(textStylesView).toContain("rtgl-button#addColorSubmitButton");
    expect(textStylesView).toContain("rtgl-button#addFontSubmitButton");

    expect(variablesView).toContain(
      "rtgl-dialog#variableDialog s=md md-layout=fixed-top p=none",
    );
    expect(variablesView).toContain(
      "rtgl-dialog#computedDialog s=lg md-layout=fixed-top p=none",
    );
    expect(variablesView).toContain("rtgl-button#variableSubmitButton");
    expect(variablesView).toContain("rtgl-button#computedSubmitButton");
  });

  it("uses one consistent padding layer for the transform form and preview", () => {
    const view = readView("pages/transforms/transforms.view.yaml");

    expect(view).toContain("rtgl-view d=h lg-d=v ah=c g=lg w=f:");
    expect(view).toContain(
      "rtgl-form#transformForm :defaultValues=${dialogDefaultValues} :form=${transformForm} w=f ph=md",
    );
    expect(view).toContain("rtgl-view w=6fg lg-w=f d=v g=md p=md:");
    expect(view).not.toContain("rtgl-view d=h lg-d=v ah=c g=lg w=f ph=md:");
  });

  it.each(RESOURCE_FORMS_WITH_EXTERNAL_SUBMIT)(
    "preserves Enter submission for resource forms in %s",
    (relativePath, forms) => {
      const view = readView(relativePath);

      for (const [formRef, handler] of forms) {
        expect(selectRefBlock(view, formRef)).toContain(
          `keydown:\n        handler: ${handler}`,
        );
      }
    },
  );
});
