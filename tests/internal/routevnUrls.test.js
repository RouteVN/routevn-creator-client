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
      "https://routevn.com/en/creator/docs/images/",
    );
    expect(getRoutevnCreatorDocsUrl("/projects")).toBe(
      "https://routevn.com/en/creator/docs/projects/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/particles")).toBe(
      "https://routevn.com/en/creator/docs/particles/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/spritesheets")).toBe(
      "https://routevn.com/en/creator/docs/spritesheets/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/variables")).toBe(
      "https://routevn.com/en/creator/docs/variables/",
    );
  });

  it("maps non-slug route names to their docs page", () => {
    expect(getRoutevnCreatorDocsUrl("/project/scenes/")).toBe(
      "https://routevn.com/en/creator/docs/scene-map/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/releases")).toBe(
      "https://routevn.com/en/creator/docs/versions/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/releases/web-server")).toBe(
      "https://routevn.com/en/creator/docs/web-server/",
    );
  });

  it("maps editor sub-routes to the matching docs sections", () => {
    expect(getRoutevnCreatorDocsUrl("/project/character-sprites")).toBe(
      "https://routevn.com/en/creator/docs/characters/#character-sprites",
    );
    expect(getRoutevnCreatorDocsUrl("/project/animation-editor")).toBe(
      "https://routevn.com/en/creator/docs/animations/#parts-of-the-animation-editor",
    );
    expect(getRoutevnCreatorDocsUrl("/project/audio-effects-editor")).toBe(
      "https://routevn.com/en/creator/docs/audio-effects/#audio-effect-editor",
    );
    expect(getRoutevnCreatorDocsUrl("/project/layout-editor")).toBe(
      "https://routevn.com/en/creator/docs/layouts/#layout-editor",
    );
    expect(getRoutevnCreatorDocsUrl("/project/transform-editor")).toBe(
      "https://routevn.com/en/creator/docs/transforms/#parts-of-the-transform-editor",
    );
    expect(getRoutevnCreatorDocsUrl("/project/particle-editor")).toBe(
      "https://routevn.com/en/creator/docs/particles/#parts-of-the-particle-editor",
    );
    expect(getRoutevnCreatorDocsUrl("/project/text-style-editor")).toBe(
      "https://routevn.com/en/creator/docs/text-styles/",
    );
  });

  it("maps pages that have their own docs page", () => {
    expect(getRoutevnCreatorDocsUrl("/project")).toBe(
      "https://routevn.com/en/creator/docs/projects/#project-details",
    );
    expect(getRoutevnCreatorDocsUrl("/project/audio-effects")).toBe(
      "https://routevn.com/en/creator/docs/audio-effects/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/releases/platform-details")).toBe(
      "https://routevn.com/en/creator/docs/platform-details/",
    );
  });

  it("maps settings routes to the Settings docs page", () => {
    expect(getRoutevnCreatorDocsUrl("/project/about")).toBe(
      "https://routevn.com/en/creator/docs/settings/#about",
    );
    expect(getRoutevnCreatorDocsUrl("/project/config")).toBe(
      "https://routevn.com/en/creator/docs/settings/#config",
    );
    expect(getRoutevnCreatorDocsUrl("/project/language")).toBe(
      "https://routevn.com/en/creator/docs/settings/#config",
    );
    expect(getRoutevnCreatorDocsUrl("/project/user")).toBe(
      "https://routevn.com/en/creator/docs/settings/",
    );
    expect(getRoutevnCreatorDocsUrl("/project/asset-package")).toBe(
      "https://routevn.com/en/creator/docs/page-index/#release",
    );
  });

  it("opens the mobile video tutorials from Tutorials in touch mode", () => {
    expect(getRoutevnCreatorDocsUrl("/project/tutorials")).toBe(
      "https://routevn.com/en/creator/docs/video-tutorials/",
    );
    expect(
      getRoutevnCreatorDocsUrl("/project/tutorials", { isTouchMode: true }),
    ).toBe("https://routevn.com/en/creator/docs/video-tutorials-mobile/");
    // Pages without mobile docs keep their docs in touch mode.
    expect(
      getRoutevnCreatorDocsUrl("/project/images", { isTouchMode: true }),
    ).toBe("https://routevn.com/en/creator/docs/images/");
  });

  it("falls back to the introduction page when no dedicated docs route exists", () => {
    expect(getRoutevnCreatorDocsUrl("/project/unknown")).toBe(
      ROUTEVN_CREATOR_DOCS_URL,
    );
    expect(getRoutevnCreatorDocsUrl(undefined)).toBe(ROUTEVN_CREATOR_DOCS_URL);
  });

  it("returns the dedicated line-action docs page for known system action modes", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("background")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/background/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("visual")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/visuals/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("voice")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/voice/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("pushOverlay")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/push-layered-view/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("popOverlay")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/pop-layered-view/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("resetStoryAtSection")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/reset-story-at-section/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setNextLineConfig")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/next-line-config/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("updateVariable")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/update-variable/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("input")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/input/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("conditional")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/conditional/",
    );
  });

  it("maps related system action modes to the closest documented guide", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("toggleDialogueUI")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/dialogue/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("startSkipMode")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/toggle-skip-mode/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("stopSkipMode")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/toggle-skip-mode/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setSoundVolume")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/sfx/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setAutoForwardDelay")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/toggle-auto-mode/",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("setSkipUnseenText")).toBe(
      "https://routevn.com/en/creator/docs/line-actions/toggle-skip-mode/",
    );
  });

  it("maps generic system action modes and falls back for undocumented modes", () => {
    expect(getRoutevnCreatorSystemActionDocsUrl("actions")).toBe(
      "https://routevn.com/en/creator/docs/scene-editor/#add-an-action-to-a-line",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl("screen")).toBe(
      "https://routevn.com/en/creator/docs/scene-editor/#add-an-action-to-a-line",
    );
    expect(getRoutevnCreatorSystemActionDocsUrl(undefined)).toBe(
      ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL,
    );
  });
});
