// Imports every committed reference package in tests/compat/asset-package/
// through the app's import path (plan, review choices, commit) into a real
// project, and exports the imported resources again. The packages are read
// from disk, never rebuilt, so a frozen package keeps being tested as it is.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { validateState } from "@routevn/creator-model";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ASSET_PACKAGE_FIXTURES_DIR,
  ASSET_PACKAGE_MANIFEST_PATH,
  createTestProject,
  exportAssetPackageFiles,
} from "../../scripts/generate-asset-package-fixtures.js";
import { createImportPackageClient } from "../../src/deps/clients/importPackageClient.js";
import { createImportPackageCommandApi } from "../../src/deps/services/shared/commandApi/resources/importPackage.js";
import { createResourcePackageImportService } from "../../src/deps/services/shared/resourcePackageImportService.js";
import { USE_PACK_DEPENDENCY } from "../../src/internal/assetImportPlan.js";
import {
  ASSET_PACKAGE_RESOURCE_TYPES,
  visitAssetPackageReferences,
} from "../../src/internal/assetPackageResources.js";
import {
  toCreatorModelState,
  validateClientModelStateExtensions,
} from "../../src/internal/creatorModelAdapter.js";

const DEPENDENCY_FOLDER_NAME = "Pack One";
// Fields a package's export adds for its own previews; the import leaves
// them out, as the project makes its own.
const PREVIEW_FIELDS = ["previewMediaFileId", "thumbnailMediaFileId"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const listFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((path) => statSync(join(dir, path)).isFile())
    .map((path) => path.split(sep).join("/"));

// Every committed package: each `<schema>/<case>` folder with a manifest.
const PACKAGE_DIRS = readdirSync(ASSET_PACKAGE_FIXTURES_DIR)
  .filter((version) => /^v\d+$/.test(version))
  .flatMap((version) =>
    readdirSync(join(ASSET_PACKAGE_FIXTURES_DIR, version))
      .map((name) => join(ASSET_PACKAGE_FIXTURES_DIR, version, name))
      .filter((dir) => existsSync(join(dir, ASSET_PACKAGE_MANIFEST_PATH)))
      .map((dir) => ({ label: `${version}/${dir.split(sep).pop()}`, dir })),
  );

const readPackage = (dir) => {
  const files = new Map(
    listFiles(dir).map((path) => [
      path,
      new Uint8Array(readFileSync(join(dir, path))),
    ]),
  );
  const manifest = JSON.parse(
    new TextDecoder().decode(files.get(ASSET_PACKAGE_MANIFEST_PATH)),
  );
  return { manifest, files };
};

// The package as the asset store publishes it: a stored ZIP read in place
// with byte ranges, which is how the import dialog opens a pack.
const publishPackage = async (files) => {
  const zip = new JSZip();
  for (const [path, bytes] of files) zip.file(path, bytes);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const end = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 22);
  return {
    fetchImpl: async (_url, { headers }) => {
      const [, start, last] = /^bytes=(\d+)-(\d+)$/.exec(headers.Range);
      return new Response(bytes.slice(Number(start), Number(last) + 1), {
        status: 206,
      });
    },
    zip: {
      url: "https://packages.test/package-one.zip",
      size: bytes.length,
      directorySize: end.getUint32(12, true),
      directoryOffset: end.getUint32(16, true),
    },
  };
};

// What each file the import stages must start with, for the kind of asset
// that uses it; the app decodes each file instead.
const FILE_CHECKS = {
  image: (bytes) => sha256(bytes.slice(0, 4)) === sha256(PNG_SIGNATURE),
  audio: (bytes) => new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF",
  video: (bytes) => new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp",
  font: (bytes) => bytes[0] === 0 && bytes[1] === 1,
  json: (bytes) => JSON.parse(new TextDecoder().decode(bytes)) !== undefined,
};
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

// A project to import into, and the bytes of every file imported into it.
const createTarget = async (name) => {
  const project = await createTestProject({
    projectId: `project-${name}`,
    idPrefix: name,
  });
  let idCount = 0;
  return {
    ...project,
    nextId: () => `${name}-id-${++idCount}`,
    stagedBytes: new Map(),
  };
};

