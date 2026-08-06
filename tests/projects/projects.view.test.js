import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setProjects,
  setProjectsLoading,
  openDeleteDialog,
} from "../../src/pages/projects/projects.store.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const VIEW = "src/pages/projects/projects.view.yaml";

const render = (state) =>
  renderViewYaml(VIEW, selectViewData({ state, i18n: EN_I18N }));

describe("projects view", () => {
  it("renders the loading state before any project list", () => {
    const state = createInitialState();
    setProjectsLoading({ state }, { loading: true });

    const html = render(state);

    expect(html).toContain(EN_I18N.projectsPage.loadingMessage);
    expect(html).not.toContain(EN_I18N.projectsPage.localEmptyTitle);
  });

  it("renders the empty state once loading settles with no projects", () => {
    const state = createInitialState();
    setProjectsLoading({ state }, { loading: false });
    setProjects({ state }, { projects: [] });

    const html = render(state);

    expect(html).not.toContain(EN_I18N.projectsPage.loadingMessage);
    expect(html).toContain(EN_I18N.projectsPage.localEmptyTitle);
  });

  it("renders one entry per project once loaded", () => {
    const state = createInitialState();
    setProjectsLoading({ state }, { loading: false });
    setProjects(
      { state },
      {
        projects: [
          { id: "project-1", name: "Project One" },
          { id: "project-2", name: "Project Two" },
        ],
      },
    );

    const html = render(state);

    expect(html).toContain("Project One");
    expect(html).toContain("Project Two");
    expect(html).toContain('id="projectItem0"');
    expect(html).toContain('id="projectItem1"');
  });

  it("keeps the project list container free of asymmetric padding", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectsView).toContain(
      'rtgl-view w=f d=v style="max-width: 1280px;"',
    );
    expect(projectsView).not.toContain(
      'rtgl-view w=f d=v pl=md style="max-width: 1280px;"',
    );
    expect(projectsView).not.toContain(
      'rtgl-view w=f d=v ph=md style="max-width: 1280px;"',
    );
    expect(projectsView).not.toContain(
      'rtgl-view w=f d=v ph=lg style="max-width: 1280px;"',
    );
  });

  it("exposes the create-project affordance the E2E specs select on", () => {
    const html = render(createInitialState());

    // vt/specs/projects/projects.yaml drives the app through this test id.
    expect(html).toContain('data-testid="create-project-button"');
    expect(html).toContain('id="createButton"');
  });

  it("offers only the remove action in the project removal confirmation", () => {
    const state = createInitialState();
    openDeleteDialog(
      { state },
      { projectId: "project-1", projectName: "Project One" },
    );

    const html = render(state);

    expect(html).toContain('id="deleteConfirmButton"');
    expect(html).not.toContain("deleteCancelButton");
  });
});
