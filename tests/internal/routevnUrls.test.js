import { describe, expect, it } from "vitest";
import {
  getRoutevnCreatorDocsUrl,
  getRoutevnCreatorSystemActionDocsUrl,
  ROUTEVN_CREATOR_DOCS_URL,
  ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL,
} from "../../src/internal/routevnUrls.js";

describe("routevnUrls", () => {
  it("returns the verified docs page for a known resource route", () => {
    expect(getRoutevnCreatorDocsUrl("/project/images")).toBe(
      "https://routevn.com/creator/docs/images/",
    );
    expect(getRoutevnCreatorDocsUrl("/projects")).toBe(
      "https://routevn.com/creator/docs/projects/",
    );
  });

  it("maps non-slug route names to their docs page", () => {
    expect(getRoutevnCreatorDocsUrl("/project/scenes/")).toBe(
      "https://routevn.com/creator/docs/scene-map/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/releases")).toBe(
      "https://routevn.com/creator/docs/versions/",
    );
  });

  it("falls back to the introduction page when no dedicated docs route exists", () => {
    expect(getRoutevnCreatorDocsUrl("/project/variables")).toBe(
      ROUTEVN_CREATOR_DOCS_URL,
    );
    expect(getRoutevnCreatorDocsUrl(undefined)).toBe(
      ROUTEVN_CREATOR_DOCS_URL,
    );
  });

  it("returns the dedicated line-action docs page for known system action modes", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("background")).toBe(
      "https://routevn.com/creator/docs/line-actions/background/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setNextLineConfig")).toBe(
      "https://routevn.com/creator/docs/line-actions/next-line-config/",
    );
  });

  it("maps related system action modes to the closest documented guide", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("toggleDialogueUI")).toBe(
      "https://routevn.com/creator/docs/line-actions/dialogue/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setSoundVolume")).toBe(
      "https://routevn.com/creator/docs/line-actions/sfx/",
    );
  });

  it("falls back to the docs index for generic or undocumented system action modes", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("actions")).toBe(
      "https://routevn.com/creator/docs/scene-editor/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("updateVariable")).toBe(
      ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL,
    );
    expect(getRoutevnCreatorSystemActionDocsUrl(undefined)).toBe(
      ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL,
    );
  });
});