// A scene, section or layout for each of the package's links, named as the
// link is, which the review then chooses for it.
const createLinkTargets = async (target, manifest) => {
  const linkTargets = {};
  const commands = [];
  const sceneIdByName = new Map();
  const ensureScene = (name) => {
    if (!sceneIdByName.has(name)) {
      const sceneId = target.nextId();
      sceneIdByName.set(name, sceneId);
      commands.push({
        type: "scene.create",
        payload: { sceneId, data: { type: "scene", name } },
      });
    }
    return sceneIdByName.get(name);
  };
  for (const [linkId, link] of Object.entries(manifest.links?.items ?? {})) {
    if (link.kind === "scene") {
      linkTargets[linkId] = ensureScene(link.name);
      continue;
    }
    if (link.kind === "section") {
      const sceneId = ensureScene(link.sceneName);
      const sectionId = target.nextId();
      commands.push({
        type: "section.create",
        payload: { sceneId, sectionId, data: { name: link.name } },
      });
      linkTargets[linkId] = sectionId;
      continue;
    }
    const layoutId = target.nextId();
    commands.push({
      type: "layout.create",
      payload: {
        layoutId,
        data: {
          type: "layout",
          name: link.name,
          layoutType: link.layoutType ?? "general",
          elements: { items: {}, tree: [] },
        },
        parentId: null,
        position: "last",
      },
    });
    linkTargets[linkId] = layoutId;
  }
  if (commands.length > 0) await target.submit(commands);
  return linkTargets;
};

// Imports the package with the choices the import dialog sends when every
// pick is kept as the package names it: each dependency is the package's own
// or `replaceDependency` picks one of the project's, and each link goes to
// its target. `afterReview` changes the project between the review and the
// import, as the app may while the review is open.
const importPackage = async ({
  target,
  published,
  linkTargets,
  replaceDependency = () => USE_PACK_DEPENDENCY,
  afterReview = async () => {},
}) => {
  const service = createResourcePackageImportService({
    idGenerator: target.nextId,
    getCurrentProjectId: () => target.projectId,
    getRepositoryState: () => target.repository.getState(),
    assetService: {
      validateResourceImportFile: async ({ file, validationKind }) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!FILE_CHECKS[validationKind](bytes)) {
          throw new Error(`Not a ${validationKind} file.`);
        }
      },
      stageResourceImportFile: async ({ file, fileId }) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        target.stagedBytes.set(fileId, bytes);
        return {
          fileId,
          fileRecords: [
            {
              id: fileId,
              mimeType: file.type,
              size: bytes.byteLength,
              sha256: sha256(bytes),
            },
          ],
        };
      },
      discardResourceImportFiles: async () => ({}),
      finalizeResourceImportFiles: () => {},
    },
    commandApi: createImportPackageCommandApi(target.shared),
    importClient: createImportPackageClient({ fetchImpl: published.fetchImpl }),
  });

  const planResult = await service.createResourceImportPlan({
    zip: published.zip,
    dependencyFolderName: DEPENDENCY_FOLDER_NAME,
  });
  expect(planResult.error).toBeUndefined();
  const { plan } = planResult;
  const choices = {
    selectedResourceIds: plan.resources.map(({ sourceId }) => sourceId),
    resourceNames: Object.fromEntries(
      plan.resources.map(({ sourceId, name }) => [sourceId, name]),
    ),
    resourceDescriptions: Object.fromEntries(
      plan.resources.map(({ sourceId, description }) => [
        sourceId,
        description,
      ]),
    ),
    dependencyReplacements: Object.fromEntries(
      plan.dependencies.map((dependency) => [
        dependency.sourceId,
        replaceDependency(dependency),
      ]),
    ),
    linkTargets: Object.fromEntries(
      plan.links.map(({ id }) => [id, linkTargets[id]]),
    ),
  };
  expect(
    service.validateResourceImportPlan({ planId: plan.planId, ...choices }),
  ).toEqual({ valid: true });
  await afterReview();
  const before = target.repository.getState();
  const result = await service.executeResourceImportPlan({
    planId: plan.planId,
    ...choices,
  });
  expect(result.error).toBeUndefined();
  return { plan, choices, before, state: target.repository.getState() };
};

const TYPES_WITH_FILES = [...ASSET_PACKAGE_RESOURCE_TYPES, "files"];
const listNewIds = (before, state) =>
  Object.fromEntries(
    TYPES_WITH_FILES.map((type) => [
      type,
      Object.keys(state[type].items).filter(
        (id) => !Object.hasOwn(before[type].items, id),
      ),
    ]),
  );

