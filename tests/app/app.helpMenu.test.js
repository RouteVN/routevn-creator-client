import { describe, expect, it, vi } from "vitest";
import {
  handleChatSupportDialogClose,
  handleHelpFloatingButtonClick,
  handleHelpVideoClose,
} from "../../src/pages/app/app.handlers.js";
import * as appStore from "../../src/pages/app/app.store.js";
import tutorialVideos from "../../src/internal/tutorialVideos.json";
import { findTutorialVideo } from "../../src/internal/tutorialVideos.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const IMAGES_VIDEO_ID = tutorialVideos.pageVideos["/project/images"].desktop;

const createApp = ({
  route,
  uiConfig = { id: "normal", inputMode: "pointer" },
  menuKey,
  canEmbedYouTube = true,
  i18n = EN_I18N,
} = {}) => {
  const state = appStore.createInitialState();
  appStore.setUiConfig({ state }, { uiConfig });
  appStore.setCurrentRoute({ state }, { route });

  const store = {};
  Object.entries(appStore).forEach(([name, fn]) => {
    if (name !== "createInitialState" && typeof fn === "function") {
      store[name] = (payload) => fn({ state, i18n }, payload);
    }
  });

  const deps = {
    store,
    i18n,
    render: vi.fn(),
    appService: {
      openUrl: vi.fn(),
      canEmbedYouTube: () => canEmbedYouTube,
      showDropdownMenu: vi.fn(async ({ items }) => ({
        item: items.find((item) => item.key === menuKey),
      })),
    },
  };
  const click = () =>
    handleHelpFloatingButtonClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({
            left: 1360,
            right: 1416,
            top: 820,
            bottom: 876,
            width: 56,
            height: 56,
          }),
        },
      },
    });

  return {
    state,
    deps,
    click,
    viewData: () => store.selectViewData(),
  };
};

describe("help button menu", () => {
  it("maps every page tutorial to a video in the list, for both layouts", () => {
    Object.values(tutorialVideos.pageVideos).forEach((videos) => {
      expect(findTutorialVideo(videos.desktop)).toBeDefined();
      expect(findTutorialVideo(videos.mobile)).toBeDefined();
    });
  });

  it("offers the tutorial recorded for the current layout", async () => {
    const menuKeysOn = async (uiConfig) => {
      const app = createApp({ route: "/projects", uiConfig, menuKey: "video" });
      await app.click();
      return app.viewData().helpVideo.youtubeId;
    };

    expect(await menuKeysOn({ id: "normal", inputMode: "pointer" })).toBe(
      tutorialVideos.pageVideos["/projects"].desktop,
    );
    expect(await menuKeysOn({ id: "touch", inputMode: "touch" })).toBe(
      tutorialVideos.pageVideos["/projects"].mobile,
    );
  });

  it("offers docs, the video and chat support above the button on Images", async () => {
    const app = createApp({ route: "/project/images" });

    await app.click();

    const [menu] = app.deps.appService.showDropdownMenu.mock.calls[0];
    expect(
      menu.items.map(({ key, label, icon }) => [key, label, icon]),
    ).toEqual([
      ["docs", "Documentation", "book"],
      ["video", "Video Tutorial", "video"],
      ["chat", "Chat Support", "chat"],
    ]);
    expect(menu).toMatchObject({ x: 1416, y: 812, place: "te" });
  });

  it("labels the menu in the app language", async () => {
    const app = createApp({ route: "/project/images", i18n: JA_I18N });

    await app.click();

    const [menu] = app.deps.appService.showDropdownMenu.mock.calls[0];
    expect(menu.items.map(({ label }) => label)).toEqual([
      JA_I18N.appPage.helpMenuDocs,
      JA_I18N.appPage.helpMenuVideo,
      JA_I18N.appPage.helpMenuChat,
    ]);
  });

  it("opens the page's docs from Documentation", async () => {
    const app = createApp({ route: "/project/images", menuKey: "docs" });

    await app.click();

    expect(app.deps.appService.openUrl).toHaveBeenCalledWith(
      "https://routevn.com/en/creator/docs/images/",
    );
  });

  it("plays the page's tutorial full screen from Video Tutorial", async () => {
    const app = createApp({ route: "/project/images", menuKey: "video" });

    await app.click();

    expect(app.viewData().helpVideo).toEqual(
      findTutorialVideo(IMAGES_VIDEO_ID),
    );
    const html = renderViewYaml("src/pages/app/app.view.yaml", app.viewData());
    expect(html).toContain("<rvn-youtube-player");
    expect(app.deps.appService.openUrl).not.toHaveBeenCalled();

    handleHelpVideoClose(app.deps);
    expect(app.viewData().helpVideo).toBeUndefined();
    expect(
      renderViewYaml("src/pages/app/app.view.yaml", app.viewData()),
    ).not.toContain("<rvn-youtube-player");
  });

  it("opens the tutorial on YouTube where the player cannot play in the app", async () => {
    const app = createApp({
      route: "/project/images",
      menuKey: "video",
      canEmbedYouTube: false,
    });

    await app.click();

    expect(app.deps.appService.openUrl).toHaveBeenCalledWith(
      `https://www.youtube.com/watch?v=${IMAGES_VIDEO_ID}`,
    );
    expect(app.viewData().helpVideo).toBeUndefined();
  });

  it("opens the Chat Support dialog, and closes it", async () => {
    const app = createApp({ route: "/project/images", menuKey: "chat" });

    await app.click();
    expect(app.viewData().isChatSupportDialogOpen).toBe(true);

    handleChatSupportDialogClose(app.deps);
    expect(app.viewData().isChatSupportDialogOpen).toBe(false);
  });

  it("closes the help video and Chat Support when the page changes", async () => {
    const video = createApp({ route: "/project/images", menuKey: "video" });
    await video.click();
    appStore.setCurrentRoute(
      { state: video.state },
      { route: "/project/images", payload: { p: "project-1" } },
    );
    expect(video.viewData().helpVideo).toBeDefined();

    appStore.setCurrentRoute(
      { state: video.state },
      { route: "/project/sounds", payload: { p: "project-1" } },
    );
    expect(video.viewData().helpVideo).toBeUndefined();

    const chat = createApp({ route: "/project/images", menuKey: "chat" });
    await chat.click();
    appStore.setCurrentRoute(
      { state: chat.state },
      { route: "/project/sounds" },
    );
    expect(chat.viewData().isChatSupportDialogOpen).toBe(false);
  });

  it("does nothing when the menu is dismissed", async () => {
    const app = createApp({ route: "/project/images" });

    await app.click();

    expect(app.deps.appService.openUrl).not.toHaveBeenCalled();
    expect(app.viewData().helpVideo).toBeUndefined();
    expect(app.viewData().isChatSupportDialogOpen).toBe(false);
  });

  it("offers docs and chat support, without a video, on other pages", async () => {
    const app = createApp({ route: "/project/sounds", menuKey: "docs" });

    await app.click();

    const [menu] = app.deps.appService.showDropdownMenu.mock.calls[0];
    expect(menu.items.map(({ key }) => key)).toEqual(["docs", "chat"]);
    expect(app.deps.appService.openUrl).toHaveBeenCalledWith(
      "https://routevn.com/en/creator/docs/sounds/",
    );
  });

  it("offers chat support from every page with the help button", async () => {
    const app = createApp({ route: "/project/variables", menuKey: "chat" });

    await app.click();

    expect(app.viewData().isChatSupportDialogOpen).toBe(true);
  });
});
