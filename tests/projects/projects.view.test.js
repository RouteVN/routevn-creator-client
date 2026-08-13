import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("projects view", () => {
  it("shows loading before the settled empty-project state", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    const loadingIndex = projectsView.indexOf("$if isProjectsLoading:");
    const emptyIndex = projectsView.indexOf("$elif localEmptyMessage:");

    expect(loadingIndex).toBeGreaterThan(-1);
    expect(emptyIndex).toBeGreaterThan(loadingIndex);
    expect(projectsView).toContain("rtgl-text s=lg c=mu-fg: ${loadingMessage}");
  });

  it("uses the shared navbar style for the projects title and mobile create action", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectsView).toContain(
      "rtgl-view h=48 w=f bgc=bg bwb=xs ph=md av=c",
    );
    expect(projectsView).toContain("rtgl-text: ${localTitle}");
    expect(projectsView).toContain(
      'rtgl-button#mobileCreateMenuButton pre=plus title="${createButtonText}" aria-label="${createButtonText}"\': ${createButtonText}',
    );
    expect(projectsView).not.toContain("rtgl-button#mobileCreateMenuButton v=");
    expect(projectsView).not.toContain("rtgl-button#mobileCreateMenuButton sq");
    expect(projectsView).not.toContain("rtgl-text s=h3: ${localTitle}");
    expect(projectsView).not.toContain("pt=lg pb=md");
    expect(projectsView).not.toContain(
      'rtgl-button#mobileCreateMenuButton sq pre=plus v="gh"',
    );
  });

  it("keeps the app version visible outside the scrollable project list", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    const scrollContainerIndex = projectsView.indexOf(
      'rtgl-view w=f h=1fg ah=c sv style="min-height: 0;"',
    );
    const footerContainerIndex = projectsView.indexOf(
      'rtgl-view w=f ah=c bgc=bg style="flex-shrink: 0;"',
    );
    const footerTextIndex = projectsView.indexOf(
      "rtgl-text s=xs c=mu-fg: RouteVN Creator ${appVersion}",
    );

    expect(scrollContainerIndex).toBeGreaterThan(-1);
    expect(footerContainerIndex).toBeGreaterThan(scrollContainerIndex);
    expect(projectsView).toContain("rtgl-view sm-w=f w=640 ph=md pv=lg ah=c");
    expect(projectsView).toContain("$if platform != 'web'");
    expect(projectsView).toContain("rtgl-view#appVersionButton");
    expect(projectsView).toContain(
      "rtgl-dropdown-menu#appVersionDropdownMenu ?open=${appVersionMenu.isOpen} x=${appVersionMenu.x} y=${appVersionMenu.y} place=t :items=${appVersionMenu.items}",
    );
    expect(projectsView).toContain("handler: handleAppVersionClick");
    expect(projectsView).toContain("handler: handleAppVersionMenuClickItem");
    expect(projectsView).toContain("handler: handleLanguageDialogClose");
    expect(projectsView).toContain("handler: handleLanguageFormAction");
    expect(projectsView).toContain("rtgl-dialog#languageDialog");
    expect(projectsView).toContain("rtgl-form#languageForm");
    expect(footerTextIndex).toBeGreaterThan(footerContainerIndex);
    expect(projectsView).not.toContain("rtgl-view w=f ah=c pb=lg");
  });

  it("gives project items symmetric horizontal padding", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectsView).toContain(
      'rtgl-view w=f d=v ph=md style="max-width: 1280px; box-sizing: border-box;"',
    );
    expect(projectsView).not.toContain(
      'rtgl-view w=f d=v pl=md style="max-width: 1280px;"',
    );
    expect(projectsView).not.toContain(
      'rtgl-view w=f d=v ph=lg style="max-width: 1280px;"',
    );
  });

  it("uses the resource form dialog layout for project creation", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );
    const projectCreateDialogView = readFileSync(
      new URL(
        "../../src/components/projectCreateDialog/projectCreateDialog.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(projectsView).toContain(
      "rtgl-dialog#createProjectDialog ?open=${createDialog.isOpen} s=md md-layout=fixed-top p=none",
    );
    expect(projectsView).toContain(
      "rtgl-view slot=content d=v w=f h=f overflow=hidden",
    );
    expect(projectCreateDialogView).toContain(
      "rtgl-form#createProjectForm key=${formKey} :defaultValues=${defaultValues} :form=${form} :context=${context} w=f h=f",
    );
    expect(projectsView).toContain("handler: handleCreateDialogSubmit");
    expect(projectsView).not.toContain("createProjectSubmitButton");
    expect(projectsView).not.toContain("h=80 aria-hidden=true");
  });

  it("shows only the remove action in the project removal confirmation", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectsView).toContain("rtgl-button#deleteConfirmButton v=pr");
    expect(projectsView).not.toContain("deleteCancelButton");
    expect(projectsView).not.toContain("handleDeleteDialogCancel");
  });
});