// A tree by names and types only, so two trees compare by structure.
const describeTree = (nodes, items) =>
  nodes.map((node) => {
    const { name, type } = items[node.id];
    return type === "folder"
      ? { name, type, children: describeTree(node.children ?? [], items) }
      : { name, type };
  });

// Walks a package tree and the imported tree in step, mapping each package
// id to the id it was imported as.
const mapTreeIds = (packageNodes, importedNodes, idMap) => {
  packageNodes.forEach((node, index) => {
    idMap.set(node.id, importedNodes[index].id);
    mapTreeIds(node.children ?? [], importedNodes[index].children ?? [], idMap);
  });
};

// A variable path (`variables.id` or `variables["id"]`) or quoted text,
// wherever it is in a string, such as in an element's `$when` condition.
const PATH_OR_QUOTED_TEXT =
  /variables\.([A-Za-z0-9_$]+)|variables\[("(?:\\.|[^"\\])*")\]|"(?:\\.|[^"\\])*"/g;

// Every string that is a package id, and every variable path or quoted id
// in a string, put in terms of `idMap`, whatever field holds it. A variable
// path comes back in bracket form, as the import writes every path it
// renames.
const translateIds = (value, idMap) => {
  if (Array.isArray(value))
    return value.map((entry) => translateIds(entry, idMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        idMap.get(key) ?? key,
        translateIds(entry, idMap),
      ]),
    );
  }
  if (typeof value !== "string") return value;
  if (idMap.has(value)) return idMap.get(value);
  return value.replace(PATH_OR_QUOTED_TEXT, (text, dotId, quotedId) => {
    if (dotId === undefined && quotedId === undefined) {
      const id = JSON.parse(text);
      return idMap.has(id) ? JSON.stringify(idMap.get(id)) : text;
    }
    const id = dotId ?? JSON.parse(quotedId);
    return idMap.has(id) ? `variables[${JSON.stringify(idMap.get(id))}]` : text;
  });
};

const withoutKeys = (value, keys) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );

// Every id a package gives a resource, folder, file or link.
const listPackageIds = (manifest) => [
  ...Object.keys(manifest.repository.files.items),
  ...ASSET_PACKAGE_RESOURCE_TYPES.flatMap((type) => [
    ...Object.keys(manifest.repository[type]?.items ?? {}),
    ...Object.keys(manifest.dependencies?.[type]?.items ?? {}),
  ]),
  ...Object.keys(manifest.links?.items ?? {}),
];

// The strings and keys of `value` that are, or contain, a package id.
const findPackageIds = (value, packageIds, found = []) => {
  const check = (text) => {
    for (const id of packageIds) {
      if (
        text === id ||
        text.includes(JSON.stringify(id)) ||
        new RegExp(
          `variables\\.${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`,
        ).test(text)
      ) {
        found.push(`${text} (${id})`);
      }
    }
  };
  if (Array.isArray(value)) {
    value.forEach((entry) => findPackageIds(entry, packageIds, found));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      check(key);
      findPackageIds(entry, packageIds, found);
    }
  } else if (typeof value === "string") {
    check(value);
  }
  return found;
};

