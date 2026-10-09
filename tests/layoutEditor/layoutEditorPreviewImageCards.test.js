import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  createInitialState,
  selectViewData,
  setDialogueDefaultValue,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";

const EMPTY_COLLECTION = { items: {}, tree: [] };
const TEST_CONSTANTS = {
  dialogueForm: { fields: [] },
  nvlForm: { fields: [] },
  choiceForm: { fields: [] },
  historyForm: { fields: [] },
  saveLoadForm: { fields: [] },
};

const createState = () => {
  const state = createInitialState();
  state.layoutState = {
    id: "layout-1",
    layoutType: "dialogue-adv",
    elements: EMPTY_COLLECTION,
  };
  state.repositoryState = {
    images: {
      items: {
        "image-1": {
          id: "image-1",
          type: "image",
          name: "Classroom",
          fileId: "file-1",
        },
      },
      tree: [{ id: "image-1" }],
    },
    characters: {
      items: {
        "character-1": {
          id: "character-1",
          type: "character",
          name: "Character One",
          sprites: {
            items: {
              "sprite-1": {
                id: "sprite-1",
                type: "image",
                name: "Smile",
                fileId: "file-2",
              },
            },
            tree: [{ id: "sprite-1" }],
          },
        },
      },
      tree: [{ id: "character-1" }],
    },
  };
  return state;
};

const view = readFileSync(
  new URL(
    "../../src/components/layoutEditorPreview/layoutEditorPreview.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("layoutEditorPreview image cards", () => {
  it("names the picked background image and character avatar", () => {
    const state = createState();
    expect(
      selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N }),
    ).toMatchObject({
      previewBackgroundImageName: "",
      characterAvatarName: "",
    });

    state.previewBackgroundImageId = "image-1";
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-id", fieldValue: "sprite-1" },
    );

    expect(
      selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N }),
    ).toMatchObject({
      previewBackgroundImageName: "Classroom",
      characterAvatarName: "Smile",
    });
  });

  it("shows every Background box, and the Character Avatar, as an image card", () => {
    const backgroundCard =
      '- \'rvn-image-card imageId=${previewBackgroundImageId} name="${previewBackgroundImageName}" emptyLabel="${i18n.layoutEditorPage.previewBackgroundPlaceholder}"\': null';
    const backgroundFields = view.split(
      "- 'rtgl-view#previewBackgroundField cur=pointer style=\"width: calc((100% - var(--spacing-lg)) / 2);\"':\n",
    );
    expect(backgroundFields).toHaveLength(9);
    for (const field of backgroundFields.slice(1)) {
      expect(field.trimStart().startsWith(backgroundCard)).toBe(true);
    }

    const avatarBlock = view.slice(
      view.indexOf("rtgl-view#characterAvatarField"),
      view.indexOf(
        "rtgl-view slot=${previewBackgroundSlot}",
        view.indexOf("rtgl-view#characterAvatarField"),
      ),
    );
    expect(avatarBlock).toContain(
      'rvn-image-card :hasPreview=${true} name="${characterAvatarName}"',
    );
    expect(avatarBlock).toContain(
      'rvn-image-card fileId=${characterAvatarThumbnailFileId} name="${characterAvatarName}" emptyLabel="${i18n.layoutEditorPage.previewCharacterAvatarPlaceholder}"',
    );
    expect(view).not.toContain("Select image");
    expect(
      view.split("rtgl-view slot=${previewBackgroundSlot} w=f g=xs:"),
    ).toHaveLength(9);
  });
});
