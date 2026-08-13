import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readView = (relativePath) =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), "utf8");

const SIMPLE_RESOURCE_DIALOGS = [
  [
    "pages/animations/animations.view.yaml",
    "pages/animations/animations.store.js",
    ["addDialog", "editDialog"],
    [
      ["addForm", "handleAddFormAction"],
      ["editForm", "handleEditFormAction"],
    ],
  ],
  [
    "pages/audioEffects/audioEffects.view.yaml",
    "pages/audioEffects/audioEffects.store.js",
    ["addDialog", "editDialog"],
    [
      ["addForm", "handleAddFormAction"],
      ["editForm", "handleEditFormAction"],
    ],
  ],
  [
    "pages/characterSprites/characterSprites.view.yaml",
    "pages/characterSprites/characterSprites.store.js",
    ["editDialog"],
    [["editForm", "handleEditFormAction"]],
  ],
  [
    "pages/characters/characters.view.yaml",
    "pages/characters/characters.store.js",
    ["addCharacterDialog", "editDialog"],
    [
      ["characterForm", "handleDialogFormActionClick"],
      ["editForm", "handleEditFormAction"],
    ],
  ],
  [
    "pages/colors/colors.view.yaml",
    "pages/colors/colors.store.js",
    ["addColorDialog", "editDialog"],
    [
      ["addColorForm", "handleAddFormAction"],
      ["editForm", "handleEditFormAction"],
    ],
  ],
  [
    "pages/controls/controls.view.yaml",
    "pages/controls/controls.store.js",
    ["addControlDialog"],
    [["controlForm", "handleControlFormActionClick"]],
  ],
  [
    "pages/fonts/fonts.view.yaml",
    "pages/fonts/fonts.store.js",
    ["editDialog"],
    [["editForm", "handleEditFormAction"]],
  ],
  [
    "pages/images/images.view.yaml",
    "pages/images/images.store.js",
    ["editDialog"],
    [["editForm", "handleEditFormAction"]],
  ],
  [
    "pages/layouts/layouts.view.yaml",
    "pages/layouts/layouts.store.js",
    ["addLayoutDialog", "editDialog"],
    [
      ["layoutForm", "handleLayoutFormActionClick"],
      ["editForm", "handleEditFormActionClick"],
    ],
  ],
  [
    "pages/sounds/sounds.view.yaml",
    "pages/sounds/sounds.store.js",
    ["editDialog"],
    [["editForm", "handleEditFormAction"]],
  ],
  [
    "pages/videos/videos.view.yaml",
    "pages/videos/videos.store.js",
    ["editDialog"],
    [["editForm", "handleEditFormAction"]],
  ],
];

const SPECIALIZED_RESOURCE_DIALOGS = [
  ["pages/characterSprites/characterSprites.view.yaml", ["spritesheetDialog"]],
  ["pages/particles/particles.view.yaml", ["particleDialog"]],
  ["pages/spritesheets/spritesheets.view.yaml", ["spritesheetDialog"]],
  ["pages/transforms/transforms.view.yaml", ["transformDialog"]],
];

const RESOURCE_FORMS_WITH_EXTERNAL_SUBMIT = [
  [
    "pages/characterSprites/characterSprites.view.yaml",
    [["spritesheetDialogForm", "handleSpritesheetDialogFormSubmitKeyDown"]],
  ],
  [
    "pages/particles/particles.view.yaml",
    [["particleForm", "handleParticleFormSubmitKeyDown"]],
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
  it.each(SIMPLE_RESOURCE_DIALOGS)(
    "uses native sticky form actions in %s",
    (relativePath, storePath, dialogIds, forms) => {
      const view = readView(relativePath);
      const store = readView(storePath);

      for (const dialogId of dialogIds) {
        const dialogLine = view
          .split("\n")
          .find((line) => line.includes(`rtgl-dialog#${dialogId} `));
        expect(dialogLine).toContain("md-layout=fixed-top");
        expect(dialogLine).not.toContain(" p=");
      }

      for (const [formRef, handler] of forms) {
        const formLine = view
          .split("\n")
          .find((line) => line.includes(`rtgl-form#${formRef} `));
        expect(formLine).toContain(" sticky ");
        expect(formLine).toContain("bottom-spacer=96");
        expect(formLine).toContain("w=f h=f");
        expect(selectRefBlock(view, formRef)).toContain(
          `form-action:\n        handler: ${handler}`,
        );
      }

      expect(
        view.match(/slot=content d=v w=f h=f overflow=hidden:/g),
      ).toHaveLength(dialogIds.length);
      expect(store).not.toContain("sticky: true");
    },
  );

  it.each(SPECIALIZED_RESOURCE_DIALOGS)(
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