// The package with each id replaced by a name for its place: a resource or
// folder by its type and folder path, a dependency by its type and name, a
// link by what it names, and a file by its hash. Two packages of the same
// resources then compare equal whatever ids they use.
const normalizePackage = (manifest) => {
  const labels = new Map();
  const addLabel = (id, label) => {
    expect([...labels.values()], `two ids for ${label}`).not.toContain(label);
    labels.set(id, label);
  };
  const labelTree = (type, nodes, items, path) => {
    for (const node of nodes) {
      const nodePath = `${path}/${items[node.id].name}`;
      addLabel(node.id, `${type}:${nodePath}`);
      labelTree(type, node.children ?? [], items, nodePath);
    }
  };
  for (const type of ASSET_PACKAGE_RESOURCE_TYPES) {
    const collection = manifest.repository[type];
    if (collection) labelTree(type, collection.tree, collection.items, "");
    for (const [id, item] of Object.entries(
      manifest.dependencies?.[type]?.items ?? {},
    )) {
      addLabel(id, `${type}:dependency:${item.name}`);
    }
  }
  for (const [id, link] of Object.entries(manifest.links?.items ?? {})) {
    addLabel(id, `link:${link.kind}:${link.sceneName ?? ""}/${link.name}`);
  }
  const files = {};
  for (const [id, descriptor] of Object.entries(
    manifest.repository.files.items,
  )) {
    expect(descriptor.source.url).toBe(`./files/${encodeURIComponent(id)}`);
    // Generated previews have no hash; the export makes them again each
    // time, so they are left out with the fields that name them.
    if (descriptor.sha256 === undefined) continue;
    addLabel(id, `file:${descriptor.sha256}`);
    files[id] = withoutKeys(descriptor, ["source"]);
  }

  const normalizeItems = (items) =>
    Object.fromEntries(
      Object.entries(items).map(([id, item]) => {
        const normalized = withoutKeys(item, PREVIEW_FIELDS);
        // The import dialog sends each pick's description, empty when it
        // had none.
        if (normalized.description === "") delete normalized.description;
        return [id, normalized];
      }),
    );
  const normalized = {
    schema: manifest.schema,
    package: manifest.package,
    repository: { files: { items: files } },
    dependencies: {},
    links: manifest.links ?? { items: {} },
  };
  for (const type of ASSET_PACKAGE_RESOURCE_TYPES) {
    const collection = manifest.repository[type];
    if (collection) {
      normalized.repository[type] = {
        items: normalizeItems(collection.items),
        tree: collection.tree,
      };
    }
    const dependencies = manifest.dependencies?.[type];
    if (dependencies) {
      normalized.dependencies[type] = {
        items: normalizeItems(dependencies.items),
      };
    }
  }
  return translateIds(normalized, labels);
};

