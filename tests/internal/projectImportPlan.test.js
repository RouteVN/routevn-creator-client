import { describe, expect, it } from "vitest";
import {
  getFileIdForName,
  planArchiveExtraction,
  planFileRenames,
  planFolderFileRenames,
} from "../../src/internal/projectImportPlan.js";

const file = (name) => ({ name, kind: "file" });
const directory = (name) => ({ name, kind: "directory" });
const link = (name) => ({ name, kind: "symlink" });

const entry = (name, size = 1) => ({
  name,
  size,
  isDirectory: name.endsWith("/"),
});

const plan = (names, options = {}) =>
  planArchiveExtraction({
    entries: names.map((name) =>
      typeof name === "string" ? entry(name) : name,
    ),
    ...options,
  });

describe("getFileIdForName", () => {
  it.each([
    ["abc.png", "abc"],
    ["a_b-1.tar.gz", "a_b-1"],
    ["abc", "abc"],
    ["a b.png", "a b"],
  ])("maps %s to %s", (name, fileId) => {
    expect(getFileIdForName(name)).toBe(fileId);
  });
});

describe("planFileRenames (Rule A)", () => {
  it("renames files to the part before the first dot", () => {
    expect(
      planFileRenames([file("abc.png"), file("a_b-1.tar.gz"), file("plain")]),
    ).toEqual([
      { from: "abc.png", to: "abc" },
      { from: "a_b-1.tar.gz", to: "a_b-1" },
    ]);
  });

  it("changes nothing for names that already are file ids", () => {
    expect(planFileRenames([file("abc"), file("def")])).toEqual([]);
  });

  it("leaves dot files alone", () => {
    expect(planFileRenames([file(".DS_Store"), file("._abc.png")])).toEqual([]);
  });

  it("rejects a name that cannot be a file id", () => {
    expect(() => planFileRenames([file("a b.png")])).toThrow(
      "invalidFileName: a b.png",
    );
    expect(() => planFileRenames([file("é.png")])).toThrow(
      /^invalidFileName: /,
    );
    expect(() => planFileRenames([file(`${"a".repeat(129)}.png`)])).toThrow(
      /^invalidFileName: /,
    );
  });

  it("accepts a file id of exactly 128 characters", () => {
    const id = "a".repeat(128);

    expect(planFileRenames([file(`${id}.png`)])).toEqual([
      { from: `${id}.png`, to: id },
    ]);
  });

  it.each([
    ["abc.png", "abc.jpg"],
    ["abc.png", "abc"],
    ["abc", "abc.png"],
    ["abc.png", "ABC.jpg"],
  ])("reports a conflict between %s and %s", (first, second) => {
    expect(() => planFileRenames([file(first), file(second)])).toThrow(
      /^fileNameConflict: /,
    );
  });

  it("keeps the name of a directory or a link, so a file cannot take it", () => {
    expect(() => planFileRenames([file("abc.png"), directory("abc")])).toThrow(
      /^fileNameConflict: /,
    );
    expect(() => planFileRenames([link("abc"), file("abc.png")])).toThrow(
      /^fileNameConflict: /,
    );
  });

  it("never renames a directory or a link", () => {
    expect(planFileRenames([directory("sub.dir"), link("other.link")])).toEqual(
      [],
    );
  });
});

describe("planFolderFileRenames", () => {
  const createList = (folders) => async (path) => folders[path] ?? [];

  it("plans the renames of the files folder", async () => {
    const list = createList({
      "": [file("project.db"), directory("files")],
      files: [file("abc.png")],
    });

    await expect(planFolderFileRenames({ list })).resolves.toEqual([
      { from: "abc.png", to: "abc" },
    ]);
  });

  it("has nothing to rename without a files folder", async () => {
    const list = createList({ "": [file("project.db")] });

    await expect(planFolderFileRenames({ list })).resolves.toEqual([]);
  });

  it("refuses a files folder that is a link", async () => {
    const list = createList({ "": [link("files")], files: [file("abc.png")] });

    await expect(planFolderFileRenames({ list })).rejects.toThrow(
      /^importFailed: /,
    );
  });
});

