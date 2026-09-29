import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const getThemeBlock = (themeCss, className) => {
  const match = themeCss.match(
    new RegExp(`\\.${className} \\{([\\s\\S]*?)\\n\\}`),
  );

  return match?.[1] ?? "";
};

const getThemeTokens = (themeBlock) => {
  return Object.fromEntries(
    [...themeBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
      ([, property, value]) => [property, value.trim()],
    ),
  );
};

const getOklchLightness = (value) => {
  const [, lightness, percentage] = value.match(/^oklch\(([\d.]+)(%?)/);
  return Number(lightness) / (percentage ? 100 : 1);
};

describe("theme css", () => {
  it("uses a subtle neutral browser tap highlight globally", () => {
    const themeCss = readFileSync(
      new URL("../../static/public/theme.css", import.meta.url),
      "utf8",
    );

    expect(themeCss).toContain(
      "-webkit-tap-highlight-color: rgba(255, 255, 255, 0.08);",
    );
    expect(themeCss).toContain("*::before");
    expect(themeCss).toContain("*::after");
  });

  it("uses app scrollbar theme tokens", () => {
    const themeCss = readFileSync(
      new URL("../../static/public/theme.css", import.meta.url),
      "utf8",
    );

    expect(themeCss).toContain("--scrollbar-thumb:");
    expect(themeCss).toContain("--scrollbar-thumb-hover:");
    expect(themeCss).toContain(
      "scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);",
    );
  });

  it("defines the Dark palette and removes Neutral Light", () => {
    const themeCss = readFileSync(
      new URL("../../static/public/theme.css", import.meta.url),
      "utf8",
    );

    const darkTokens = getThemeTokens(getThemeBlock(themeCss, "dark"));
    const blackTokens = getThemeTokens(getThemeBlock(themeCss, "theme-black"));

    expect(themeCss).not.toContain(".theme-neutral-light");
    expect(themeCss).not.toContain(".theme-soft-dark");
    expect(darkTokens).toMatchObject({
      "--background": "oklch(24% 0 0)",
      "--surface": "oklch(27.75% 0 0)",
      "--foreground": "oklch(96% 0 0)",
      "--primary": "oklch(90% 0 0)",
      "--primary-foreground": "oklch(28% 0 0)",
      "--secondary": "oklch(34% 0 0)",
      "--secondary-foreground": "oklch(96% 0 0)",
      "--muted": "oklch(32% 0 0)",
      "--muted-foreground": "oklch(77% 0 0)",
      "--accent": "oklch(41% 0 0)",
      "--accent-foreground": "oklch(98% 0 0)",
      "--destructive": "oklch(70% 0.19 22.216)",
      "--destructive-foreground": "white",
      "--border": "oklch(100% 0 0 / 14%)",
      "--input": "oklch(100% 0 0 / 18%)",
      "--ring": "oklch(64% 0 0)",
      "--scrollbar-thumb": "oklch(45% 0 0)",
      "--scrollbar-thumb-hover": "oklch(55% 0 0)",
    });
    expect(blackTokens).toMatchObject({
      "--background": "oklch(14.5% 0 0)",
      "--surface": "oklch(18% 0 0)",
      "--foreground": "oklch(98.5% 0 0)",
      "--primary": "oklch(92.2% 0 0)",
      "--input": "oklch(100% 0 0 / 15%)",
      "--border": "oklch(100% 0 0 / 10%)",
    });
    expect(
      getOklchLightness(darkTokens["--background"]) -
        getOklchLightness(blackTokens["--background"]),
    ).toBeGreaterThanOrEqual(0.07);
    expect(
      getOklchLightness(darkTokens["--surface"]) -
        getOklchLightness(blackTokens["--surface"]),
    ).toBeGreaterThanOrEqual(0.07);
  });
});