describe.each(PACKAGE_DIRS)(
  "asset package format: import $label",
  ({ dir }) => {
    const { manifest, files } = readPackage(dir);
    const packageIds = listPackageIds(manifest);

    it("holds every file its manifest lists, with the listed size and hash", () => {
      const listedPaths = Object.entries(manifest.repository.files.items).map(
        ([id, descriptor]) => {
          const path = `files/${encodeURIComponent(id)}`;
          expect(descriptor.source.url).toBe(`./${path}`);
          const bytes = files.get(path);
          expect(bytes, path).toBeDefined();
          expect(bytes.byteLength, path).toBe(descriptor.size);
          if (descriptor.sha256 !== undefined) {
            expect(sha256(bytes), path).toBe(descriptor.sha256);
          }
          return path;
        },
      );

      expect([...files.keys()].sort()).toEqual(
        [ASSET_PACKAGE_MANIFEST_PATH, ...listedPaths].sort(),
      );
    });

    // (a) into a project with nothing but the scenes, sections and layouts
    // its links go to; (b) into a project that already has the package's
    // resources, from importing it before, where every dependency is replaced
    // by the project's own resource of the same name.
    describe.each([
      { scenario: "into a new project", replaceDependencies: false },
      {
        scenario: "into a project that has same-named resources",
        replaceDependencies: true,
      },
    ])("$scenario", ({ replaceDependencies }) => {
      let target;
      let imported;
      let linkTargets;
      let replacementIds;
      let newIds;
      const idMap = new Map();
      // Each package resource the import added: its type, package id and
      // package item, and whether it is a pick or a dependency.
      const importedItems = [];

      beforeAll(async () => {
        const published = await publishPackage(files);
        target = await createTarget(
          replaceDependencies ? "existing-project" : "new-project",
        );
        linkTargets = await createLinkTargets(target, manifest);
        replacementIds = {};
        let replaceDependency;
        if (replaceDependencies) {
          await importPackage({ target, published, linkTargets });
          const state = target.repository.getState();
          replaceDependency = (dependency) => {
            const matches = Object.entries(
              state[dependency.resourceType].items,
            ).filter(
              ([, item]) =>
                item.type === dependency.type && item.name === dependency.name,
            );
            expect(matches, dependency.name).toHaveLength(1);
            replacementIds[dependency.packageSourceId] = matches[0][0];
            return matches[0][0];
          };
        }
        imported = await importPackage({
          target,
          published,
          linkTargets,
          replaceDependency,
        });
        newIds = listNewIds(imported.before, imported.state);

        for (const [linkId, targetId] of Object.entries(linkTargets)) {
          idMap.set(linkId, targetId);
        }
        for (const [packageId, targetId] of Object.entries(replacementIds)) {
          idMap.set(packageId, targetId);
        }
        for (const { sourceId, destinationId } of imported.plan.files) {
          idMap.set(sourceId, destinationId);
        }
        for (const type of ASSET_PACKAGE_RESOURCE_TYPES) {
          const newRoots = imported.state[type].tree.filter(({ id }) =>
            newIds[type].includes(id),
          );
          const picks = manifest.repository[type];
          mapTreeIds(picks?.tree ?? [], newRoots, idMap);
          const dependencyIds = Object.keys(
            manifest.dependencies?.[type]?.items ?? {},
          ).filter((id) => !Object.hasOwn(replacementIds, id));
          const dependencyFolder = newRoots[picks?.tree.length ?? 0];
          dependencyIds.forEach((id, index) => {
            idMap.set(id, dependencyFolder.children[index].id);
          });
          for (const [packageId, item] of [
            ...Object.entries(picks?.items ?? {}),
            ...Object.entries(manifest.dependencies?.[type]?.items ?? {}),
          ]) {
            if (
              item.type !== "folder" &&
              newIds[type].includes(idMap.get(packageId))
            ) {
              importedItems.push({
                type,
                packageId,
                item,
                pick: Boolean(picks?.items[packageId]),
              });
            }
          }
        }
      });

      it("leaves a project the model accepts", () => {
        expect(
          validateState({ state: toCreatorModelState(imported.state) }),
        ).toEqual({ valid: true });
        expect(validateClientModelStateExtensions(imported.state)).toEqual({
          valid: true,
        });
      });

      it("imports each pick in its folders, and only what the choices add", () => {
        for (const type of ASSET_PACKAGE_RESOURCE_TYPES) {
          const { items, tree } = imported.state[type];
          const newRoots = tree.filter(({ id }) => newIds[type].includes(id));
          const expected = describeTree(
            manifest.repository[type]?.tree ?? [],
            manifest.repository[type]?.items ?? {},
          );
          const keptDependencies = Object.entries(
            manifest.dependencies?.[type]?.items ?? {},
          ).filter(([id]) => !Object.hasOwn(replacementIds, id));
          if (keptDependencies.length > 0) {
            expected.push({
              name: DEPENDENCY_FOLDER_NAME,
              type: "folder",
              children: keptDependencies.map(
                ([, { name, type: itemType }]) => ({
                  name,
                  type: itemType,
                }),
              ),
            });
          }

          expect(describeTree(newRoots, items), type).toEqual(expected);
          const countNodes = (nodes) =>
            nodes.reduce(
              (count, node) => count + 1 + countNodes(node.children ?? []),
              0,
            );
          expect(newIds[type], type).toHaveLength(countNodes(newRoots));
        }
        expect(imported.state.scenes).toEqual(imported.before.scenes);

        // Only the files the imported resources use, each with the bytes the
        // package lists for it.
        const usedFileIds = new Set();
        for (const { item } of importedItems) {
          visitAssetPackageReferences(item, ({ kind, value }) => {
            if (kind === "file") usedFileIds.add(value);
          });
        }
        expect(newIds.files.sort()).toEqual(
          [...usedFileIds].map((id) => idMap.get(id)).sort(),
        );
        for (const fileId of usedFileIds) {
          const descriptor = manifest.repository.files.items[fileId];
          const record = imported.state.files.items[idMap.get(fileId)];
          const bytes = target.stagedBytes.get(idMap.get(fileId));
          expect(record, fileId).toMatchObject({
            mimeType: descriptor.mimeType,
            size: descriptor.size,
            sha256: sha256(bytes),
          });
          expect(bytes.byteLength, fileId).toBe(descriptor.size);
          if (descriptor.sha256 !== undefined) {
            expect(sha256(bytes), fileId).toBe(descriptor.sha256);
          }
        }
      });

      it("points every reference at what the project has: imports, replaced dependencies, files and chosen links", () => {
        expect(importedItems.length).toBeGreaterThan(0);
        for (const { type, packageId, item, pick } of importedItems) {
          const expected = translateIds(
            withoutKeys(item, ["id", ...PREVIEW_FIELDS]),
            idMap,
          );
          // The import dialog sends each pick's description, empty when it
          // had none.
          if (pick) expected.description = item.description ?? "";
          const actual = imported.state[type].items[idMap.get(packageId)];

          expect(withoutKeys(actual, ["id"]), `${type} ${packageId}`).toEqual(
            expected,
          );
        }
      });

      it("leaves every reference resolving inside the project", () => {
        const { state } = imported;
        const sectionIds = new Set(
          Object.values(state.scenes.items).flatMap((scene) =>
            Object.keys(scene.sections?.items ?? {}),
          ),
        );
        const exists = {
          file: (id) => Boolean(state.files.items[id]),
          resource: (id) =>
            ASSET_PACKAGE_RESOURCE_TYPES.some((type) => {
              const resource = state[type].items[id];
              return resource !== undefined && resource.type !== "folder";
            }),
          project: (id) =>
            Boolean(state.scenes.items[id]) || sectionIds.has(id),
        };
        const missing = [];
        for (const { type, packageId } of importedItems) {
          const item = state[type].items[idMap.get(packageId)];
          visitAssetPackageReferences(item, ({ kind, required, value }) => {
            if (
              !exists[kind](value) &&
              (required || packageIds.includes(value))
            ) {
              missing.push(`${item.name}: ${kind} ${value}`);
            }
          });
        }

        expect(missing).toEqual([]);
      });

      it("keeps no id of the package that the project does not have", () => {
        const { state } = imported;
        const projectIds = new Set([
          ...Object.keys(state.files.items),
          ...Object.keys(state.scenes.items),
          ...ASSET_PACKAGE_RESOURCE_TYPES.flatMap((type) =>
            Object.keys(state[type].items),
          ),
        ]);
        const foreignIds = packageIds.filter((id) => !projectIds.has(id));
        const found = importedItems.flatMap(({ type, packageId }) =>
          findPackageIds(state[type].items[idMap.get(packageId)], foreignIds),
        );

        expect(found).toEqual([]);
      });

      it("exports the imported resources again as the same package", async () => {
        const selectedFolderIdsByType = {};
        for (const type of ASSET_PACKAGE_RESOURCE_TYPES) {
          const pickRoots = manifest.repository[type]?.tree ?? [];
          if (pickRoots.length > 0) {
            selectedFolderIdsByType[type] = pickRoots.map(({ id }) =>
              idMap.get(id),
            );
          }
        }
        const exported = await exportAssetPackageFiles({
          repositoryState: imported.state,
          fileBytesById: target.stagedBytes,
          selectedFolderIdsByType,
        });
        const exportedManifest = JSON.parse(
          new TextDecoder().decode(exported.get(ASSET_PACKAGE_MANIFEST_PATH)),
        );

        expect(normalizePackage(exportedManifest)).toEqual(
          normalizePackage(manifest),
        );
      });
    });
  },
);

