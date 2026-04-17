import { describe, expect, it } from "vitest";
import {
  addProject,
  createInitialState,
} from "../../src/pages/projects/projects.store.js";

describe("projects.store addProject", () => {
  it("replaces an existing project with the same id instead of appending a duplicate", () => {
    const state = createInitialState();

    addProject(
      {
        state,
      },
      {
        project: {
          id: "project-1",
          name: "DiaLune",
          projectPath: "/old/DiaLune-migrated",
        },
      },
    );

    addProject(
      {
        state,
      },
      {
        project: {
          id: "project-1",
          name: "DiaLune",
          projectPath: "/new/DiaLune-migrated",
        },
      },
    );

    expect(state.projects).toEqual([
      {
        id: "project-1",
        name: "DiaLune",
        projectPath: "/new/DiaLune-migrated",
      },
    ]);
  });
});
