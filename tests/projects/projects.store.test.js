import { readFileSync } from "node:fs";
import yaml from "js-yaml";
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

const EN_I18N_URL = new URL("../../src/i18n/en.yaml", import.meta.url);
const EN_I18N = yaml.load(readFileSync(EN_I18N_URL, "utf8"));

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
    const items = [
      {
        label: EN_I18N.projectsPage.checkUpdateMenuItem,
        type: "item",
        value: "check-update",
      },
      {
        label: EN_I18N.projectsPage.languageMenuItem,
        type: "item",
        value: "language",
      },
    ];

    openAppVersionMenu({ state }, { x: 120, y: 320, items });

    expect(state.appVersionMenu).toEqual({
      isOpen: true,
      x: 120,
      y: 320,
      items,
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
    const viewData = selectViewData({ state, i18n: EN_I18N });

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
