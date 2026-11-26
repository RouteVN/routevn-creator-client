import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { SCHEMA_VERSION } from "@routevn/creator-model";
import { describe, expect, it, vi } from "vitest";
import { loadProjectTemplate } from "../../src/deps/clients/web/projectTemplateSource.js";
import { createProjectTemplateDownloadService } from "../../src/deps/services/shared/projectTemplateDownloadService.js";
import { createProjectTemplateExportService } from "../../src/deps/services/shared/projectTemplateExportService.js";
import { resolveTemplateFontsForLanguage } from "../../src/internal/defaultTemplateFonts.js";
import { scaleTemplateProjectStateForResolution } from "../../src/internal/projectResolution.js";
import {
  PROJECT_TEMPLATE_FILE_TYPES,
  PROJECT_TEMPLATE_KIND,
  PROJECT_TEMPLATE_LIMITS,
  PROJECT_TEMPLATE_SCHEMA,
} from "../../src/internal/projectTemplatePackage.js";

const TEMPLATE_DIR = new URL(
  "../../static/templates/default/",
  import.meta.url,
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ORPHAN_BYTES = new TextEncoder().encode("a sound nothing uses any more");

// A project made from the bundled template, as the Creator holds it: English
// fonts at 1280 × 720. Its files also list one a replaced sound left behind
// and a folder.
const createProjectState = () => {
  const repository = JSON.parse(
    readFileSync(new URL("repository.json", TEMPLATE_DIR), "utf8"),
  );
  const state = scaleTemplateProjectStateForResolution(
    resolveTemplateFontsForLanguage({
      templateId: "default",
      templateData: repository,
      language: "en",
    }),
    { width: 1280, height: 720 },
  );
  state.files.items.orphanSound1 = {
    id: "orphanSound1",
    type: "sound",
    mimeType: "audio/mpeg",
    size: ORPHAN_BYTES.length,
    sha256: sha256(ORPHAN_BYTES),
  };
  state.files.items.fileFolder01 = {
    id: "fileFolder01",
    type: "folder",
    name: "Old files",
  };
  state.files.tree.push({
    id: "fileFolder01",
    children: [{ id: "orphanSound1" }],
  });
  return state;
};

const sceneIdsOf = (state) =>
  Object.values(state.scenes.items)
    .filter((scene) => scene.type === "scene")
    .map((scene) => scene.id);

const withoutSceneLines = (state) => {
  const copy = structuredClone(state);
  for (const scene of Object.values(copy.scenes.items)) {
    for (const section of Object.values(scene.sections?.items ?? {})) {
      section.lines = { items: {}, tree: [] };
    }
  }
  return copy;
};

const readStoredFile = (fileId) =>
  fileId === "orphanSound1"
    ? ORPHAN_BYTES
    : new Uint8Array(readFileSync(new URL(`files/${fileId}`, TEMPLATE_DIR)));

const createService = ({ state = createProjectState(), readFile } = {}) => {
  const getFileContent = vi.fn(async (fileId) => ({
    url: `project-file://${fileId}`,
    revoke: vi.fn(),
  }));
  const fetchImpl = vi.fn(async (url) => {
    const fileId = url.slice("project-file://".length);
    const bytes = (readFile ?? readStoredFile)(fileId);
    return { ok: true, arrayBuffer: async () => bytes.slice().buffer };
  });
  return {
    getFileContent,
    service: createProjectTemplateExportService({
      getFileContent,
      // The state holds no scene's lines; asking for every scene gives them.
      getRepository: () => ({
        getState: () => withoutSceneLines(state),
        getContextState: async ({ sceneIds }) => {
          expect(sceneIds).toEqual(sceneIdsOf(state));
          return structuredClone(state);
        },
      }),
      fetchImpl,
    }),
  };
};

// The ZIP's entries as its central directory lists them: name, compression
// method and where its local header is.
const readCentralDirectory = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: new TextDecoder().decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength),
      ),
      method: view.getUint16(offset + 10, true),
      flags: view.getUint16(offset + 8, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const exportTemplate = async (options) => {
  const { service } = createService(options);
  const { repository } = await service.prepareProjectTemplate({
    name: "Night Train",
    description: "A starter mystery.",
  });
  return service.createProjectTemplateBundle({
    repository,
    name: "Night Train",
    description: "A starter mystery.",
  });
};

describe("project template export", () => {
  it("writes the project's state and the files it uses as stored entries", async () => {
    const state = createProjectState();
    const bundle = await exportTemplate({ state });
    const bytes = new Uint8Array(await bundle.arrayBuffer());

    expect(bundle.type).toBe("application/zip");
    // The files something outside `files` names, as the project lists them.
    const { files: _stateFiles, ...stateRest } = state;
    const stateText = JSON.stringify(stateRest);
    const usedFileIds = Object.keys(state.files.items).filter(
      (fileId) =>
        state.files.items[fileId].type !== "folder" &&
        stateText.includes(`"${fileId}"`),
    );
    expect(usedFileIds).not.toContain("orphanSound1");
    expect(usedFileIds.length).toBeGreaterThan(30);
    const entries = readCentralDirectory(bytes);
    expect(entries.map((entry) => entry.name)).toEqual([
      "project-template.json",
      "files/",
      ...usedFileIds.map((fileId) => `files/${fileId}`),
    ]);
    // Stored, not encrypted, the first entry at the start of the file.
    expect(entries.every((entry) => entry.method === 0)).toBe(true);
    expect(entries.every((entry) => (entry.flags & 1) === 0)).toBe(true);
    expect(entries[0].localHeaderOffset).toBe(0);

    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse(
      await zip.file("project-template.json").async("string"),
    );
    expect(Object.keys(manifest)).toEqual([
      "schema",
      "package",
      "creatorModelSchema",
      "repository",
    ]);
    expect(manifest.schema).toBe(PROJECT_TEMPLATE_SCHEMA);
    expect(manifest.package).toEqual({
      kind: PROJECT_TEMPLATE_KIND,
      name: "Night Train",
      description: "A starter mystery.",
    });
    expect(manifest.creatorModelSchema).toBe(SCHEMA_VERSION);
    expect(manifest.repository.project.resolution).toEqual({
      width: 1280,
      height: 720,
    });
    // Every scene's lines, though the project's state holds none.
    const lineCounts = Object.values(manifest.repository.scenes.items)
      .filter((scene) => scene.type === "scene")
      .map((scene) =>
        Object.values(scene.sections.items).reduce(
          (count, section) => count + Object.keys(section.lines.items).length,
          0,
        ),
      );
    expect(lineCounts.every((count) => count > 0)).toBe(true);
    // The state, without the file nobody uses or the folder.
    const { files, ...rest } = manifest.repository;
    expect(rest).toEqual(stateRest);
    expect(Object.keys(files.items)).toEqual(usedFileIds);
    expect(files.tree).toEqual(usedFileIds.map((id) => ({ id })));
    for (const fileId of usedFileIds) {
      const record = files.items[fileId];
      const fileBytes = readStoredFile(fileId);
      expect(record).toEqual({
        id: fileId,
        type: state.files.items[fileId].type,
        mimeType: state.files.items[fileId].mimeType,
        size: fileBytes.byteLength,
        sha256: sha256(fileBytes),
      });
      expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(PROJECT_TEMPLATE_FILE_TYPES.has(record.mimeType)).toBe(true);
      expect(
        new Uint8Array(await zip.file(`files/${fileId}`).async("uint8array")),
      ).toEqual(fileBytes);
    }
  });

  it("opens again as a template file, which creates the same project", async () => {
    const bundle = await exportTemplate();
    const file = new File([bundle], "night-train.zip", {
      type: "application/zip",
    });
    const reader = createProjectTemplateDownloadService({ assetStore: {} });
    const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
    const manifest = JSON.parse(
      await zip.file("project-template.json").async("string"),
    );

    await expect(reader.readProjectTemplateFileInfo({ file })).resolves.toEqual(
      {
        title: "Night Train",
        resolution: { width: 1280, height: 720 },
      },
    );
    const progress = [];
    const template = await reader.readProjectTemplateFile({
      file,
      onProgress: (event) => progress.push(event),
    });
    expect(template.repository).toEqual(manifest.repository);
    const fileIds = Object.keys(manifest.repository.files.items);
    expect(template.files.map((entry) => entry.fileId)).toEqual(fileIds);
    expect(progress.at(-1)).toMatchObject({ stage: "extracting" });

    const loaded = await loadProjectTemplate({ template });
    expect(loaded.templateData).toEqual(manifest.repository);
    for (const entry of loaded.files) {
      expect(new Uint8Array(await entry.read())).toEqual(
        readStoredFile(entry.fileId),
      );
    }
  });

  it("refuses a file whose bytes are over the limit, though its record is not", async () => {
    const state = createProjectState();
    const [fileId] = Object.keys(state.files.items);
    const { service } = createService({
      state,
      readFile: (id) =>
        id === fileId
          ? new Uint8Array(PROJECT_TEMPLATE_LIMITS.fileBytes + 1)
          : readStoredFile(id),
    });
    const { repository } = await service.prepareProjectTemplate({
      name: "Big",
    });

    await expect(
      service.createProjectTemplateBundle({ repository, name: "Big" }),
    ).rejects.toMatchObject({ code: "project_template_file_too_large" });
  });

  it("follows the bytes it reads", async () => {
    const { service } = createService();
    const { repository } = await service.prepareProjectTemplate({});
    const progress = [];
    await service.createProjectTemplateBundle({
      repository,
      onProgress: (event) => progress.push(event),
    });
    const total = Object.values(repository.files.items).reduce(
      (sum, record) => sum + record.size,
      0,
    );
    expect(progress[0]).toEqual({ current: 0, total });
    expect(progress.at(-1)).toEqual({ current: total, total });
  });
});
