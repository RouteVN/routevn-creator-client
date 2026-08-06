/**
 * Recursive server renderer for @rettangoli/fe components, in bare Node.
 *
 * Renders a component tree the way the browser would on its FIRST synchronous
 * render: createInitialState -> selectViewData -> parseView. Handlers are NOT
 * run -- handleBeforeMount touches document/window in several components and
 * would be the wrong thing to execute on a server anyway. So this produces the
 * app's initial/empty state, which is exactly the pre-data paint we want.
 *
 * The recursion is the point. parseView emits `<rvn-projects></rvn-projects>`
 * as an empty tag because components are wired by tag NAME, not by import.
 * Without recursion the whole app shell serializes to 688 bytes of nothing.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import yaml from "js-yaml";
import { h } from "snabbdom/build/h.js";

import { serializeVNode } from "./serialize.js";

/** The framework's real store binder -- pure, immer-backed, DOM-free. */
const loadBindStore = async (root) =>
  (await import(pathToFileURL(path.join(root, FE, "src/core/runtime/store.js")).href)).bindStore;

const FE = "node_modules/@rettangoli/fe";

/**
 * Store actions the server runs after createInitialState to seed prop-derived
 * state. Convention-based: a real implementation would name one hook.
 */
const SERVER_SAFE_SYNC_ACTIONS = ["syncFromProps"];

/**
 * Primitives that RESTRUCTURE their own light DOM when they upgrade.
 *
 * `rtgl-popover` moves all of its children into a synthesized `rtgl-view`
 * wrapper (`popover.js:407-427`). Because the UI bundle is a blocking script,
 * that happens at PARSE time -- before hydration runs -- so the DOM the client
 * zips against is no longer what the server emitted, and every popover reports
 * a child-count mismatch.
 *
 * The primitive already adopts a pre-existing wrapper (`popover.js:407`), so
 * the fix is for the server to emit it. This is the only structural offender
 * among the 19 primitives; the rest only set attributes, which the hydrating
 * patch re-applies idempotently.
 */
const _LIGHT_DOM_RESTRUCTURING_PRIMITIVES = ["rtgl-popover"];

/** Loaded lazily so a caller can point at a different app root. */
const loadFeParser = async (root) => {
  const parserUrl = pathToFileURL(path.join(root, FE, "src/parser.js"));
  const jemplUrl = pathToFileURL(
    path.join(root, FE, "node_modules/jempl/src/parse/index.js"),
  );
  const { parseView } = await import(parserUrl.href);
  const jemplParse = (await import(jemplUrl.href)).default;
  return { parseView, jemplParse };
};

/**
 * Scan src/components and src/pages for *.schema.yaml and build
 * componentName -> { dir, name } so we can resolve a tag to its files.
 */
export const buildRegistry = (root, dirs = ["src/components", "src/pages"]) => {
  const registry = new Map();

  for (const rel of dirs) {
    const base = path.join(root, rel);
    if (!existsSync(base)) continue;

    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(base, entry.name);
      const schemaPath = path.join(dir, `${entry.name}.schema.yaml`);
      if (!existsSync(schemaPath)) continue;

      let schema;
      try {
        schema = yaml.load(readFileSync(schemaPath, "utf8"));
      } catch {
        continue;
      }
      if (!schema?.componentName) continue;

      registry.set(schema.componentName, { dir, name: entry.name, schema });
    }
  }

  return registry;
};

const readYaml = (file) =>
  existsSync(file) ? yaml.load(readFileSync(file, "utf8")) : null;

const loadModule = async (file) => {
  if (!existsSync(file)) return null;
  try {
    return await import(pathToFileURL(file).href);
  } catch (error) {
    return { __error: error };
  }
};

/**
 * @returns {Promise<{html: string, stats: object}>}
 */
/** Strip parseView's `h("div",{style:{display:contents}})` wrapper. */
const stripRoot = (html) =>
  html.replace(/^<div style="display: contents">/, "").replace(/<\/div>$/, "");

