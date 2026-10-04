import { describe, expect, it } from "vitest";
import {
  planArchiveExtraction,
  planFileRenames,
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

describe("planFileRenames (Rule A)", () => {
  it("renames files to the part before the first dot and leaves everything else alone", () => {
    const longId = "a".repeat(128);

    expect(
      planFileRenames([
        file("abc.png"),
        file("a_b-1.tar.gz"),
        file(`${longId}.png`),
        file("plain"),
        file(".DS_Store"),
        file("._abc.png"),
        directory("sub.dir"),
        link("other.link"),
      ]),
    ).toEqual([
      { from: "abc.png", to: "abc" },
      { from: "a_b-1.tar.gz", to: "a_b-1" },
      { from: `${longId}.png`, to: longId },
    ]);
  });

  it.each([
    [[file("a b.png")], /^invalidFileName: a b\.png$/],
    [[file(`${"a".repeat(129)}.png`)], /^invalidFileName: /],
    [[file("abc.png"), file("abc.jpg")], /^fileNameConflict: /],
    [[file("abc"), file("abc.png")], /^fileNameConflict: /],
    [[file("abc.png"), file("ABC.jpg")], /^fileNameConflict: /],
    [[file("abc.png"), directory("abc")], /^fileNameConflict: /],
    [[link("abc"), file("abc.png")], /^fileNameConflict: /],
  ])("rejects %j", (entries, error) => {
    expect(() => planFileRenames(entries)).toThrow(error);
  });
});

describe("planArchiveExtraction", () => {
  it("extracts a project from a single top-level folder with Rule A applied", () => {
    const { files, totalBytes } = plan([
      "Project One/",
      { name: "Project One/project.db", size: 100 },
      { name: "Project One/files/abc.png", size: 20 },
      { name: "Project One/file-metadata/abc.mime", size: 3 },
      { name: "Project One/notes.txt", size: 999 },
    ]);

    expect(files).toEqual([
      { entry: "Project One/project.db", path: "project.db" },
      { entry: "Project One/files/abc.png", path: "files/abc" },
      {
        entry: "Project One/file-metadata/abc.mime",
        path: "file-metadata/abc.mime",
      },
    ]);
    expect(totalBytes).toBe(123);
  });

  it.each([
    [
      "project.db at the root",
      ["project.db", "files/abc"],
      ["project.db", "files/abc"],
    ],
    ["no files folder", ["project.db"], ["project.db"]],
    [
      "__MACOSX and dot entries",
      [
        "P/project.db",
        "P/files/.DS_Store",
        "P/.DS_Store",
        "__MACOSX/P/._project.db",
        "__MACOSX/a:b/\\c",
      ],
      ["project.db"],
    ],
    [
      "sidecars and stray root files",
      [
        "project.db",
        "project.db-wal",
        "project.db-shm",
        "project.db-journal",
        "project.db-other",
        "notes.txt",
      ],
      ["project.db", "project.db-wal", "project.db-shm", "project.db-journal"],
    ],
    [
      "nested and unknown folders",
      [
        "project.db",
        "files/",
        "files/nested/",
        "files/nested/deep.png",
        "file-metadata/nested/x.mime",
        "extra/readme.txt",
      ],
      ["project.db"],
    ],
  ])("extracts only the project files from %s", (_label, names, paths) => {
    expect(plan(names).files.map((item) => item.path)).toEqual(paths);
  });

  it.each([
    [["readme.txt"], /^invalidArchive: /],
    [["project.db/"], /^invalidArchive: /],
    [["a/project.db", "b/files/x"], /^invalidArchive: /],
    [["a/b/project.db"], /^invalidArchive: /],
    [["project.db", "ROUTEVN_EXPORT_INCOMPLETE.txt"], /^invalidArchive: /],
    [["P/project.db", "P/ROUTEVN_EXPORT_INCOMPLETE.txt/"], /^invalidArchive: /],
    [["project.db", "files/abc", "files/ABC"], /^invalidArchive: /],
    [["project.db", "files/../escape"], /^unsafeArchiveEntry: /],
    [["project.db", "/absolute"], /^unsafeArchiveEntry: /],
    [["project.db", "files\\evil"], /^unsafeArchiveEntry: /],
    [["project.db", "files/a:b"], /^unsafeArchiveEntry: /],
    [
      ["project.db", "files/abc.png", "files/abc/", "files/abc/x"],
      /^fileNameConflict: /,
    ],
    [["project.db", "files/a b.png"], /^invalidFileName: /],
  ])("rejects %j", (names, error) => {
    expect(() => plan(names)).toThrow(error);
  });

  it.each([
    [["project.db", "files/a", "files/b"], /^invalidArchive: /],
    [[{ name: "project.db", size: 11 }], /^archiveTooLarge: /],
  ])("rejects an archive over the limits: %j", (names, error) => {
    expect(() =>
      plan(names, { limits: { maxArchiveEntries: 2, maxExtractedBytes: 10 } }),
    ).toThrow(error);
  });
});
