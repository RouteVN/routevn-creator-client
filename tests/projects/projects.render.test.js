import { readFileSync } from "node:fs";
import { h } from "snabbdom/build/h.js";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import { parse } from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/index.js";
import * as handlerExports from "../../src/pages/projects/projects.handlers.js";
import {
  createInitialState,
  selectViewData,
  setProjects,
} from "../../src/pages/projects/projects.store.js";

const EN_I18N = yaml.load(
  readFileSync(new URL("../../src/i18n/en.yaml", import.meta.url), "utf8"),
);
const PROJECTS_VIEW = yaml.load(
  readFileSync(
    new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
    "utf8",
  ),
);
const handlers = { ...handlerExports };

describe("projects render", () => {
  it("renders a local project whose path contains spaces", () => {
    const state = createInitialState();
    setProjects(
      { state },
      {
        projects: [
          {
            id: "shared-project-id",
            name: "Project One",
            projectPath: "/projects/Project One 2",
          },
        ],
      },
    );
    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(() =>
      parseView({
        h,
        template: parse(PROJECTS_VIEW.template),
        viewData,
        refs: PROJECTS_VIEW.refs,
        handlers,
      }),
    ).not.toThrow();
  });
});
