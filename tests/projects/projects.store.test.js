import { describe, expect, it } from "vitest";
import {
  addProject,
  closeAppVersionMenu,
  createInitialState,
  openAppVersionMenu,
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

  it("opens the app version menu with a check update action", () => {
    const state = createInitialState();

    openAppVersionMenu({ state }, { x: 120, y: 320 });

    expect(state.appVersionMenu).toEqual({
      isOpen: true,
      x: 120,
      y: 320,
      items: [
        {
          label: "Check for update",
          type: "item",
          value: "check-update",
        },
      ],
    });

    closeAppVersionMenu({ state });

    expect(state.appVersionMenu).toEqual({
      isOpen: false,
      x: 0,
      y: 0,
      items: [],
    });
  });
});
