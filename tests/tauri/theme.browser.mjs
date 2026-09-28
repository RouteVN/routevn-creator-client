// Feature emulation in current browsers; this does not emulate an entire macOS.
// No app server is required: use the actual app stylesheet in an isolated page.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const stylesheet = await readFile(
  new URL("../../static/public/theme.css", import.meta.url),
  "utf8",
);
const palettes = [
  {
    name: "light",
    classes: "",
    background: "oklch(0.975 0.004 250)",
    foreground: "oklch(0.21 0.012 250)",
    legacyBackground: "rgb(245, 247, 249)",
    legacyForeground: "rgb(20, 25, 30)",
  },
  {
    name: "dark",
    classes: "dark",
    background: "oklch(0.24 0 0)",
    foreground: "oklch(0.96 0 0)",
    legacyBackground: "rgb(31, 31, 31)",
    legacyForeground: "rgb(242, 242, 242)",
  },
  {
    name: "black",
    classes: "dark theme-black",
    background: "oklch(0.145 0 0)",
    foreground: "oklch(0.985 0 0)",
    legacyBackground: "rgb(10, 10, 10)",
    legacyForeground: "rgb(250, 250, 250)",
  },
  {
    name: "catppuccin-mocha",
    classes: "dark theme-catppuccin-mocha",
    background: "rgb(30, 30, 46)",
    foreground: "rgb(205, 214, 244)",
    legacyBackground: "rgb(30, 30, 46)",
    legacyForeground: "rgb(205, 214, 244)",
  },
];
const colorProperties = [
  "background",
  "surface",
  "foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "scrollbar-thumb",
  "scrollbar-thumb-hover",
];

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const nativePixels = new Map();
    for (const scenario of ["native", "no-color-mix", "no-modern-colors"]) {
      const legacy = scenario !== "native";
      // Unknown color functions are retained in custom properties, just as in
      // older WebKit, and invalidate consuming declarations at computed time.
      // Replacing the @supports predicate also activates the legacy palette.
      const unsupported =
        scenario === "no-color-mix"
          ? /\bcolor-mix\(/g
          : /\b(?:oklch|color-mix)\(/g;
      const css = legacy
        ? stylesheet.replace(unsupported, "unsupported-color(")
        : stylesheet;
      await page.setContent(`<style>${css}</style><div>Projects</div>`);
      for (const palette of palettes) {
        const result = await page.evaluate(
          ({ classes, colorProperties }) => {
            document.documentElement.className = classes;
            const body = getComputedStyle(document.body);
            const colors = {};
            const pixels = {};
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            const context = canvas.getContext("2d");
            for (const property of colorProperties) {
              const probe = document.createElement("div");
              probe.style.backgroundColor = `var(--${property})`;
              document.body.appendChild(probe);
              colors[property] = getComputedStyle(probe).backgroundColor;
              probe.remove();
              context.fillStyle = "#808080";
              context.fillRect(0, 0, 1, 1);
              context.fillStyle = colors[property];
              context.fillRect(0, 0, 1, 1);
              pixels[property] = Array.from(
                context.getImageData(0, 0, 1, 1).data,
              );
            }
            return {
              background: body.backgroundColor,
              foreground: body.color,
              colors,
              pixels,
            };
          },
          { classes: palette.classes, colorProperties },
        );
        const label = `${engineName} ${scenario} ${palette.name}`;
        if (scenario !== "no-color-mix") {
          assert.equal(
            result.background,
            legacy ? palette.legacyBackground : palette.background,
            `${label}: page background`,
          );
          assert.equal(
            result.foreground,
            legacy ? palette.legacyForeground : palette.foreground,
            `${label}: readable page text`,
          );
        }
        for (const [property, color] of Object.entries(result.colors)) {
          assert.notEqual(
            color,
            "rgba(0, 0, 0, 0)",
            `${label}: --${property} must resolve to a color`,
          );
        }
        if (legacy) {
          for (const property of colorProperties) {
            const expected = nativePixels.get(palette.name)[property];
            assert.ok(
              result.pixels[property].every(
                (channel, index) => Math.abs(channel - expected[index]) <= 1,
              ),
              `${label}: --${property} must match the native sRGB color`,
            );
          }
        } else {
          nativePixels.set(palette.name, result.pixels);
        }
      }
    }
    console.log(
      `${engineName}: all four palettes retain readable native and legacy colors`,
    );
  } finally {
    await browser.close();
  }
}
