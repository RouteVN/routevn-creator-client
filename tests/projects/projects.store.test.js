import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  addProject,
  closeAppVersionMenu,
  createInitialState,
  openLanguageDialog,
  openAppVersionMenu,
  removeProject,
  selectViewData,
  setPlatform,
  setProjects,
} from "../../src/pages/projects/projects.store.js";

const EN_I18N_URL = new URL("../../src/i18n/en.yaml", import.meta.url);
const EN_I18N = yaml.load(readFileSync(EN_I18N_URL, "utf8"));

describe("projects.store addProject", () => {
  it("keeps local projects with the same id when their paths differ", () => {
    const state = createInitialState();

    addProject(
      {
        state,
      },
      {
        project: {
          id: "project-1",
          name: "Project Two",
          projectPath: "/old/project-two-migrated",
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
          name: "Project Two",
          projectPath: "/new/project-two-migrated",
        },
      },
    );

    expect(state.projects).toEqual([
      {
        id: "project-1",
        name: "Project Two",
        projectPath: "/old/project-two-migrated",
      },
      {
        id: "project-1",
        name: "Project Two",
        projectPath: "/new/project-two-migrated",
      },
    ]);
  });

  it("replaces an existing local project with the same path", () => {
    const state = createInitialState();
    state.projects = [
      {
        id: "project-1",
        name: "Project One",
        projectPath: "/projects/project-one",
      },
    ];

    addProject(
      { state },
      {
        project: {
          id: "project-2",
          name: "Project One Updated",
          projectPath: "/projects/project-one",
        },
      },
    );

    expect(state.projects).toEqual([
      {
        id: "project-2",
        name: "Project One Updated",
        projectPath: "/projects/project-one",
      },
    ]);
  });

  it("derives local project row ids from project paths", () => {
    const state = createInitialState();
    setProjects(
      { state },
      {
        projects: [
          {
            id: "shared-project-id",
            name: "Project One",
            projectPath: "/projects/project-one",
          },
          {
            id: "shared-project-id",
            name: "Project Two",
            projectPath: "/projects/project-two",
          },
        ],
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.projects[0].itemId).not.toBe(viewData.projects[1].itemId);
    expect(viewData.projects[0].itemId).toMatch(/^projectItem[a-zA-Z0-9]+$/);
    expect(viewData.projects[1].itemId).toMatch(/^projectItem[a-zA-Z0-9]+$/);
    expect(viewData.projects[0].encodedProjectPath).toBe(
      encodeURIComponent("/projects/project-one"),
    );
    expect(viewData.projects[1].encodedProjectPath).toBe(
      encodeURIComponent("/projects/project-two"),
    );
  });

  it("removes only the local project at the selected path", () => {
    const state = createInitialState();
    state.projects = [
      {
        id: "shared-project-id",
        projectPath: "/projects/project-one",
      },
      {
        id: "shared-project-id",
        projectPath: "/projects/project-two",
      },
    ];

    removeProject(
      { state },
      {
        projectId: "shared-project-id",
        projectPath: "/projects/project-two",
      },
    );

    expect(state.projects).toEqual([
      {
        id: "shared-project-id",
        projectPath: "/projects/project-one",
      },
    ]);
  });

  it("opens the app version menu with a check update action", () => {
    const state = createInitialState();
    expect(EN_I18N.projectsPage.languageMenuItem).toBe("Language (Beta)");
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

  it("opens the app version menu without update items on web", () => {
    const state = createInitialState();
    setPlatform({ state }, { platform: "web" });

    openAppVersionMenu({ state }, { x: 120, y: 320 });

    expect(state.appVersionMenu).toEqual({
      isOpen: true,
      x: 120,
      y: 320,
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

describe("projects store loading state", () => {
  it("does not expose the empty state until projects finish loading", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isProjectsLoading: true,
      loadingMessage: "Loading...",
      localEmptyMessage: "",
      localEmptySubMessage: "",
    });

    setProjects({ state }, { projects: [] });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isProjectsLoading: false,
      localEmptyMessage: "No local projects yet",
      localEmptySubMessage: "Create or open a local project to get started",
    });
  });
});
