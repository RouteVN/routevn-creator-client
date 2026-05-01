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
    expect(getRoutevnCreatorDocsUrl("/project/particles")).toBe(
      "https://routevn.com/creator/docs/particles/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/spritesheets")).toBe(
      "https://routevn.com/creator/docs/spritesheets/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/variables")).toBe(
      "https://routevn.com/creator/docs/variables/",
    );
  });

  it("maps non-slug route names to their docs page", () => {
    expect(getRoutevnCreatorDocsUrl("/project/scenes/")).toBe(
      "https://routevn.com/creator/docs/scene-map/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/releases")).toBe(
      "https://routevn.com/creator/docs/versions/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/releases/web-server")).toBe(
      "https://routevn.com/creator/docs/web-server/",
    );
  });

  it("maps editor sub-routes to the matching docs sections", () => {
    expect(getRoutevnCreatorDocsUrl("/project/character-sprites")).toBe(
      "https://routevn.com/creator/docs/characters/#character-sprites",
    );
    expect(getRoutevnCreatorDocsUrl("/project/animation-editor")).toBe(
      "https://routevn.com/creator/docs/animations/#animation-editor-page",
    );
    expect(getRoutevnCreatorDocsUrl("/project/layout-editor")).toBe(
      "https://routevn.com/creator/docs/layouts/#layout-editor",
    );
  });

  it("maps settings routes to the docs settings section", () => {
    expect(getRoutevnCreatorDocsUrl("/project/about")).toBe(
      "https://routevn.com/creator/docs/page-index/#settings",
    );
    expect(getRoutevnCreatorDocsUrl("/project/appearance")).toBe(
      "https://routevn.com/creator/docs/page-index/#settings",
    );
    expect(getRoutevnCreatorDocsUrl("/project/user")).toBe(
      "https://routevn.com/creator/docs/page-index/#settings",
    );
  });

  it("falls back to the introduction page when no dedicated docs route exists", () => {
    expect(getRoutevnCreatorDocsUrl("/project/unknown")).toBe(
      ROUTEVN_CREATOR_DOCS_URL,
    );
    expect(getRoutevnCreatorDocsUrl(undefined)).toBe(ROUTEVN_CREATOR_DOCS_URL);
  });

  it("returns the dedicated line-action docs page for known system action modes", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("background")).toBe(
      "https://routevn.com/creator/docs/line-actions/background/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setNextLineConfig")).toBe(
      "https://routevn.com/creator/docs/line-actions/next-line-config/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("updateVariable")).toBe(
      "https://routevn.com/creator/docs/line-actions/update-variable/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("conditional")).toBe(
      "https://routevn.com/creator/docs/line-actions/controls/",
    );
  });

  it("maps related system action modes to the closest documented guide", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("toggleDialogueUI")).toBe(
      "https://routevn.com/creator/docs/line-actions/dialogue/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("startSkipMode")).toBe(
      "https://routevn.com/creator/docs/line-actions/toggle-skip-mode/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("stopSkipMode")).toBe(
      "https://routevn.com/creator/docs/line-actions/toggle-skip-mode/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setSoundVolume")).toBe(
      "https://routevn.com/creator/docs/line-actions/sfx/",
    );
  });

  it("maps generic system action modes and falls back for undocumented modes", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("actions")).toBe(
      "https://routevn.com/creator/docs/scene-editor/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl(undefined)).toBe(
      ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL,
    );
  });
});