// The app keeps changing the project while a review is open, such as when a
// page saves its thumbnails: the import still goes through, against the
// project as it is when it runs.
describe("asset package format: import after the project changed", () => {
  it("imports, and numbers a dependency folder past a same-named folder made during the review", async () => {
    const { dir } = PACKAGE_DIRS.find(({ label }) =>
      label.endsWith("/dependencies"),
    );
    const { manifest, files } = readPackage(dir);
    expect(manifest.dependencies.fonts).toBeDefined();
    expect(manifest.repository.fonts).toBeUndefined();
    const published = await publishPackage(files);
    const target = await createTarget("changed-project");
    const linkTargets = await createLinkTargets(target, manifest);
    const revisionAtReview = { value: undefined };
    const projectFolderId = target.nextId();

    const imported = await importPackage({
      target,
      published,
      linkTargets,
      afterReview: async () => {
        revisionAtReview.value = target.repository.getRevision();
        await target.submit([
          {
            type: "image.create",
            payload: {
              imageId: target.nextId(),
              data: { type: "folder", name: "Images Made Meanwhile" },
              parentId: null,
              position: "last",
            },
          },
          {
            type: "font.create",
            payload: {
              fontId: projectFolderId,
              data: { type: "folder", name: DEPENDENCY_FOLDER_NAME },
              parentId: null,
              position: "last",
            },
          },
        ]);
      },
    });

    expect(target.repository.getRevision()).toBeGreaterThan(
      revisionAtReview.value,
    );
    const { fonts } = imported.state;
    const topLevelFolderNames = fonts.tree.map(
      ({ id }) => fonts.items[id].name,
    );
    expect(topLevelFolderNames).toEqual([
      DEPENDENCY_FOLDER_NAME,
      `${DEPENDENCY_FOLDER_NAME} 2`,
    ]);
    expect(fonts.tree[0].id).toBe(projectFolderId);
  });
});
