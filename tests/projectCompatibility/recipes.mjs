import { fixtureAssets } from "./assets.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
const preparation = "docs/validation-preparation/fixtures";
const json = (path) =>
  JSON.parse(readFileSync(join(preparation, path), "utf8"));
const command = (type, payload) => ({ type, payload });
const fromScenario = (name) =>
  json(`scenarios/${name}.json`).records.map((row) =>
    command(row.type, row.payload.commandPayload ?? row.payload),
  );

export function createRecipes() {
  const setup = json("seeds/project-one.setup.json").commands;
  const seed = json("seeds/project-one.state.json");
  const sprite = fromScenario("character-spritesheet-adapter");
  const atlas = json("scenarios/ordered-identity.json").baseRecord.payload
    .commandPayload;
  const transform = command("transform.create", {
    transformId: "transform-one",
    data: {
      type: "transform",
      name: "Transform One",
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
    },
  });
  const recipes = [];
  const add = (
    id,
    commands,
    {
      schema = 14,
      initialState,
      histories = ["draft", "mixed"],
      ...details
    } = {},
  ) => {
    for (const history of histories) {
      const recipe = {
        protocol: 1,
        id: `${id}-${history}`,
        schema,
        history,
        commands,
        ...details,
      };
      if (initialState) {
        recipe.initialState = structuredClone(initialState);
        recipe.initialState.project.resolution = { width: 1920, height: 1080 };
      }
      recipes.push(recipe);
    }
  };
  add(
    "P01",
    [
      ...setup.slice(0, 6),
      command("story.update", { data: { initialSceneId: "scene-one" } }),
      command("line.create", {
        sectionId: "section-two",
        lines: [
          {
            lineId: "line-three",
            data: { actions: { dialogue: { content: [{ text: "Third" }] } } },
          },
        ],
      }),
      command("line.update_actions", {
        lineId: "line-two",
        data: {
          sectionTransition: { sceneId: "scene-two", sectionId: "section-two" },
        },
      }),
    ],
    { histories: ["draft", "committed", "mixed"] },
  );
  const cross = yaml.load(
    readFileSync(
      join(
        preparation,
        "legacy/schema-14/states/cross-referenced-project.yaml",
      ),
      "utf8",
    ),
  ).state;
  add(
    "P02",
    [
      command("section.update", {
        sectionId: "section-a",
        data: { name: "Section One" },
      }),
    ],
    { initialState: cross },
  );
  const assetFiles = fixtureAssets();
  const mediaCommands = [
    ...setup.slice(0, 6),
    ...assetFiles.map(({ id, mimeType, size, sha256 }) =>
      command("file.create", { fileId: id, data: { mimeType, size, sha256 } }),
    ),
    command("image.create", {
      imageId: "image-one",
      data: {
        type: "image",
        name: "Image One",
        fileId: "file-one",
        width: 32,
        height: 16,
      },
    }),
    command("sound.create", {
      soundId: "sound-one",
      data: {
        type: "sound",
        name: "Sound One",
        fileId: "sound-file-one",
        duration: 0.05,
      },
    }),
    command("font.create", {
      fontId: "font-one",
      data: {
        type: "font",
        name: "Font One",
        fileId: "font-file-one",
        fontFamily: "Noto Sans",
        minWeight: 100,
        maxWeight: 900,
        defaultWeight: 400,
      },
    }),
    command("color.create", {
      colorId: "color-one",
      data: { type: "color", name: "Color One", hex: "#ffffff" },
    }),
    command("textStyle.create", {
      textStyleId: "text-style-one",
      data: {
        type: "textStyle",
        name: "Text Style One",
        fontId: ["font-one"],
        colorId: "color-one",
        fontSize: 32,
        lineHeight: 1.4,
        fontWeight: "400",
      },
    }),
    command("line.update_actions", {
      lineId: "line-one",
      data: {
        background: { resourceId: "image-one" },
        dialogue: { content: [{ text: "Project One" }] },
      },
    }),
  ];
  add("P02-media", mediaCommands, { assetFiles });
  add("P03", [
    ...setup.slice(0, 6),
    command("line.update_actions", {
      lineId: "line-one",
      data: {
        dialogue: { content: 42 },
        legacyAction: { extra: "preserve me" },
      },
    }),
    command("line.update_actions", {
      lineId: "line-two",
      data: { dialogue: { content: [{ text: "Still editable" }] } },
    }),
  ]);
  add("P04", [
    ...setup,
    ...fromScenario("resource-use-clear-delete"),
    ...fromScenario("section-move-emitter"),
  ]);
  add("P05", [
    ...setup,
    ...sprite,
    command("character.sprite.create", { ...atlas, spriteId: "sprite-two" }),
  ]);
  add("P06", setup.slice(0, 6), {
    histories: ["draft"],
    fault: "invalid-draft",
  });
  add("P06-duplicate", setup, {
    histories: ["mixed"],
    fault: "duplicate-committed-draft",
  });
  add(
    "P06-obsolete",
    [...setup, command("line.delete", { lineIds: ["line-one"] })],
    {
      histories: ["draft"],
      fault: "obsolete-line-edit",
    },
  );
  add("P06-acknowledged", setup.slice(0, 6), {
    histories: ["committed"],
    acknowledgeLocalDrafts: true,
    expectedFailure: {
      code: "validation_failed",
      message: "repository event projectId is required",
    },
    platforms: ["sqlite"],
  });
  for (const fault of [
    "recovery",
    "recovery-no-meta",
    "recovery-missing-scene",
  ]) {
    add(
      `P07-${fault}`,
      [
        command("section.update", {
          sectionId: "section-one",
          data: { name: "Recovered Section One" },
        }),
      ],
      {
        initialState: seed,
        histories: ["draft"],
        fault,
        sourceCheckpoints: true,
        platforms: ["sqlite"],
      },
    );
  }
  add("P08-real", setup.slice(0, 6), {
    histories: ["draft"],
    fault: "real-version",
  });
  add("P08-text", setup.slice(0, 6), {
    histories: ["draft"],
    fault: "text-version",
  });
  const avatar = [
    ...setup,
    transform,
    command("character.create", {
      characterId: "speaker-one",
      data: {
        type: "character",
        name: "Speaker One",
        sprites: { items: {}, tree: [] },
      },
    }),
    command("character.sprite.create", {
      characterId: "character-one",
      spriteId: "sprite-one",
      data: { type: "image", name: "Sprite One", fileId: "file-one" },
    }),
    command("layout.create", {
      layoutId: "layout-one",
      data: {
        type: "layout",
        name: "Layout One",
        layoutType: "dialogue-adv",
        elements: { items: {}, tree: [] },
      },
    }),
    command("project.set_default_dialogue_avatar_transform", {
      transformId: "transform-one",
    }),
    command("layout.update", {
      layoutId: "layout-one",
      data: {
        preview: {
          dialogue: {
            characterId: "speaker-one",
            character: {
              name: "Speaker One",
              sprite: {
                transformId: "transform-one",
                items: [{ id: "base", resourceId: "sprite-one" }],
              },
            },
            content: [{ text: "Preview One" }],
          },
        },
      },
    }),
  ];
  add("P09", avatar, {
    schema: 15,
    histories: ["draft", "committed", "mixed"],
  });
  add(
    "P10",
    Array.from({ length: 10000 }, (_, index) =>
      command("section.update", {
        sectionId: index % 2 ? "section-one" : "section-two",
        data: { name: `Section ${index}` },
      }),
    ),
    { initialState: seed, histories: ["mixed"] },
  );
  const oversized = structuredClone(seed);
  oversized.scenes.items["scene-one"].sections.items["section-one"].lines.items[
    "line-one"
  ].actions.dialogue.content = [{ text: "x".repeat(1024 * 1024 + 1) }];
  add("P10-oversized", [], {
    initialState: oversized,
    histories: ["draft"],
    bootstrapMode: "native-initializer",
  });
  return recipes;
}
