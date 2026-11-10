import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ASSET_PACKAGE_FIXTURE_CASES,
  ASSET_PACKAGE_FIXTURES_DIR,
  ASSET_PACKAGE_MANIFEST_PATH,
  createTestProject,
  exportAssetPackageFiles,
  generateAssetPackageFixtures,
} from "../../scripts/generate-asset-package-fixtures.js";
import {
  createAssetImportPlan,
  rewriteAssetImportPlanReferences,
} from "../../src/internal/assetImportPlan.js";
import { mapAssetPackageReferences } from "../../src/internal/assetPackageResources.js";

// Every file under `dir`, by its path inside it with `/` separators.
const listFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((path) => statSync(join(dir, path)).isFile())
    .map((path) => path.split(sep).join("/"))
    .sort();

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");

describe("asset package format: export", () => {
  let generated;

  beforeAll(async () => {
    generated = await generateAssetPackageFixtures();
  });

  it("has a committed folder for every case of the current schema, and no other", () => {
    const versionDir = join(ASSET_PACKAGE_FIXTURES_DIR, generated.version);
    const committedCases = readdirSync(versionDir).filter((name) =>
      statSync(join(versionDir, name)).isDirectory(),
    );

    expect(committedCases.sort()).toEqual([...generated.cases.keys()].sort());
  });

  // A failure here means the exporter writes something else than it did.
  // If the change is intended, run `bun run generate:asset-package-fixtures`
  // and review the diff; see tests/compat/asset-package/README.md first.
  it.each(ASSET_PACKAGE_FIXTURE_CASES.map(({ name }) => name))(
    "%s: the exporter writes exactly the committed package",
    (name) => {
      const caseDir = join(ASSET_PACKAGE_FIXTURES_DIR, generated.version, name);
      const files = generated.cases.get(name);

      expect(listFiles(caseDir)).toEqual([...files.keys()].sort());
      expect(
        readFileSync(join(caseDir, ASSET_PACKAGE_MANIFEST_PATH), "utf8"),
      ).toBe(new TextDecoder().decode(files.get(ASSET_PACKAGE_MANIFEST_PATH)));
      for (const [path, bytes] of files) {
        expect(toBase64(readFileSync(join(caseDir, path))), path).toBe(
          toBase64(bytes),
        );
      }
    },
  );
});

