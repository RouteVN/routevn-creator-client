import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { h } from "snabbdom/build/h.js";
import { init } from "snabbdom/build/init.js";
import { attributesModule } from "snabbdom/build/modules/attributes.js";
import { propsModule } from "snabbdom/build/modules/props.js";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import jemplParse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";

/**
 * Patches a component's `.view.yaml` into a real DOM (needs a jsdom test
 * environment; `viewPath` is from the repository root), one view data after another, the way the framework does.
 * Use it to check what the DOM does between renders, such as whether an
 * element is kept, rebuilt or moved.
 *
 *   const view = mountViewYaml("src/pages/foo/foo.view.yaml");
 *   view.render(selectViewData(...));
 *   view.render(selectViewData(...));
 *   view.container.querySelector("#canvas");
 */
export const mountViewYaml = (viewPath) => {
  // jsdom replaces `URL`, so the view is read by its path from the
  // repository rather than through renderView.js.
  const template = jemplParse(
    yaml.load(readFileSync(viewPath, "utf8")).template,
  );
  const patch = init([attributesModule, propsModule]);
  const container = document.createElement("div");
  document.body.append(container);
  let vnode = document.createElement("div");
  container.append(vnode);
  return {
    container,
    render: (viewData) => {
      vnode = patch(
        vnode,
        h("div", {}, [
          parseView({ h, template, viewData, refs: {}, handlers: {} }),
        ]),
      );
    },
  };
};

/**
 * Defines `tagName` as a custom element that counts how often it leaves the
 * document. A move in the DOM counts too: the browser disconnects and
 * connects a custom element when it moves, which runs a component's unmount
 * and mount again.
 */
const disconnectCounts = new Map();

export const defineDisconnectCounter = (tagName) => {
  if (!disconnectCounts.has(tagName)) {
    const counts = { disconnects: 0 };
    disconnectCounts.set(tagName, counts);
    customElements.define(
      tagName,
      class extends HTMLElement {
        disconnectedCallback() {
          counts.disconnects += 1;
        }
      },
    );
  }
  return disconnectCounts.get(tagName);
};