export const renderComponentTree = async ({
  root,
  rootTag,
  rootProps = {},
  locale = "en",
  maxDepth = 12,
  /**
   * When true, every nested fe component is emitted with its OWN declarative
   * shadow root instead of having its subtree inlined as light DOM.
   *
   * This matters for hydration. Each fe component attaches its own shadow root
   * on upgrade and renders into it. If the server put the child's subtree in
   * the child's LIGHT DOM, that subtree becomes unslotted the moment the child
   * upgrades -- it paints before JS, then is silently orphaned and replaced.
   * Giving each component its own DSD is what lets each one adopt its own
   * server output.
   */
  nestedShadow = false,
  /**
   * Stub dependency bag handed to handleBeforeMount. Supplies the environment
   * the server knows (platform, locale) plus inert versions of the services
   * handlers reach for. Without it, stores keep hardcoded defaults.
   */
  serverDeps = null,
  /** Store actions to run on the ROOT before rendering, e.g. seeding the route. */
  seedRoot = null,
  /** Where to scan for components. Defaults to the app's own dirs. */
  dirs = ["src/components", "src/pages"],
}) => {
  const { parseView, jemplParse } = await loadFeParser(root);
  const bindStore = await loadBindStore(root);
  const registry = buildRegistry(root, dirs);

  const i18n = readYaml(path.join(root, "src/i18n", `${locale}.yaml`)) || {};

  const stats = {
    rendered: [],
    skippedUnknown: [],
    failed: [],
    syncFailed: [],
    beforeMountRan: [],
    beforeMountFailed: [],
    depthCapped: [],
    componentCount: 0,
  };

  const templateCache = new Map();

  const renderOne = async (tag, props, depth) => {
    if (depth > maxDepth) {
      stats.depthCapped.push(tag);
      return null;
    }

    const record = registry.get(tag);
    if (!record) {
      // Not an fe component (e.g. an rtgl-* primitive) -- serialize normally.
      return null;
    }

    const viewPath = path.join(record.dir, `${record.name}.view.yaml`);
    const view = readYaml(viewPath);
    if (!view?.template) {
      stats.failed.push({ tag, reason: "no template" });
      return null;
    }

    const constants =
      readYaml(path.join(record.dir, `${record.name}.constants.yaml`)) || {};

    const storeModule = await loadModule(
      path.join(record.dir, `${record.name}.store.js`),
    );
    if (storeModule?.__error) {
      stats.failed.push({ tag, reason: storeModule.__error.message });
      return null;
    }

    let viewData = {};
    try {
      // Use the framework's own bindStore so handlers see a real store with
      // immer-backed actions -- the same object the browser gives them.
      const boundStore = bindStore(storeModule || {}, props, constants, {
        getI18n: () => i18n,
        locale,
      });

      /**
       * Run handleBeforeMount against a stubbed deps bag.
       *
       * This is the step that decides SSR parity. The client's order is
       * runBeforeMount -> render, and handlers seed state from INJECTED
       * DEPENDENCIES, not from props: projects.handlers.js:124-126 is
       * `const platform = appService.getPlatform(); store.setPlatform({platform})`.
       * Skip it and the store keeps its hardcoded default -- which for
       * projects.store.js:25 is `platform: "tauri"`, wrong on web, and is
       * exactly what made rtgl-form render 2 children instead of 1.
       *
       * Handlers that reach for the DOM or an uninitialised repository throw;
       * that is fine and expected. We catch per component and record it, so a
       * hostile component degrades to its default state instead of failing the
       * whole render.
       */
      if (serverDeps && typeof storeModule?.handleBeforeMount !== "function") {
        // no-op: nothing to run
      }
      const handlersModule = serverDeps
        ? await loadModule(path.join(record.dir, `${record.name}.handlers.js`))
        : null;

      if (handlersModule && !handlersModule.__error && handlersModule.handleBeforeMount) {
        try {
          const deps = {
            ...serverDeps,
            store: boundStore,
            props,
            constants,
            refs: {},
            i18n,
            locale,
            dispatchEvent: () => true,
            render: () => {},
          };
          handlersModule.handleBeforeMount(deps);
          stats.beforeMountRan.push(tag);
        } catch (error) {
          stats.beforeMountFailed.push({ tag, reason: error.message });
        }
      }

      /**
       * Many stores ignore `props` in createInitialState and seed from props in
       * a separate action that a HANDLER calls (projectCreateDialog.store.js:
       * `createInitialState = () => ({ platform: "tauri", ... })` plus
       * `syncFromProps({state},{props})`). The server skips handlers, so without
       * this the component renders its hardcoded default -- which is what made
       * rtgl-form emit 2 children where the client renders 1.
       *
       * These actions are pure immer-style draft mutations, so they are safe to
       * run on the server. Calling them is the difference between a hydration
       * mismatch and a clean adoption.
       */
      // Seed the root component (route, payload) before anything renders.
      if (depth === 0 && seedRoot) {
        for (const [action, payload] of Object.entries(seedRoot)) {
          if (typeof boundStore[action] === "function") boundStore[action](payload);
        }
      }

      for (const name of SERVER_SAFE_SYNC_ACTIONS) {
        if (typeof boundStore?.[name] === "function") {
          try {
            boundStore[name]({ props });
          } catch (error) {
            stats.syncFailed.push({ tag, action: name, reason: error.message });
          }
        }
      }

      const context = { state: boundStore.getState(), props, constants, i18n, locale };
      const selected = storeModule?.selectViewData
        ? storeModule.selectViewData(context)
        : {};
      viewData = { ...selected, i18n };
    } catch (error) {
      stats.failed.push({ tag, reason: `store: ${error.message}` });
      return null;
    }

    let vdom;
    try {
      if (!templateCache.has(viewPath)) {
        templateCache.set(viewPath, jemplParse(view.template));
      }
      vdom = parseView({
        h,
        template: templateCache.get(viewPath),
        viewData,
        refs: view.refs || {},
        handlers: {},
      });
    } catch (error) {
      stats.failed.push({ tag, reason: `parseView: ${error.message}` });
      return null;
    }

    stats.rendered.push(tag);
    stats.componentCount += 1;

    return serializeTree(vdom, depth);
  };

  /**
   * Serialization is synchronous but recursion needs async module loads, so we
   * pre-resolve every fe child in the tree, then serialize with a sync lookup.
   */
  const serializeTree = async (vdom, depth) => {
    const substitutions = new Map();

    const collect = async (node) => {
      if (!node || typeof node !== "object") return;
      if (node.sel && registry.has(node.sel)) {
        // Attribute-form bindings are mirrored into data.props by the parser;
        // property-form (`:prop=${obj}`) values only exist there. Both are
        // legitimate inputs to the child's store on the server.
        const props = { ...node.data?.props, ...node.data?.attrs };
        const rendered = await renderOne(node.sel, props, depth + 1);
        if (rendered !== null) {
          if (nestedShadow) {
            node.data = node.data ?? {};
            node.data.attrs = {
              ...node.data.attrs,
              "data-rtgl-hydrate": "",
            };
            substitutions.set(
              node,
              `<template shadowrootmode="open"><div data-rtgl-render-target style="display: contents">${stripRoot(rendered)}</div></template>`,
            );
          } else {
            substitutions.set(node, rendered);
          }
        }
      }
      for (const child of node.children || []) await collect(child);
    };

    await collect(vdom);

    return serializeVNode(vdom, {
      renderComponent: (node) =>
        substitutions.has(node) ? substitutions.get(node) : null,
    });
  };

  const html = await renderOne(rootTag, rootProps, 0);

  if (html === null) {
    throw new Error(`Root component '${rootTag}' could not be rendered.`);
  }

  /**
   * parseView always wraps in `h("div", {style:{display:"contents"}}, ...)`.
   * On the client, `patch(renderTarget, vDom)` makes the RENDER TARGET ITSELF
   * that root div -- snabbdom's emptyNodeAt matches sel "div" and adds the
   * children directly into it. So markup destined for inside
   * [data-rtgl-render-target] must be the root's CHILDREN, not the root.
   * Emitting the wrapper too produces an extra nesting level that can never
   * line up with the client tree.
   */
  const inner = stripRoot(html);

  return { html, inner, stats, registry };
};

export default renderComponentTree;
