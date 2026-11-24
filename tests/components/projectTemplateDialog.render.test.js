// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createComponent, createI18nRuntime } from "@rettangoli/fe";
import yaml from "js-yaml";
import { parse } from "jempl";
import { beforeAll, describe, expect, it } from "vitest";
import * as templateHandlers from "../../src/components/projectTemplateDialog/projectTemplateDialog.handlers.js";
import * as templateStore from "../../src/components/projectTemplateDialog/projectTemplateDialog.store.js";
import * as createHandlers from "../../src/components/projectCreateDialog/projectCreateDialog.handlers.js";
import * as createStore from "../../src/components/projectCreateDialog/projectCreateDialog.store.js";
import * as createMethods from "../../src/components/projectCreateDialog/projectCreateDialog.methods.js";
// Components read their text from the i18n runtime the app sets up.
const EN_I18N = yaml.load(readFileSync("src/i18n/en.yaml", "utf8"));
const i18nRuntime = createI18nRuntime({
  defaultLocale: "en",
  locales: ["en"],
  initialCatalogs: { en: EN_I18N },
});

const readYaml = (path) =>
  yaml.load(readFileSync(new URL(path, import.meta.url), "utf8"));

const loadComponentFiles = (folder, name) => {
  const view = readYaml(`../../src/components/${folder}/${name}.view.yaml`);
  view.template = parse(view.template);
  return {
    view,
    schema: readYaml(`../../src/components/${folder}/${name}.schema.yaml`),
  };
};

const creator = {
  id: "creator-1",
  name: "Creator One",
  avatarUrl: "https://files.example/avatar.png",
};

const card = (id) => ({
  id,
  title: `Template ${id}`,
  summary: "A starter project.",
  coverUrl: `https://files.example/${id}.png`,
  resolution: { width: 1920, height: 1080 },
  languages: ["en"],
  creator,
});

const texts = (element) =>
  [...element.querySelectorAll("rtgl-text")].map((text) =>
    text.textContent.trim(),
  );

beforeAll(() => {
  globalThis.CSSStyleSheet = class CSSStyleSheet {
    replaceSync() {}
  };
  customElements.define(
    "rvn-project-template-dialog-render-test",
    createComponent(
      {
        handlers: templateHandlers,
        store: templateStore,
        ...loadComponentFiles("projectTemplateDialog", "projectTemplateDialog"),
      },
      { appService: {}, __rtglI18nRuntime: i18nRuntime },
    ),
  );
  customElements.define(
    "rvn-project-create-dialog-render-test",
    createComponent(
      {
        handlers: createHandlers,
        store: createStore,
        methods: createMethods,
        ...loadComponentFiles("projectCreateDialog", "projectCreateDialog"),
      },
      { appService: {}, __rtglI18nRuntime: i18nRuntime },
    ),
  );
});

describe("project template dialog rendering", () => {
  it("renders the bundled template first, then the store's cards", () => {
    const dialog = document.createElement(
      "rvn-project-template-dialog-render-test",
    );
    document.body.append(dialog);
    dialog.store.startCatalogLoad({ requestId: "request-1" });
    dialog.render();

    let cards = dialog.shadowRoot.querySelectorAll("[data-template-id]");
    expect([...cards].map((element) => element.dataset.templateId)).toEqual([
      "default",
    ]);
    expect(dialog.shadowRoot.textContent).toContain("Loading templates");

    dialog.store.setCatalogPage({
      templates: [card("one"), card("two")],
      nextCursor: "2",
    });
    dialog.render();

    cards = dialog.shadowRoot.querySelectorAll("[data-template-id]");
    expect([...cards].map((element) => element.dataset.templateId)).toEqual([
      "default",
      "one",
      "two",
    ]);
    expect(cards[0].getAttribute("aria-label")).toBe("Open Default");
    // The bundled template shows its title screen.
    expect(
      cards[0].querySelector('rtgl-image[src="/templates/default/cover.webp"]'),
    ).not.toBeNull();
    expect(texts(cards[1])).toEqual([
      "Template one",
      "A starter project.",
      "Creator One",
    ]);
    expect(
      cards[1].querySelector('rtgl-image[src="https://files.example/one.png"]'),
    ).not.toBeNull();
    expect(
      dialog.shadowRoot.querySelector("#loadMoreTemplatesButton"),
    ).not.toBeNull();
    dialog.remove();
  });

  it("renders a template's page with its screenshots and Use Template", () => {
    const dialog = document.createElement(
      "rvn-project-template-dialog-render-test",
    );
    document.body.append(dialog);
    dialog.store.openDetail({ requestId: "detail-1", card: card("one") });
    dialog.store.setDetail({
      template: {
        ...card("one"),
        description: [{ text: "First paragraph." }],
        screenshots: ["title", "dialogue"].map((name) => ({
          url: `https://files.example/${name}.png`,
        })),
        versionName: "1.0.0",
      },
    });
    dialog.store.setScreenshotIndex({ index: 1 });
    dialog.render();

    const root = dialog.shadowRoot;
    const viewer = root.querySelector("#screenshotViewer");
    expect(viewer.getAttribute("aria-label")).toBe("Screenshot 2");
    expect(
      viewer.querySelector(
        'rtgl-image[src="https://files.example/dialogue.png"]',
      ),
    ).not.toBeNull();
    const thumbnails = root.querySelectorAll("[data-screenshot-index]");
    expect(
      [...thumbnails].map((thumbnail) =>
        thumbnail.getAttribute("aria-current"),
      ),
    ).toEqual([null, "true"]);
    expect(root.querySelector("#previousScreenshotButton")).not.toBeNull();
    expect(root.querySelector("#templateInfo").textContent).toContain("1.0.0");
    expect(root.querySelector("#templateAbout").textContent).toContain(
      "First paragraph.",
    );
    expect(
      root.querySelector("#useTemplateButton").hasAttribute("disabled"),
    ).toBe(false);
    dialog.remove();
  });
});

describe("project create dialog template row", () => {
  // A component keeps its own view in `template`, so the form takes the
  // chosen template as `projectTemplate`.
  it("shows the chosen template and keeps rendering when it changes", async () => {
    const dialog = document.createElement(
      "rvn-project-create-dialog-render-test",
    );
    dialog.platform = "web";
    dialog.projectTemplate = {
      id: "template-one",
      source: "store",
      title: "Template One",
      coverUrl: "https://files.example/template-one.png",
      resolution: { width: 1280, height: 720 },
    };
    document.body.append(dialog);

    const row = () =>
      dialog.shadowRoot.querySelector("[slot=project-template-selector]");
    // The form shows its Resolution field only when told to choose one.
    const choosesResolution = () =>
      dialog.shadowRoot.querySelector("rtgl-form").context.chooseResolution;
    expect(row().textContent).toContain("Template One");
    // A store template is made for one resolution: the row shows it, and the
    // form has none to choose.
    expect(row().textContent).toContain("1280 × 720");
    expect(choosesResolution()).toBe(false);
    expect(
      row().querySelector(
        'rtgl-image[src="https://files.example/template-one.png"]',
      ),
    ).not.toBeNull();
    expect(row().querySelector("#changeTemplateButton").textContent).toBe(
      "Change",
    );

    dialog.projectTemplate = { id: "default", source: "bundled" };
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(row().textContent).toContain("Default");
    expect(row().querySelector("rtgl-image").getAttribute("src")).toBe(
      "/templates/default/cover.webp",
    );
    expect(row().textContent).not.toContain("×");
    expect(choosesResolution()).toBe(true);
    dialog.remove();
  });
});
