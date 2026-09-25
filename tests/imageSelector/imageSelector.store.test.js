import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";
import { getImageSelectorResources } from "../../src/internal/imageSelectorResources.js";
import {
  createInitialState,
  selectViewData,
  setImages,
} from "../../src/components/imageSelector/imageSelector.store.js";

const createImages = () => ({
  items: {
    "folder-1": {
      id: "folder-1",
      type: "folder",
      name: "Folder One",
    },
    "image-1": {
      id: "image-1",
      type: "image",
      name: "Image One",
    },
  },
  tree: [{ id: "folder-1", children: [{ id: "image-1" }] }],
});

describe("imageSelector.store", () => {
  it("shows character image and animated sprites in character and folder sections", () => {
    const sprite = {
      id: "sprite-1",
      type: "image",
      name: "Smile",
      fileId: "image-file",
      thumbnailFileId: "thumbnail-file",
    };
    const sheet = {
      id: "sheet-1",
      type: "spritesheet",
      name: "Blink",
      fileId: "sheet-file",
      jsonData: { frames: {} },
      animations: { idle: { frames: ["blink"], fps: 12 } },
    };
    const repositoryState = {
      images: createImages(),
      characters: {
        items: {
          "character-1": {
            id: "character-1",
            type: "character",
            name: "Character One",
            fileId: "profile-avatar",
            sprites: {
              items: {
                "sprite-1": sprite,
                faces: { id: "faces", type: "folder", name: "Faces" },
                "sheet-1": sheet,
              },
              tree: [
                { id: "sprite-1" },
                { id: "faces", children: [{ id: "sheet-1" }] },
              ],
            },
          },
          "character-2": {
            id: "character-2",
            type: "character",
            name: "Character Two",
          },
          cast: { id: "cast", type: "folder", name: "Cast" },
        },
        tree: [
          { id: "character-1" },
          { id: "cast", children: [{ id: "character-2" }] },
        ],
      },
    };
    expect(getImageSelectorResources(repositoryState)).toBe(
      repositoryState.images,
    );
    const state = createInitialState();
    setImages(
      { state },
      {
        images: getImageSelectorResources(
          repositoryState,
          "characterSprites",
          "character-1",
        ),
      },
    );
    const view = selectViewData({
      state,
      props: { resourceTarget: "characterSprites" },
      i18n: EN_I18N,
    });
    expect(view.imageSelectorLabel).toBe("Character Sprites");
    expect(view.groups.map((group) => group.fullLabel)).toEqual([
      "Character One",
      "Character One > Faces",
    ]);
    expect(view.groups[0].children[0]).toMatchObject({
      id: "sprite-1",
      thumbnailFileId: "thumbnail-file",
      preview: { kind: "image", fileId: "thumbnail-file" },
    });
    expect(view.groups[1].children[0].preview).toMatchObject({
      kind: "spritesheet",
      fileId: "sheet-file",
      atlas: sheet.jsonData,
      animation: sheet.animations.idle,
    });
    const html = renderViewYaml(
      "src/components/imageSelector/imageSelector.view.yaml",
      view,
    );
    expect(html).toContain('fileId="thumbnail-file"');
    expect(html).toContain("rvn-spritesheet-preview");
    expect(html).not.toContain("profile-avatar");
    const search = selectViewData({
      state,
      props: { resourceTarget: "characterSprites", searchQuery: "blink" },
      i18n: EN_I18N,
    });
    expect(
      search.groups.flatMap((group) => group.children.map((child) => child.id)),
    ).toEqual(["sheet-1"]);

    setImages(
      { state },
      { images: getImageSelectorResources(repositoryState, "characters") },
    );
    const charactersView = selectViewData({
      state,
      props: { resourceTarget: "characters" },
      i18n: EN_I18N,
    });
    expect(charactersView.imageSelectorLabel).toBe("Characters");
    expect(charactersView.groups.map((group) => group.fullLabel)).toEqual([
      "Characters",
      "Cast",
    ]);
    expect(
      charactersView.groups.flatMap((group) =>
        group.children.map((item) => item.id),
      ),
    ).toEqual(["character-1", "character-2"]);
    const characterHtml = renderViewYaml(
      "src/components/imageSelector/imageSelector.view.yaml",
      charactersView,
    );
    expect(characterHtml).toContain('fileId="profile-avatar"');
    expect(characterHtml).toContain("No Avatar");
    expect(characterHtml).not.toContain('fileId="thumbnail-file"');

    setImages(
      { state },
      {
        images: getImageSelectorResources(
          repositoryState,
          "characterSprites",
          "character-2",
        ),
      },
    );
    const emptyView = selectViewData({
      state,
      props: { resourceTarget: "characterSprites" },
      i18n: EN_I18N,
    });
    expect(emptyView.selectorEmptyMessage).toBe(
      EN_I18N.resourcePages.selectorEmptyMessage,
    );
    expect(emptyView.groups.flatMap((group) => group.children)).toEqual([]);
  });

  it("uses fixed card widths by default", () => {
    const state = createInitialState();
    setImages({ state }, { images: createImages() });

    const viewData = selectViewData({ state });

    expect(viewData.imageGridStyle).toBe("");
    expect(viewData.groups[0].children[0].imageCardStyle).toContain(
      "width: 200px",
    );
  });

  it("fills a requested two-column grid", () => {
    const state = createInitialState();
    setImages({ state }, { images: createImages() });

    const viewData = selectViewData({ state, props: { columns: 2 } });

    expect(viewData.imageGridStyle).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
    expect(viewData.groups[0].children[0].imageCardStyle).toContain(
      "width: 100%",
    );
  });
});
