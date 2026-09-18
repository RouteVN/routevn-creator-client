import { readFixtureJson } from "./fixtureIO.mjs";
import { describe, it, expect } from "vitest";
import { mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  assertEquivalent,
  assertPreservedSourceRecords,
  encodeValue,
  readSourceRecords,
} from "./records.mjs";
const root = "tests/fixtures/legacy-projects";
const read = readFixtureJson;
function removeProperty(value, name) {
  if (!Array.isArray(value)) return false;
  if (value[0] === "object") {
    const index = value[1].findIndex(([key]) => key === name);
    if (index !== -1) {
      value[1].splice(index, 1);
      return true;
    }
  }
  return value.some((item) => removeProperty(item, name));
}

describe("frozen compatibility harness negative controls", () => {
  it("detects loss of an unknown legacy action in an otherwise valid project", () => {
    const expected = read(`${root}/P03-draft/expected/previous-reader.json`);
    const damaged = structuredClone(expected);
    expect(removeProperty(damaged, "legacyAction")).toBe(true);
    expect(() => assertEquivalent(expected, damaged, "P03")).toThrow(
      /first difference/,
    );
  });
  it("detects reordered atlas frame keys despite identical values", () => {
    const expected = read(`${root}/P05-draft/expected/previous-reader.json`);
    const damaged = structuredClone(expected);
    let reversed = false;
    const visit = (value) => {
      if (!Array.isArray(value) || reversed) return;
      if (
        value[0] === "object" &&
        value[1].map(([key]) => key).join(",") === "frame-one,frame-two"
      ) {
        value[1].reverse();
        reversed = true;
      } else value.forEach(visit);
    };
    visit(damaged);
    expect(reversed).toBe(true);
    expect(() => assertEquivalent(expected, damaged, "P05")).toThrow(
      /first difference/,
    );
  });
  it("detects a changed payload byte in a real database even when JSON meaning is unchanged", () => {
    const directory = mkdtempSync(join(tmpdir(), "rvn-negative-"));
    const path = join(directory, "project.db");
    copyFileSync(`${root}/P01-draft/source/project.db`, path);
    try {
      const before = readSourceRecords(path);
      const database = new DatabaseSync(path);
      try {
        const { payload } = database
          .prepare("SELECT payload FROM local_drafts WHERE id = ?")
          .get("bootstrap-one");
        const changed = Buffer.concat([Buffer.from(payload), Buffer.from(" ")]);
        expect(JSON.parse(changed)).toEqual(JSON.parse(Buffer.from(payload)));
        database
          .prepare("UPDATE local_drafts SET payload = ? WHERE id = ?")
          .run(changed, "bootstrap-one");
      } finally {
        database.close();
      }
      expect(() =>
        assertPreservedSourceRecords(
          before,
          readSourceRecords(path),
          "raw byte",
        ),
      ).toThrow(/raw drafts/);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
  it("detects the removal of a required recovery checkpoint", () => {
    const before = read(
      `${root}/P07-recovery-draft/expected/source-records.json`,
    );
    const damaged = structuredClone(before);
    expect(damaged.checkpoints.length).toBeGreaterThan(0);
    damaged.checkpoints.pop();
    expect(() => assertPreservedSourceRecords(before, damaged, "P07")).toThrow(
      /recovery source/,
    );
  });
  it("detects dropped version metadata without relying on payload shape", () => {
    const expected = encodeValue({
      schemaVersion: 2,
      modelSchemaVersion: 16,
      payload: { name: "Project One" },
    });
    const damaged = structuredClone(expected);
    expect(removeProperty(damaged, "modelSchemaVersion")).toBe(true);
    expect(() => assertEquivalent(expected, damaged, "version")).toThrow(
      /first difference/,
    );
  });
  it("distinguishes absent, undefined, null, and ordered dictionary keys", () => {
    for (const [left, right] of [
      [{}, { value: undefined }],
      [{ value: undefined }, { value: null }],
      [
        { b: 1, a: 2 },
        { a: 2, b: 1 },
      ],
    ]) {
      expect(() =>
        assertEquivalent(encodeValue(left), encodeValue(right), "typed"),
      ).toThrow(/first difference/);
    }
  });
});
