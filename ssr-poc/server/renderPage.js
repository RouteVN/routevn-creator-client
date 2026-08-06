/**
 * The seam an application actually calls.
 *
 * In a real implementation everything above the `---- APP CODE ----` line
 * would live in `@rettangoli/fe/server` and be imported. It is reproduced here
 * so the POC is self-contained.
 *
 * The whole public surface is one function:
 *
 *     renderPage({ component, props, env }) -> { html, head }
 *
 * It is synchronous-in-spirit, has no DOM, no globals, and no per-request
 * state, so it is safe to call concurrently from an HTTP handler.
 */

import path from "node:path";

import { renderComponentTree } from "../lib/render.js";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const UI_VERSION = "1.13.1";

/**
 * Without this rule the component host is an unknown element (display: inline)
 * and the prerendered tree collapses to a ~14px strip.
 */
const HOST_CSS = `rvn-app{display:block;height:var(--rvn-app-viewport-height,100vh);min-height:0}`;

const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * @param {object} options
 * @param {string} options.component  root custom element name
 * @param {object} [options.props]    props for the root component
 * @param {object} [options.env]      what the SERVER knows: platform, locale, route.
 *                                    The client must be given the same values.
 * @returns {Promise<{html:string, head:string, stats:object}>}
 */
export const renderComponent = async ({ component, props = {}, env = {} }) => {
  const { inner, stats } = await renderComponentTree({
    root: APP_ROOT,
    rootTag: component,
    rootProps: props,
    locale: env.locale ?? "en",
    nestedShadow: true,
    serverDeps: createServerDeps(env),
  });

  // The root component's own declarative shadow root. Nested components get
  // theirs from the renderer.
  const html =
    `<${component} data-rtgl-hydrate="true">` +
    `<template shadowrootmode="open">` +
    `<div data-rtgl-render-target style="display: contents">${inner}</div>` +
    `</template>` +
    `</${component}>`;

  return { html, head: HOST_CSS, stats };
};

/**
 * Inert stand-ins for the services handlers reach for, plus the environment
 * the server genuinely knows. Everything here must match what the client is
 * told, or the two first renders diverge.
 */
const createServerDeps = (env) => {
  const noop = () => {};
  const inert = new Proxy({}, { get: () => () => undefined });
  return {
    appService: new Proxy(
      {
        getPlatform: () => env.platform ?? "web",
        getPath: () => env.route ?? "/",
        getPayload: () => env.query ?? {},
        getCurrentProjectId: () => env.projectId ?? "",
        getLocale: () => env.locale ?? "en",
        getTheme: () => env.theme ?? "dark",
        getUserConfig: () => ({}),
      },
      { get: (t, k) => t[k] ?? (() => undefined) },
    ),
    projectService: inert,
    apiService: inert,
    graphicsService: inert,
    audioService: inert,
    subject: { subscribe: noop, dispatchCall: () => noop, next: noop },
    globalUI: { emit: noop, once: noop, on: noop },
    uiConfig: { id: "normal", inputMode: "pointer", navigation: "sidebar" },
  };
};

/**
 * Assembles a full document. An app would normally own this template.
 *
 * NOTE the UI bundle is deliberately NOT deferred: it defines the primitives
 * before <body> parses, which is what makes the server markup paint styled.
 * Adding `defer` here measurably breaks the layout of the first frame.
 */
export const renderDocument = ({ html, head, env = {}, title, description }) => `<!doctype html>
<html lang="${escapeAttr(env.locale ?? "en")}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeAttr(title ?? "RouteVN Creator")}</title>${
      description ? `\n    <meta name="description" content="${escapeAttr(description)}" />` : ""
    }
    <meta name="robots" content="noindex" />
    <link rel="preload" as="script" href="/public/@rettangoli/ui@${UI_VERSION}/dist/rettangoli-iife-ui.min.js" />
    <link rel="stylesheet" href="/public/theme.css" />
    <style>${head}</style>
    <script src="/public/rtgl-icons.js"></script>
    <script src="/public/@rettangoli/ui@${UI_VERSION}/dist/rettangoli-iife-ui.min.js"></script>
    <script type="module" src="/public/main.js"></script>
  </head>
  <body class="${escapeAttr(env.theme ?? "dark")}">
    ${html}
    <rtgl-global-ui></rtgl-global-ui>
  </body>
</html>
`;
