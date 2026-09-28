// Feature emulation checks actual app-owned styles; this is not an older OS.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { EN_I18N } from "../support/i18n.js";
import {
  createInitialState,
  selectViewData,
} from "../../src/pages/config/config.store.js";
import {
  buildTagFilterPopoverViewData,
  createTagFilterPopoverState,
} from "../../src/internal/ui/tagFilterPopover.js";

const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const { themes } = selectViewData({
  state: createInitialState(),
  i18n: EN_I18N,
});
const { tagFilterPopover } = buildTagFilterPopoverViewData({
  state: {
    ...createTagFilterPopoverState(),
    tagFilterPopover: { draftTagIds: ["selected"] },
  },
  props: {
    tagFilterOptions: [{ value: "plain" }, { value: "selected" }],
  },
});
const { styles } = yaml.load(
  await readFile(
    new URL(
      "../../src/components/baseFileExplorer/baseFileExplorer.view.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);
const explorerCss = Object.entries(styles)
  .map(
    ([selector, declarations]) =>
      `${selector} { ${Object.entries(declarations)
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ")} }`,
  )
  .join("\n");
const emulateLegacy = (css) =>
  css
    .replace(/\b(?:oklch|color-mix)\(/g, "unsupported-color(")
    .replace(/:focus-visible/g, ":unsupported-focus-visible");
const failures = [];
for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const legacy of [false, true]) {
      const label = `${engineName} ${legacy ? "legacy" : "native"}`;
      const css = legacy ? emulateLegacy(explorerCss) : explorerCss;
      const previews = themes.flatMap((theme) =>
        Object.entries(theme)
          .filter(
            ([name]) => name.startsWith("preview") && name !== "previewTiles",
          )
          .map(([name, value]) => ({ name: `${theme.id} ${name}`, value })),
      );
      const html = `
        <style>
          ${css}
          body { --muted: #333333; --accent: #4a4a4a; --foreground: white; }
          * { transition: none !important; }
          [data-file-explorer-item] { width: 200px; height: 40px; }
        </style>
        ${previews.map(({ name, value }) => `<div data-preview="${name}" style="background-color: ${legacy ? emulateLegacy(value) : value}"></div>`).join("")}
        ${tagFilterPopover.options.map(({ value, tagStyle }) => `<div data-tag="${value}" style="${legacy ? emulateLegacy(tagStyle) : tagStyle} background-color: var(--muted);">Tag</div>`).join("")}
        <div data-file-explorer-item="true"><button class="visibilityAction">Toggle</button></div>
        <div data-file-explorer-item="true"><button class="visibilityAction" data-always-visible="true">Hidden item</button></div>
      `;
      await page.setContent(html);
      const check = (actual, expected, message) => {
        try {
          assert.equal(actual, expected, `${label}: ${message}`);
        } catch (error) {
          failures.push(error);
          console.error(error.message);
        }
      };
      const colors = await page
        .locator("[data-preview]")
        .evaluateAll((elements) =>
          elements.map((element) => ({
            name: element.dataset.preview,
            color: getComputedStyle(element).backgroundColor,
          })),
        );
      for (const { name, color } of colors) {
        check(color !== "rgba(0, 0, 0, 0)", true, `${name} remains visible`);
      }
      for (const [tag, expected] of [
        ["plain", "rgb(51, 51, 51)"],
        ["selected", "rgb(74, 74, 74)"],
      ]) {
        const color = await page
          .locator(`[data-tag="${tag}"]`)
          .evaluate((element) => getComputedStyle(element).backgroundColor);
        check(color, expected, `${tag} tag background`);
      }
      const action = page.locator(".visibilityAction").first();
      const opacity = () =>
        action.evaluate((element) => getComputedStyle(element).opacity);
      check(await opacity(), "0", "inactive visibility action stays hidden");
      await page.locator("[data-file-explorer-item]").first().hover();
      check(await opacity(), "1", "hover reveals visibility action");
      await page.mouse.move(400, 400);
      await action.focus();
      check(await opacity(), "1", "keyboard focus reveals visibility action");
      const alwaysVisible = await page
        .locator("[data-always-visible]")
        .evaluate((element) => getComputedStyle(element).opacity);
      check(
        alwaysVisible,
        "1",
        "hidden-item visibility action remains visible",
      );
      console.log(
        `${label}: checked preview colors, filter tags, and explorer actions`,
      );
    }
  } finally {
    await browser.close();
  }
}
assert.equal(
  failures.length,
  0,
  `${failures.length} CSS compatibility failures`,
);