// References the app writes inside other data: a character's sprites in a
// preview, conditions, and values by variable id.
describe("asset package format: references inside data", () => {
  const ELEMENT_BASE = {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    anchorX: 0,
    anchorY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };
  const create = (resourceType, id, data, parentId) => ({
    type: `${resourceType}.create`,
    payload: {
      [`${resourceType}Id`]: id,
      data,
      parentId: parentId ?? null,
      position: "last",
    },
  });
  const readManifest = (files) =>
    JSON.parse(
      new TextDecoder().decode(files.get(ASSET_PACKAGE_MANIFEST_PATH)),
    );

  const createCharacterProject = async () => {
    const project = await createTestProject({
      projectId: "project-one",
      idPrefix: "project-one",
    });
    await project.submit([
      {
        type: "file.create",
        payload: {
          fileId: "file-sprite-one",
          data: { mimeType: "image/png", size: 1, sha256: "a".repeat(64) },
        },
      },
      create("character", "character-one", {
        type: "character",
        name: "Character One",
        sprites: {
          items: {
            "sprite-one": {
              id: "sprite-one",
              type: "image",
              name: "Sprite One",
              fileId: "file-sprite-one",
            },
          },
          tree: [{ id: "sprite-one", children: [] }],
        },
      }),
    ]);
    return project;
  };
  const exportFolders = (project, selectedFolderIdsByType) =>
    exportAssetPackageFiles({
      repositoryState: project.repository.getState(),
      fileBytesById: new Map([["file-sprite-one", new Uint8Array([1])]]),
      selectedFolderIdsByType,
    });

  const createCharacterPreviewProject = async () => {
    const project = await createCharacterProject();
    await project.submit([
      create("transform", "folder-transforms", {
        type: "folder",
        name: "Transforms",
      }),
      create(
        "transform",
        "transform-one",
        {
          type: "transform",
          name: "Transform One",
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0,
          anchorY: 0,
          rotation: 0,
          preview: {
            target: {
              characterId: "character-one",
              sprites: [{ id: "sprite-group-one", resourceId: "sprite-one" }],
            },
          },
        },
        "folder-transforms",
      ),
    ]);
    return project;
  };
  const planImport = (manifest) => {
    let idCount = 0;
    return createAssetImportPlan({
      manifest,
      projectId: "project-two",
      repositoryState: { characters: { items: {}, tree: [] } },
      createId: () => `imported-${++idCount}`,
    });
  };

  // A preview's sprites are the character's own ids, which a character the
  // package carries keeps.
  it("exports a transform whose preview shows a character's sprites", async () => {
    const project = await createCharacterPreviewProject();

    const manifest = readManifest(
      await exportFolders(project, { transforms: ["folder-transforms"] }),
    );

    expect(Object.keys(manifest.dependencies.characters.items)).toEqual([
      "character-one",
    ]);
    expect(
      manifest.repository.transforms.items["transform-one"].preview.target,
    ).toEqual({
      characterId: "character-one",
      sprites: [{ id: "sprite-group-one", resourceId: "sprite-one" }],
    });
  });

  it("keeps the sprites of a preview's character that the importer's character has", async () => {
    const project = await createCharacterPreviewProject();
    const manifest = readManifest(
      await exportFolders(project, { transforms: ["folder-transforms"] }),
    );
    const plan = planImport(manifest);
    const [character] = plan.dependencies;
    const createSprite = (spriteId) => ({
      id: spriteId,
      type: "image",
      name: "Sprite",
      fileId: "file-own",
    });
    const repositoryState = {
      characters: {
        items: {
          "character-same": {
            type: "character",
            name: "Character One",
            sprites: { items: { "sprite-one": createSprite("sprite-one") } },
          },
          "character-other": {
            type: "character",
            name: "Character One",
            sprites: { items: { "sprite-own": createSprite("sprite-own") } },
          },
        },
      },
    };
    const importWith = (characterId) =>
      rewriteAssetImportPlanReferences({
        resources: plan.resources,
        resourceIdMap: new Map([[character.destinationId, characterId]]),
        repositoryState,
      })[0].data.preview;

    expect(importWith("character-same")).toEqual({
      target: {
        characterId: "character-same",
        sprites: [{ id: "sprite-group-one", resourceId: "sprite-one" }],
      },
    });
    // The model requires a preview's sprites to be the character's, and a
    // character needs one, so the preview shows none.
    expect(importWith("character-other")).toEqual({});
  });

  it("carries the variables and characters a layout's conditions name", async () => {
    const project = await createCharacterProject();
    await project.submit([
      create("variable", "variableFlag", {
        type: "variable",
        variableType: "boolean",
        name: "Flag",
        scope: "context",
        default: false,
        value: false,
      }),
      create("layout", "folder-layouts", { type: "folder", name: "Layouts" }),
      create(
        "layout",
        "layout-one",
        {
          type: "layout",
          name: "Layout One",
          layoutType: "general",
          elements: {
            items: {
              "element-flag": {
                id: "element-flag",
                type: "rect",
                name: "Flag",
                ...ELEMENT_BASE,
                $when: "variables.variableFlag == true",
              },
              "element-speaker": {
                id: "element-speaker",
                type: "rect",
                name: "Speaker",
                ...ELEMENT_BASE,
                conditionalOverrides: [
                  {
                    when: {
                      target: "dialogue.characterId",
                      op: "eq",
                      value: "character-one",
                    },
                    set: { opacity: 0.5 },
                  },
                ],
              },
            },
            tree: [
              { id: "element-flag", children: [] },
              { id: "element-speaker", children: [] },
            ],
          },
        },
        "folder-layouts",
      ),
    ]);

    const manifest = readManifest(
      await exportFolders(project, { layouts: ["folder-layouts"] }),
    );

    expect(Object.keys(manifest.dependencies?.variables?.items ?? {})).toEqual([
      "variableFlag",
    ]);
    expect(Object.keys(manifest.dependencies?.characters?.items ?? {})).toEqual(
      ["character-one"],
    );
  });

  it("renames the variables a computed variable's examples set", async () => {
    const project = await createTestProject({
      projectId: "project-one",
      idPrefix: "project-one",
    });
    await project.submit([
      create("variable", "folder-variables", {
        type: "folder",
        name: "Variables",
      }),
      create(
        "variable",
        "variableScore",
        {
          type: "variable",
          variableType: "number",
          name: "Score",
          scope: "context",
          default: 0,
          value: 0,
        },
        "folder-variables",
      ),
      create(
        "variable",
        "variable-double",
        {
          type: "variable",
          variableType: "number",
          name: "Double",
          computed: {
            expr: { mul: [{ var: "variables.variableScore" }, 2] },
            examples: [
              {
                id: "example-one",
                name: "Two",
                input: { variables: { variableScore: 2 } },
              },
            ],
          },
        },
        "folder-variables",
      ),
    ]);
    const manifest = readManifest(
      await exportFolders(project, { variables: ["folder-variables"] }),
    );

    const plan = planImport(manifest);

    const score = plan.resources.find(({ name }) => name === "Score");
    const double = plan.resources.find(({ name }) => name === "Double");
    expect(double.data.computed.examples[0].input.variables).toEqual({
      [score.destinationId]: 2,
    });
  });

  it("renames what a `$when` condition names, and leaves quoted text", () => {
    const ids = new Map([
      ["variableFlag", "variable-new"],
      ["9bonus", "bonus-new"],
      ["variable-name", "name-new"],
      ["character-one", "character-new"],
    ]);
    const rename = ($when) =>
      mapAssetPackageReferences(
        { $when },
        ({ value }) => ids.get(value) ?? value,
      ).$when;

    expect(rename("variables.variableFlag == true")).toBe(
      'variables["variable-new"] == true',
    );
    expect(
      rename(
        `(variables.9bonus > 1) && (variables['variable-name'] == "variables.variableFlag")`,
      ),
    ).toBe(
      '(variables["bonus-new"] > 1) && (variables["name-new"] == "variables.variableFlag")',
    );
    expect(
      rename(
        `dialogue.characterId == "character-one" || dialogue.characterId != 'character-one'`,
      ),
    ).toBe(
      'dialogue.characterId == "character-new" || dialogue.characterId != "character-new"',
    );
    // Only a path from the top: `item.variables` is not the variables.
    expect(rename("item.variables.variableFlag")).toBe(
      "item.variables.variableFlag",
    );
  });
});