describe("planArchiveExtraction", () => {
  it("accepts project.db at the root", () => {
    const { files } = plan([
      "project.db",
      "files/abc.png",
      "file-metadata/abc.mime",
    ]);

    expect(files).toEqual([
      { entry: "project.db", path: "project.db" },
      { entry: "files/abc.png", path: "files/abc" },
      { entry: "file-metadata/abc.mime", path: "file-metadata/abc.mime" },
    ]);
  });

  it("accepts project.db inside a single top-level folder", () => {
    const { files } = plan([
      "Project One/",
      "Project One/project.db",
      "Project One/files/abc",
    ]);

    expect(files).toEqual([
      { entry: "Project One/project.db", path: "project.db" },
      { entry: "Project One/files/abc", path: "files/abc" },
    ]);
  });

  it("ignores __MACOSX and dot entries", () => {
    const { files } = plan([
      "Project One/project.db",
      "Project One/files/abc.png",
      "Project One/files/.DS_Store",
      "Project One/.DS_Store",
      "__MACOSX/Project One/._project.db",
      "__MACOSX/Project One/files/._abc.png",
    ]);

    expect(files.map((item) => item.path)).toEqual(["project.db", "files/abc"]);
  });

  it("extracts the database sidecars and nothing else at the root", () => {
    const { files } = plan([
      "project.db",
      "project.db-wal",
      "project.db-shm",
      "project.db-journal",
      "notes.txt",
      "project.db-other",
    ]);

    expect(files.map((item) => item.path)).toEqual([
      "project.db",
      "project.db-wal",
      "project.db-shm",
      "project.db-journal",
    ]);
  });

  it("skips directories and anything below files/<name>", () => {
    const { files } = plan([
      "project.db",
      "files/",
      "files/nested/",
      "files/nested/deep.png",
      "files/abc.png",
      "file-metadata/",
      "file-metadata/nested/x.mime",
      "extra/readme.txt",
    ]);

    expect(files.map((item) => item.path)).toEqual(["project.db", "files/abc"]);
  });

  it("treats a missing files folder as empty", () => {
    expect(plan(["project.db"]).files).toEqual([
      { entry: "project.db", path: "project.db" },
    ]);
  });

  it("sums the declared sizes of the extracted entries only", () => {
    const { totalBytes } = plan([
      { name: "project.db", size: 100 },
      { name: "files/abc.png", size: 20 },
      { name: "files/.hidden", size: 999 },
      { name: "notes.txt", size: 999 },
    ]);

    expect(totalBytes).toBe(120);
  });

  it("applies Rule A to the extracted file names", () => {
    expect(() =>
      plan(["project.db", "files/abc.png", "files/abc.jpg"]),
    ).toThrow(/^fileNameConflict: /);
    expect(() => plan(["project.db", "files/a b.png"])).toThrow(
      /^invalidFileName: /,
    );
    expect(() =>
      plan(["project.db", "files/abc.png", "files/abc/", "files/abc/x"]),
    ).toThrow(/^fileNameConflict: /);
  });

  it.each([
    [["readme.txt"]],
    [["project.db/"]],
    [["a/project.db", "b/files/x"]],
    [["a/b/project.db"]],
  ])("rejects an archive without a usable project.db: %j", (names) => {
    expect(() => plan(names)).toThrow(/^invalidArchive: /);
  });

  it("rejects an export that is marked incomplete", () => {
    expect(() => plan(["project.db", "ROUTEVN_EXPORT_INCOMPLETE.txt"])).toThrow(
      /^invalidArchive: /,
    );
    expect(() =>
      plan(["P/project.db", "P/ROUTEVN_EXPORT_INCOMPLETE.txt/"]),
    ).toThrow(/^invalidArchive: /);
  });

  it.each([
    ["files/../escape"],
    ["/absolute"],
    ["files\\evil"],
    ["files/a:b"],
    ["./project.db"],
    ["files//abc"],
    ["files/nul\0name"],
  ])("rejects the unsafe entry name %j", (name) => {
    expect(() => plan(["project.db", name])).toThrow(/^unsafeArchiveEntry: /);
  });

  it("still ignores everything below __MACOSX, even unusual names", () => {
    expect(() => plan(["project.db", "__MACOSX/a:b/\\c"])).not.toThrow();
  });

  it("rejects entries that differ only by case", () => {
    expect(() => plan(["project.db", "files/abc", "files/ABC"])).toThrow(
      /^invalidArchive: /,
    );
  });

  it("rejects an archive with too many entries", () => {
    expect(() =>
      plan(["project.db", "files/a", "files/b"], {
        limits: { maxArchiveEntries: 2, maxExtractedBytes: 100 },
      }),
    ).toThrow(/^invalidArchive: /);
  });

  it("rejects an archive that declares too many bytes", () => {
    expect(() =>
      plan([{ name: "project.db", size: 11 }], {
        limits: { maxArchiveEntries: 10, maxExtractedBytes: 10 },
      }),
    ).toThrow(/^archiveTooLarge: /);
  });
});
