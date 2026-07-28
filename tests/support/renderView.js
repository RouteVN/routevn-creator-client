import { readFileSync } from "node:fs";
import yaml from "js-yaml";
// Import `h` directly: snabbdom's index pulls in the style module, which touches
// `window` at import time and would force every render test into a DOM environment.
import { h } from "snabbdom/build/h.js";
import toHTML from "snabbdom-to-html";
// @rettangoli/fe does not export ./src/parser.js in its exports map, so reach it
// by path. If a future release exports the parser, switch to the bare specifier.
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
// `rtgl fe` compiles view.yaml templates to a jempl AST at build time; parseView
// expects that AST, so tests must run the same parse step.
import jemplParse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";

/**
 * Renders a component's `.view.yaml` against real view data and returns HTML.
 *
 * The older `*.view.test.js` pattern read the raw YAML and asserted
 * `expect(view).toContain("rtgl-dialog#fooDialog")` — that is a check that a file
 * contains its own text. It passes when the component is broken at runtime and
 * fails on every harmless rename.
 *
 * This renders the template the way the framework does, so assertions are about
 * output: which elements exist for a given store state, what text they carry,
 * what is conditionally hidden. Feed it the output of the component's real
 * `selectViewData` and the test exercises the shipping template + selector.
 *
 *   const html = renderViewYaml(
 *     "src/pages/projects/projects.view.yaml",
 *     selectViewData({ state, i18n: EN_I18N }),
 *   );
 *   expect(html).toContain("data-testid=\"create-project-button\"");
 */
const REPO_ROOT = new URL("../../", import.meta.url);

export const loadViewTemplate = (relativePath) => {
  const source = readFileSync(new URL(relativePath, REPO_ROOT), "utf8");
  const parsed = yaml.load(source);
  // A view file is `refs:` + `template:`; only the template is renderable.
  return parsed?.template ?? parsed;
};

export const renderViewYaml = (relativePath, viewData = {}, options = {}) => {
  const template = jemplParse(loadViewTemplate(relativePath));
  const vdom = parseView({
    h,
    template,
    viewData,
    refs: options.refs ?? {},
    handlers: options.handlers ?? {},
  });
  return toHTML(vdom);
};

/**
 * Convenience for the common assertion: which element ids the template rendered.
 * Returns them in document order so tests can assert ordering as well as presence.
 */
export const renderedElementIds = (html) =>
  Array.from(html.matchAll(/\bid="([^"]+)"/g)).map(([, id]) => id);
