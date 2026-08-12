// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createComponent } from "@rettangoli/fe";
import yaml from "js-yaml";
import { parse } from "jempl";
import { beforeAll, describe, expect, it } from "vitest";
import * as handlers from "../../src/components/resource-import-dialog/resource-import-dialog.handlers.js";
import * as store from "../../src/components/resource-import-dialog/resource-import-dialog.store.js";

const readYaml = (path) =>
  yaml.load(readFileSync(new URL(path, import.meta.url), "utf8"));

const view = readYaml(
  "../../src/components/resource-import-dialog/resource-import-dialog.view.yaml",
);
view.template = parse(view.template);
const schema = readYaml(
  "../../src/components/resource-import-dialog/resource-import-dialog.schema.yaml",
);

const createPlan = () => ({
  planId: "plan-1",
  package: {},
  warnings: [],
  resources: [
    ...["One", "Two", "Three", "Four"].map((name, index) => ({
      sourceId: `images:image-${index}`,
      resourceType: "images",
      type: "image",
      name,
    })),
    {
      sourceId: "animations:animation-0",
      resourceType: "animations",
      type: "animation",
      name: "Animation",
    },
  ],
  reviewSections: [
    {
      resourceType: "images",
      items: [
        { kind: "folder", name: "Folder One", depth: 0 },
        {
          kind: "resources",
          sourceIds: ["images:image-0", "images:image-1"],
        },
        { kind: "folder", name: "Folder Two", depth: 0 },
        {
          kind: "resources",
          sourceIds: ["images:image-2", "images:image-3"],
        },
      ],
    },
    {
      resourceType: "animations",
      items: [
        { kind: "folder", name: "Animation Folder", depth: 0 },
        {
          kind: "resources",
          sourceIds: ["animations:animation-0"],
        },
      ],
    },
  ],
});

beforeAll(() => {
  globalThis.CSSStyleSheet = class CSSStyleSheet {
    replaceSync() {}
  };
  const ResourceImportDialog = createComponent(
    { handlers, schema, store, view },
    {
      appService: {},
      projectService: {
        cancelResourceImport() {},
      },
    },
  );
  customElements.define(
    "rvn-resource-import-dialog-render-test",
    ResourceImportDialog,
  );
});

describe("resource-import-dialog rendering", () => {
  it("updates only clicked cards across folder groups and sections", () => {
    const dialog = document.createElement(
      "rvn-resource-import-dialog-render-test",
    );
    document.body.append(dialog);
    dialog.store.setPlan({ plan: createPlan() });
    dialog.render();

    const card = dialog.shadowRoot.querySelector('[data-resource-index="3"]');
    card.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true }),
    );
    dialog.shadowRoot
      .querySelector('[data-resource-index="4"]')
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true }),
      );

    expect(dialog.store.selectReviewValues()).toMatchObject({
      resource_0_include: true,
      resource_1_include: true,
      resource_2_include: true,
      resource_3_include: false,
      resource_4_include: false,
    });
    expect(
      dialog.shadowRoot
        .querySelector('[data-resource-index="3"]')
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      dialog.shadowRoot
        .querySelector('[data-resource-index="1"]')
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      dialog.shadowRoot
        .querySelector('[data-resource-index="4"]')
        .getAttribute("aria-pressed"),
    ).toBe("false");

    dialog.remove();
  });
});
