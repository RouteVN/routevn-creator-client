import { describe, expect, it, vi } from "vitest";
import * as handlers from "../../src/pages/tutorials/tutorials.handlers.js";
import * as storeModule from "../../src/pages/tutorials/tutorials.store.js";
import tutorialVideos from "../../src/pages/tutorials/support/tutorialVideos.json";
import {
  buildYouTubeWatchUrl,
  canEmbedYouTubeFrom,
} from "../../src/internal/youtube.js";
import defaultCapability from "../../src-tauri/capabilities/default.json";
import { createAppShellService } from "../../src/deps/services/shared/appShellService.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const VIEW_PATH = "src/pages/tutorials/tutorials.view.yaml";
const FIRST_DESKTOP_VIDEO = tutorialVideos.folders[0].videos[0];

const createPage = ({ uiConfig, canEmbedYouTube = true } = {}) => {
  const state = storeModule.createInitialState();
  storeModule.setUiConfig({ state }, { uiConfig });

  const store = {};
  Object.entries(storeModule).forEach(([name, fn]) => {
    if (name !== "createInitialState") {
      store[name] = (payload) => fn({ state, i18n: EN_I18N }, payload);
    }
  });

  const deps = {
    store,
    render: vi.fn(),
    refs: {},
    appService: {
      canEmbedYouTube: () => canEmbedYouTube,
      openUrl: vi.fn(),
    },
  };

  return {
    state,
    deps,
    viewData: () => store.selectViewData(),
    html: () => renderViewYaml(VIEW_PATH, store.selectViewData()),
  };
};

const cardEvent = (videoId, extra = {}) => ({
  _event: {
    currentTarget: { dataset: { videoId } },
    preventDefault: vi.fn(),
    ...extra,
  },
});

