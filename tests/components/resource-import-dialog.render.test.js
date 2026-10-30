// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createComponent } from "@rettangoli/fe";
import yaml from "js-yaml";
import { parse } from "jempl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as handlers from "../../src/components/resource-import-dialog/resource-import-dialog.handlers.js";
import * as store from "../../src/components/resource-import-dialog/resource-import-dialog.store.js";
import Subject from "../../src/deps/subject.js";

// A pack's published package, as the store client reads it.
const packagePlace = (url) => ({
  url,
  size: 1000,
  directoryOffset: 900,
  directorySize: 100,
});

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

// Tests set the asset store calls they need on these.
const appService = {};
const projectService = {
  cancelResourceImport() {},
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const creator = {
  id: "creator-1",
  name: "Creator One",
  avatarUrl: "https://files.example/avatar.png",
};

// A store list or creator page card.
const card = (id, title) => ({
  id,
  title,
  assetCounts: [{ assetType: "IMAGES", count: 2 }],
  assetCount: 2,
  coverUrl: `https://files.example/${id}.png`,
  releasedAt: 1786492800000,
  creator,
});

beforeAll(() => {
  globalThis.CSSStyleSheet = class CSSStyleSheet {
    replaceSync() {}
  };
  const ResourceImportDialog = createComponent(
    { handlers, schema, store, view },
    {
      appService,
      subject: new Subject(),
      projectService,
    },
  );
  customElements.define(
    "rvn-resource-import-dialog-render-test",
    ResourceImportDialog,
  );
});

afterEach(() => {
  for (const key of Object.keys(appService)) delete appService[key];
  delete projectService.createResourceImportPlan;
});

describe("resource-import-dialog rendering", () => {
  it("renders store packs as cards with their cover, summary, creator and asset count", () => {
    const dialog = document.createElement(
      "rvn-resource-import-dialog-render-test",
    );
    document.body.append(dialog);
    dialog.store.startCatalogLoad({ requestId: "request-1" });
    dialog.store.setCatalogPage({
      packs: [
        {
          id: "pack-1",
          title: "Pack One",
          summary: "Forest backgrounds for every season.",
          assetCounts: [
            { assetType: "IMAGES", count: 40 },
            { assetType: "SOUNDS", count: 2 },
          ],
          assetCount: 42,
          coverUrl: "https://files.example/cover.png",
          creator: {
            id: "creator-1",
            name: "Creator One",
            avatarUrl: "https://files.example/avatar.png",
          },
        },
        {
          id: "pack-2",
          title: "Coverless Pack",
          summary: "",
          assetCounts: [{ assetType: "FONTS", count: 3 }],
          assetCount: 3,
          creator: { id: "creator-1", name: "Creator One" },
        },
      ],
      nextCursor: "cursor-2",
    });
    dialog.render();

    const cards = dialog.shadowRoot.querySelectorAll("[data-pack-id]");
    expect([...cards].map((card) => card.dataset.packId)).toEqual([
      "pack-1",
      "pack-2",
    ]);
    expect(cards[0].getAttribute("aria-label")).toBe("Open Pack One");
    expect(cards[0].textContent).toContain("Creator One");
    // The summary sits under the title, at most two lines; a pack without
    // one shows only its title there.
    const texts = (card) =>
      [...card.querySelectorAll("rtgl-text")].map((text) =>
        text.textContent.trim(),
      );
    expect(texts(cards[0]).slice(0, 3)).toEqual([
      "Pack One",
      "Forest backgrounds for every season.",
      "Creator One",
    ]);
    expect(
      [...cards[0].querySelectorAll("rtgl-text")][1].getAttribute("style"),
    ).toContain("-webkit-line-clamp: 2");
    expect(texts(cards[1]).slice(0, 2)).toEqual([
      "Coverless Pack",
      "Creator One",
    ]);
    // A card shows the pack's total; its page lists the counts by type.
    expect(cards[0].textContent).toContain("42 assets");
    expect(cards[0].querySelector("[role=listitem]")).toBeNull();
    expect(cards[1].textContent).toContain("3 assets");
    expect(
      cards[0].querySelector(
        'rtgl-image[src="https://files.example/cover.png"]',
      ),
    ).not.toBeNull();
    expect(cards[1].querySelector("rtgl-image")).toBeNull();
    expect(
      dialog.shadowRoot.querySelector("#loadMorePacksButton"),
    ).not.toBeNull();
    expect(dialog.shadowRoot.querySelector("rtgl-form")).toBeNull();

    dialog.remove();
  });

  it("opens a pack from its card, then shows its details' description", async () => {
    let resolveDetails;
    appService.getAssetStorePack = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveDetails = resolve;
        }),
    );
    projectService.createResourceImportPlan = vi.fn(
      () => new Promise(() => {}),
    );
    const dialog = document.createElement(
      "rvn-resource-import-dialog-render-test",
    );
    document.body.append(dialog);
    dialog.store.startCatalogLoad({ requestId: "request-1" });
    dialog.store.setCatalogPage({
      packs: [card("pack-1", "Pack One")],
    });
    dialog.render();

    dialog.shadowRoot
      .querySelector('[data-pack-id="pack-1"]')
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true }),
      );
    const packMain = () => dialog.shadowRoot.querySelector("#packMain");
    // The card has no description, so the page opens without one, and a
    // pack has no screenshot gallery.
    expect(packMain()).not.toBeNull();
    expect(packMain().querySelector("rvn-asset-pack-gallery")).toBeNull();
    expect(packMain().textContent).not.toContain("About the pack.");

    resolveDetails({
      ...card("pack-1", "Pack One"),
      summary: "Masks and fades.",
      description: [
        { text: "About the pack." },
        {
          imageUrl: "https://files.example/diagram.png",
          alt: "A diagram",
          width: 800,
          height: 600,
        },
        { text: "• Masks" },
      ],
      versionName: "1.0.0",
      releaseNotes: "Adds masks.\nFixes fades.",
      package: packagePlace("https://files.example/pack.zip"),
    });
    await settle();

    expect(packMain().textContent).toContain("About the pack.");
    expect(packMain().textContent).toContain("• Masks");
    // The summary sits in the pack info under the cover, not by the title.
    const packInfo = dialog.shadowRoot.querySelector("#packInfo");
    expect(packInfo.querySelector("#packSummary").textContent).toBe(
      "Masks and fades.",
    );
    expect(
      dialog.shadowRoot.querySelector("#packBackButton").parentElement
        .textContent,
    ).not.toContain("Masks and fades.");
    const image = packMain().querySelector(
      'rtgl-image[src="https://files.example/diagram.png"]',
    );
    expect(image.getAttribute("alt")).toBe("A diagram");
    expect(image.parentElement.getAttribute("style")).toContain(
      "aspect-ratio: 800 / 600",
    );
    expect(dialog.shadowRoot.querySelector("#packInfo").textContent).toContain(
      "1.0.0",
    );
    // The release notes follow the description.
    const releaseNotes = packMain().querySelector("#packReleaseNotes");
    expect(releaseNotes.textContent).toContain("What's new");
    expect(releaseNotes.textContent).toContain("Adds masks.\nFixes fades.");

    dialog.remove();
  });

  it("previews a color as a swatch of its value, on its card and full screen", () => {
    const dialog = document.createElement(
      "rvn-resource-import-dialog-render-test",
    );
    document.body.append(dialog);
    const pack = {
      ...card("pack-1", "Pack One"),
      assetCounts: [
        { assetType: "IMAGES", count: 2 },
        { assetType: "COLORS", count: 1 },
      ],
      description: [],
    };
    dialog.store.startOpeningPack({ operationId: "operation-1", pack });
    dialog.store.setPackDetails({ pack });
    dialog.store.setPackPage({
      plan: {
        ...createPlan(),
        resources: [
          {
            sourceId: "colors:color-0",
            resourceType: "colors",
            type: "color",
            name: "Highlight",
            colorHex: "#FFD84D",
          },
        ],
        reviewSections: [
          {
            resourceType: "colors",
            items: [{ kind: "resources", sourceIds: ["colors:color-0"] }],
          },
        ],
      },
    });
    dialog.render();

    const colorCard = dialog.shadowRoot.querySelector(
      '[data-asset-source-id="colors:color-0"]',
    );
    expect(colorCard.querySelector("rtgl-svg")).toBeNull();
    expect(
      colorCard.querySelector('[style*="background-color: #FFD84D"]'),
    ).not.toBeNull();
    expect(colorCard.textContent).toContain("Highlight");
    expect(colorCard.textContent).toContain("#FFD84D");

    colorCard.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true }),
    );
    const swatch = dialog.shadowRoot.querySelector("#assetPreviewSwatch");
    expect(swatch.getAttribute("style")).toContain("background-color: #FFD84D");
    const preview = dialog.shadowRoot.querySelector("#assetPreviewOverlay");
    expect(preview.textContent).toContain("Highlight");
    expect(preview.textContent).toContain("#FFD84D");

    dialog.remove();
  });

  it("renders a creator page's profile and packs from one request", async () => {
    appService.listAssetStorePacks = vi.fn();
    appService.getAssetStoreCreator = vi.fn(async () => ({
      creator: {
        ...creator,
        description: ["Makes transitions."],
        links: [{ label: "X", url: "https://x.example/creator" }],
      },
      packs: [card("pack-1", "Pack One"), card("pack-2", "Pack Two")],
    }));
    const dialog = document.createElement(
      "rvn-resource-import-dialog-render-test",
    );
    document.body.append(dialog);
    dialog.store.startOpeningPack({
      operationId: "operation-1",
      pack: card("pack-1", "Pack One"),
    });
    dialog.render();

    dialog.shadowRoot
      .querySelector("#packCreatorButton")
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true }),
      );
    await settle();

    expect(appService.getAssetStoreCreator).toHaveBeenCalledTimes(1);
    expect(appService.getAssetStoreCreator).toHaveBeenCalledWith({
      creatorId: "creator-1",
    });
    expect(appService.listAssetStorePacks).not.toHaveBeenCalled();
    expect(dialog.shadowRoot.textContent).toContain("Makes transitions.");
    const cards = dialog.shadowRoot.querySelectorAll(
      "#creatorPackGrid [data-pack-id]",
    );
    expect([...cards].map((item) => item.dataset.packId)).toEqual([
      "pack-1",
      "pack-2",
    ]);
    expect(cards[1].textContent).toContain("Pack Two");
    expect(cards[1].textContent).toContain("Creator One");
    expect(dialog.shadowRoot.querySelector("#creatorLinks")).not.toBeNull();

    dialog.remove();
  });

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

  it("keeps keyboard focus on a card after toggling it", () => {
    const dialog = document.createElement(
      "rvn-resource-import-dialog-render-test",
    );
    document.body.append(dialog);
    dialog.store.setPlan({ plan: createPlan() });
    dialog.render();

    const card = dialog.shadowRoot.querySelector('[data-resource-index="3"]');
    card.focus();
    card.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: " ",
      }),
    );

    const renderedCard = dialog.shadowRoot.querySelector(
      '[data-resource-index="3"]',
    );
    expect(renderedCard).toBe(card);
    expect(dialog.shadowRoot.activeElement).toBe(card);
    expect(renderedCard.getAttribute("aria-pressed")).toBe("false");

    dialog.remove();
  });
});
