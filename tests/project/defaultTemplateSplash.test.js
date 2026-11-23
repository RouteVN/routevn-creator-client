import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertSupportedProjectState } from "../../src/deps/services/shared/projectRepository.js";
import { scaleTemplateProjectStateForResolution } from "../../src/internal/projectResolution.js";

const repository = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);
const templateFileIds = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/files/files.json", import.meta.url),
    "utf8",
  ),
).files;

const findItemByName = (collection, name) =>
  Object.values(collection.items).find((item) => item.name === name);

const selectSplash = (state = repository) => {
  const scene = state.scenes.items[state.story.initialSceneId];
  const [section] = Object.values(scene.sections.items);
  const [showLogo, openTitle] = section.lines.tree.map(
    ({ id }) => section.lines.items[id],
  );
  return { scene, section, showLogo, openTitle };
};

describe("default template splash screen", () => {
  it("starts the story with the splash screen, first in the Scenes folder", () => {
    const { scene, section } = selectSplash();
    const scenesFolder = findItemByName(repository.scenes, "Scenes");
    const folderNode = repository.scenes.tree.find(
      ({ id }) => id === scenesFolder.id,
    );

    expect(scene).toMatchObject({ type: "scene", name: "Splash Screen" });
    expect(scene.description).toContain("Replace the logo");
    expect(folderNode.children.map(({ id }) => id)).toEqual([
      scene.id,
      findItemByName(repository.scenes, "Title").id,
      findItemByName(repository.scenes, "Prologue").id,
    ]);
    expect(section.lines.tree).toHaveLength(2);
  });

  it("fades the RouteVN logo in and out over black, then moves on by itself", () => {
    const { showLogo } = selectSplash();
    const { dialogue, control, background, visual, setNextLineConfig } =
      showLogo.actions;
    const [logo, black] = visual.items;
    const elementOf = (item) => Object.values(item.layout.elements.items)[0];
    const logoImage = repository.images.items[elementOf(logo).imageId];
    const blackImage = repository.images.items[elementOf(black).imageId];
    const fade = repository.animations.items[logo.animations.resourceId];

    expect(dialogue.clear).toBe(true);
    expect(control).toEqual({});
    expect(background).toEqual({});
    // The logo is centered, over the full-screen black.
    expect(logo.layer).toBeGreaterThan(black.layer);
    expect(elementOf(logo)).toMatchObject({
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      width: logoImage.width,
      height: logoImage.height,
    });
    expect(elementOf(black)).toMatchObject({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(logoImage).toMatchObject({ name: "routevn_logo", width: 960 });
    expect(blackImage).toMatchObject({
      name: "black_background",
      width: 1920,
      height: 1080,
    });
    expect(fade).toMatchObject({
      name: "Fade in and out 4s",
      animation: { type: "update" },
    });
    expect(logo.animations.playback.loop).toBe(false);
    // The next line follows once the fade completes, not on a click.
    expect(setNextLineConfig).toMatchObject({
      manual: { enabled: false },
      auto: { enabled: true, trigger: "fromComplete" },
    });
  });

  it("opens the Title scene with a crossfade", () => {
    const { openTitle } = selectSplash();
    const title = findItemByName(repository.scenes, "Title");
    const crossfade = findItemByName(repository.animations, "Crossfade");

    expect(openTitle.actions.sectionTransition).toEqual({
      sceneId: title.id,
      sectionId: title.sections.tree[0].id,
      screen: {
        animations: {
          resourceId: crossfade.id,
          playback: { continuity: "render", speed: 3 },
        },
      },
    });
  });

  it("ships the splash images as template files", () => {
    const { showLogo } = selectSplash();
    for (const item of showLogo.actions.visual.items) {
      const [element] = Object.values(item.layout.elements.items);
      const image = repository.images.items[element.imageId];
      const record = repository.files.items[image.fileId];
      const bytes = readFileSync(
        new URL(
          `../../static/templates/default/files/${image.fileId}`,
          import.meta.url,
        ),
      );

      expect(templateFileIds).toContain(image.fileId);
      expect(record).toEqual({
        id: image.fileId,
        type: "image",
        mimeType: "image/png",
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  });

  it("keeps the logo centered at another resolution", () => {
    const scaled = scaleTemplateProjectStateForResolution(repository, {
      width: 1280,
      height: 720,
    });
    assertSupportedProjectState(scaled);

    const [logo, black] = selectSplash(scaled).showLogo.actions.visual.items;
    const elementOf = (item) => Object.values(item.layout.elements.items)[0];
    expect(elementOf(logo)).toMatchObject({
      x: 640,
      y: 360,
      width: 640,
      height: 142,
    });
    expect(elementOf(black)).toMatchObject({ width: 1280, height: 720 });
  });
});