describe("tutorials page", () => {
  it("lists every tutorial with a title and a unique YouTube id", () => {
    const videos = tutorialVideos.folders.flatMap((folder) => folder.videos);
    const ids = videos.map((video) => video.youtubeId);

    expect(videos.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    videos.forEach((video) => {
      expect(video.youtubeId).toMatch(/^[\w-]{11}$/);
      expect(video.title).toBeTruthy();
    });
  });

  it("shows folders and video cards with YouTube thumbnails", () => {
    const page = createPage({ uiConfig: { inputMode: "pointer" } });
    const html = page.html();

    expect(page.viewData().groups.map((group) => group.name)).toEqual([
      "Desktop",
      "Mobile",
    ]);
    expect(html).toContain(
      `src="https://i.ytimg.com/vi/${FIRST_DESKTOP_VIDEO.youtubeId}/hqdefault.jpg"`,
    );
    expect(html).toContain(FIRST_DESKTOP_VIDEO.title);
    expect(html).not.toContain('svg="play"');
    expect(html).not.toContain("<iframe");
  });

  it("keeps the settings list on the left without a file explorer", () => {
    const html = createPage({ uiConfig: { inputMode: "pointer" } }).html();

    expect(html).toContain("<rvn-resource-types");
    expect(html).not.toContain("<rvn-base-file-explorer");
  });

  it("gives every title the same two-line block", () => {
    const html = createPage({ uiConfig: { inputMode: "pointer" } }).html();
    const videoCount = tutorialVideos.folders.flatMap(
      (folder) => folder.videos,
    ).length;

    expect(html.match(/class="tutorialTitle"/g)).toHaveLength(videoCount);
  });

  it("lists the mobile tutorials first in touch mode", () => {
    const page = createPage({ uiConfig: { id: "touch", inputMode: "touch" } });

    expect(page.viewData().groups.map((group) => group.id)).toEqual([
      "mobile",
      "desktop",
    ]);
    expect(page.html()).not.toContain("<rvn-resource-types");
  });

  it("plays a clicked video in the app", () => {
    const page = createPage({ uiConfig: { inputMode: "pointer" } });
    const { youtubeId, title } = FIRST_DESKTOP_VIDEO;

    handlers.handleVideoCardClick(page.deps, cardEvent(youtubeId));

    expect(page.deps.appService.openUrl).not.toHaveBeenCalled();
    const html = page.html();
    expect(html).toContain(
      `src="https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&amp;rel=0&amp;playsinline=1"`,
    );
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain(`title="${title}"`);
  });

  it("opens the video on YouTube where the player cannot play in the app", () => {
    const page = createPage({
      uiConfig: { inputMode: "pointer" },
      canEmbedYouTube: false,
    });
    const { youtubeId } = FIRST_DESKTOP_VIDEO;

    handlers.handleVideoCardClick(page.deps, cardEvent(youtubeId));

    expect(page.deps.appService.openUrl).toHaveBeenCalledWith(
      `https://www.youtube.com/watch?v=${youtubeId}`,
    );
    expect(page.viewData().playingVideo).toBeUndefined();
  });

  it("does not mark a played video as selected", () => {
    const page = createPage({ uiConfig: { inputMode: "pointer" } });
    const before = page.html();

    handlers.handleVideoCardClick(
      page.deps,
      cardEvent(FIRST_DESKTOP_VIDEO.youtubeId),
    );
    handlers.handleVideoPlayerClose(page.deps);

    expect(page.html()).toBe(before);
  });

  it("plays a focused card with Enter or Space only", () => {
    const page = createPage({ uiConfig: { inputMode: "pointer" } });
    const { youtubeId } = FIRST_DESKTOP_VIDEO;

    handlers.handleVideoCardKeyDown(
      page.deps,
      cardEvent(youtubeId, { key: "Tab" }),
    );
    expect(page.viewData().playingVideo).toBeUndefined();

    const enter = cardEvent(youtubeId, { key: "Enter" });
    handlers.handleVideoCardKeyDown(page.deps, enter);
    expect(enter._event.preventDefault).toHaveBeenCalled();
    expect(page.viewData().playingVideo).toBeDefined();

    handlers.handleVideoPlayerClose(page.deps);
    handlers.handleVideoCardKeyDown(
      page.deps,
      cardEvent(youtubeId, { key: " " }),
    );
    expect(page.viewData().playingVideo).toBeDefined();
  });

  it("collapses and expands a folder from its header", () => {
    const page = createPage({ uiConfig: { inputMode: "pointer" } });
    const headerClick = {
      _event: { currentTarget: { dataset: { folderId: "desktop" } } },
    };

    handlers.handleFolderHeaderClick(page.deps, headerClick);
    expect(page.viewData().groups[0].isCollapsed).toBe(true);
    expect(page.html()).not.toContain(
      `vi/${FIRST_DESKTOP_VIDEO.youtubeId}/hqdefault.jpg`,
    );

    handlers.handleFolderHeaderClick(page.deps, headerClick);
    expect(page.viewData().groups[0].isCollapsed).toBe(false);
  });

  it("closes the player, or hands the video over to YouTube", () => {
    const page = createPage({ uiConfig: { inputMode: "pointer" } });
    const { youtubeId } = FIRST_DESKTOP_VIDEO;

    handlers.handleVideoCardClick(page.deps, cardEvent(youtubeId));
    handlers.handleVideoPlayerClose(page.deps);
    expect(page.html()).not.toContain("<iframe");

    handlers.handleVideoCardClick(page.deps, cardEvent(youtubeId));
    handlers.handleOpenOnYouTubeClick(page.deps);
    expect(page.html()).not.toContain("<iframe");
    expect(page.deps.appService.openUrl).toHaveBeenCalledWith(
      `https://www.youtube.com/watch?v=${youtubeId}`,
    );
  });
});

describe("YouTube embeds", () => {
  // The desktop app opens only links its opener allowlist matches, as globs.
  it("lets the desktop app open every tutorial on YouTube", () => {
    const { allow } = defaultCapability.permissions.find(
      (permission) => permission.identifier === "opener:allow-open-url",
    );
    const globToRegExp = (glob) =>
      new RegExp(
        `^${glob
          .split("")
          .map((char) =>
            char === "*"
              ? ".*"
              : char === "?"
                ? "."
                : char.replace(/[.+^${}()|[\]\\/]/g, "\\$&"),
          )
          .join("")}$`,
      );
    const isAllowed = (href) =>
      allow.some(({ url }) => globToRegExp(url).test(href));

    const blocked = tutorialVideos.folders
      .flatMap((folder) => folder.videos)
      .map((video) => buildYouTubeWatchUrl(video.youtubeId))
      .filter((href) => !isAllowed(href));

    expect(blocked).toEqual([]);
    expect(isAllowed("https://www.youtube.com/@someone")).toBe(false);
  });

  it.each([
    ["https:", true],
    ["http:", true],
    ["tauri:", false],
    ["routevn:", false],
  ])("from a %s page: %s", (protocol, expected) => {
    expect(canEmbedYouTubeFrom({ protocol })).toBe(expected);
  });

  it("are off unless the platform turns them on", () => {
    const deps = { router: {}, subject: {}, globalUI: {} };

    expect(createAppShellService(deps).canEmbedYouTube()).toBe(false);
    expect(
      createAppShellService({
        ...deps,
        youtubeEmbedsSupported: true,
      }).canEmbedYouTube(),
    ).toBe(true);
  });
});
