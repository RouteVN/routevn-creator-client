import { describe, expect, it } from "vitest";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";
import {
  checkProjectTemplateRepository,
  createProjectTemplateManifest,
  createProjectTemplateRepository,
  encodeProjectTemplateManifest,
  PROJECT_TEMPLATE_KIND,
  PROJECT_TEMPLATE_LIMITS,
  PROJECT_TEMPLATE_SCHEMA,
} from "../../src/internal/projectTemplatePackage.js";

const SHA256 = "a".repeat(64);

const fileRecord = (id, overrides = {}) => ({
  id,
  type: "image",
  mimeType: "image/png",
  size: 10,
  sha256: SHA256,
  ...overrides,
});

// A project with an image for each of `fileIds`, each one a picture.
const createState = (fileIds = ["imageFile01"], recordOverrides = {}) => {
  const state = structuredClone(initialProjectData);
  for (const fileId of fileIds) {
    state.files.items[fileId] = fileRecord(fileId, recordOverrides);
    state.files.tree.push({ id: fileId });
    state.images.items[`img-${fileId}`] = {
      id: `img-${fileId}`,
      type: "image",
      fileId,
    };
    state.images.tree.push({ id: `img-${fileId}` });
  }
  return state;
};

const expectRefusal = (state, code) => {
  expect(() =>
    checkProjectTemplateRepository(createProjectTemplateRepository(state)),
  ).toThrow(expect.objectContaining({ code }));
};

describe("project template package", () => {
  it("keeps only the files the project uses, in the order it lists them", () => {
    const state = createState(["imageFile02", "imageFile01"]);
    state.files.items.unusedFile1 = fileRecord("unusedFile1");
    state.files.items.fileFolder1 = {
      id: "fileFolder1",
      type: "folder",
      name: "Folder",
    };
    state.files.tree = [
      { id: "fileFolder1", children: [{ id: "imageFile01" }] },
      { id: "unusedFile1" },
      { id: "imageFile02" },
    ];

    const repository = createProjectTemplateRepository(state);

    expect(repository.files).toEqual({
      items: {
        imageFile01: fileRecord("imageFile01"),
        imageFile02: fileRecord("imageFile02"),
      },
      tree: [{ id: "imageFile01" }, { id: "imageFile02" }],
    });
    // The project's own state is left as it was.
    expect(Object.keys(state.files.items)).toHaveLength(4);
    expect(repository.images).toEqual(state.images);
  });

  it("writes exactly the manifest the asset store reads", () => {
    const repository = createProjectTemplateRepository(createState());

    expect(
      createProjectTemplateManifest({
        repository,
        creatorModelSchema: 22,
        name: "Night Train",
        description: "",
      }),
    ).toEqual({
      schema: PROJECT_TEMPLATE_SCHEMA,
      package: { kind: PROJECT_TEMPLATE_KIND, name: "Night Train" },
      creatorModelSchema: 22,
      repository,
    });
  });

  it("accepts a project within every limit", () => {
    const fileIds = Array.from(
      { length: PROJECT_TEMPLATE_LIMITS.files },
      (_, index) => `file${index}`,
    );
    const state = createState(fileIds, {
      size: Math.floor(PROJECT_TEMPLATE_LIMITS.totalBytes / fileIds.length),
    });
    state.project.resolution = { width: 16384, height: 1 };

    expect(() =>
      checkProjectTemplateRepository(createProjectTemplateRepository(state)),
    ).not.toThrow();
  });

  it("refuses more files than a template holds", () => {
    const fileIds = Array.from(
      { length: PROJECT_TEMPLATE_LIMITS.files + 1 },
      (_, index) => `file${index}`,
    );
    expectRefusal(createState(fileIds), "project_template_too_many_files");
  });

  it("refuses a file over 50 MiB", () => {
    expectRefusal(
      createState(["imageFile01"], {
        size: PROJECT_TEMPLATE_LIMITS.fileBytes + 1,
      }),
      "project_template_file_too_large",
    );
  });

  it("refuses files over 2 GiB in all", () => {
    const fileIds = Array.from({ length: 41 }, (_, index) => `file${index}`);
    expectRefusal(
      createState(fileIds, { size: PROJECT_TEMPLATE_LIMITS.fileBytes }),
      "project_template_files_too_large",
    );
  });

  it("refuses a file of a type the asset store does not take", () => {
    expectRefusal(
      createState(["fontFile0001"], { type: "font", mimeType: "font/woff" }),
      "project_template_unsupported_file",
    );
  });

  it("accepts a file type in any case", () => {
    const state = createState(["imageFile01"], { mimeType: "IMAGE/PNG" });
    expect(() =>
      checkProjectTemplateRepository(createProjectTemplateRepository(state)),
    ).not.toThrow();
  });

  it.each(["_starts", "has space", "has/slash", "x".repeat(129)])(
    "refuses the file ID %s",
    (fileId) => {
      expectRefusal(
        createState([fileId]),
        "project_template_unsupported_file_id",
      );
    },
  );

  it.each([
    { width: 0, height: 720 },
    { width: 16385, height: 720 },
    { width: 1280.5, height: 720 },
  ])("refuses the resolution %o", (resolution) => {
    const state = createState();
    state.project.resolution = resolution;
    expectRefusal(state, "project_template_unsupported_resolution");
  });

  it("refuses a manifest over 8 MiB", () => {
    const repository = createProjectTemplateRepository(createState());
    repository.variables.items.big = {
      id: "big",
      type: "string",
      name: "x".repeat(PROJECT_TEMPLATE_LIMITS.manifestBytes),
    };

    expect(() =>
      encodeProjectTemplateManifest(
        createProjectTemplateManifest({ repository, creatorModelSchema: 22 }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "project_template_state_too_large" }),
    );
  });

  it("counts the manifest's limit in UTF-8 bytes", () => {
    const repository = createProjectTemplateRepository(createState());
    const manifest = createProjectTemplateManifest({
      repository,
      creatorModelSchema: 22,
    });
    const size = new TextEncoder().encode(JSON.stringify(manifest)).length;
    // Three bytes a character: a third as many characters as the bytes left
    // are over the limit.
    const characters =
      Math.floor((PROJECT_TEMPLATE_LIMITS.manifestBytes - size) / 3) + 1;
    manifest.package.name = "語".repeat(characters);

    expect(() => encodeProjectTemplateManifest(manifest)).toThrow(
      expect.objectContaining({ code: "project_template_state_too_large" }),
    );
  });
});
