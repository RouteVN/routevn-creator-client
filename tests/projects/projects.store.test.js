import { describe, expect, it } from "vitest";
import {
  addProject,
  closeAppVersionMenu,
  createInitialState,
  openLanguageDialog,
  openAppVersionMenu,
  selectViewData,
  setPlatform,
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
        {
          label: "Language",
          type: "item",
          value: "language",
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

  it("does not open the app version update menu on web", () => {
    const state = createInitialState();
    setPlatform({ state }, { platform: "web" });

    openAppVersionMenu({ state }, { x: 120, y: 320 });

    expect(state.appVersionMenu).toEqual({
      isOpen: false,
      x: 0,
      y: 0,
      items: [],
    });
  });

  it("builds the language dialog form with en, ja, and zh-hans options", () => {
    const state = createInitialState();

    openLanguageDialog({ state }, { locale: "ja" });
    const viewData = selectViewData({ state });

    expect(state.languageDialog).toEqual({
      isOpen: true,
      formKey: 1,
      defaultValues: {
        locale: "ja",
      },
    });
    expect(viewData.languageForm).toMatchObject({
      title: "Language",
      fields: [
        {
          name: "locale",
          type: "select",
          label: "Language",
          required: true,
          options: [
            {
              value: "en",
              label: "English",
            },
            {
              value: "ja",
              label: "日本語",
            },
            {
              value: "zh-hans",
              label: "简体中文",
            },
          ],
        },
      ],
    });
  });
});
