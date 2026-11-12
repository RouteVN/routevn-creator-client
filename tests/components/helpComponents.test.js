import { describe, expect, it, vi } from "vitest";
import * as chatSupportHandlers from "../../src/components/chatSupportDialog/chatSupportDialog.handlers.js";
import * as chatSupportStore from "../../src/components/chatSupportDialog/chatSupportDialog.store.js";
import * as youtubePlayerHandlers from "../../src/components/youtubePlayer/youtubePlayer.handlers.js";
import * as youtubePlayerStore from "../../src/components/youtubePlayer/youtubePlayer.store.js";
import defaultCapability from "../../src-tauri/capabilities/default.json";
import { EN_I18N, JA_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const createEventSink = () => {
  const events = [];
  return {
    events,
    dispatchEvent: (event) => events.push(event.type),
  };
};

describe("YouTube player", () => {
  const render = (props) =>
    renderViewYaml(
      "src/components/youtubePlayer/youtubePlayer.view.yaml",
      youtubePlayerStore.selectViewData({ props, i18n: EN_I18N }),
    );

  it("plays the video full screen with its title", () => {
    const html = render({ youtubeId: "Sngq78OLSB8", title: "Images" });

    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/Sngq78OLSB8?autoplay=1&amp;rel=0&amp;playsinline=1"',
    );
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('title="Images"');
    expect(html).toContain("Open on YouTube");
  });

  it("shows nothing without a video", () => {
    expect(render({})).not.toContain("<rtgl-dialog");
  });

  it("closes, or hands the video over to YouTube", () => {
    const sink = createEventSink();
    const appService = { openUrl: vi.fn() };
    const deps = {
      ...sink,
      appService,
      props: { youtubeId: "Sngq78OLSB8" },
    };

    youtubePlayerHandlers.handleClose(deps);
    youtubePlayerHandlers.handleOpenOnYouTubeClick(deps);

    expect(sink.events).toEqual(["close", "close"]);
    expect(appService.openUrl).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=Sngq78OLSB8",
    );
  });
});

describe("Chat Support dialog", () => {
  const viewData = (i18n = EN_I18N) =>
    chatSupportStore.selectViewData({ props: { open: true }, i18n });

  it("lists WhatsApp, Telegram, Discord and Email one under another", () => {
    const { channels, title } = viewData();

    expect(title).toBe("Chat Support");
    expect(
      channels.map(({ label, svg, detail }) => [label, svg, detail]),
    ).toEqual([
      ["WhatsApp", "whatsapp", "+65 8911 3417"],
      ["Telegram", "telegram", "@routevn"],
      ["Discord", "discord", "discord.gg/8J9dyZSu9C"],
      ["Email", "mail", "contact@routevn.com"],
    ]);

    const html = renderViewYaml(
      "src/components/chatSupportDialog/chatSupportDialog.view.yaml",
      viewData(),
    );
    expect(html).not.toContain("<rtgl-grid");
    expect(html.match(/data-channel-id="/g)).toHaveLength(4);
    expect(html).toContain("contact@routevn.com");
    expect(html).toContain("Message us on any of these");
    expect(html).toContain('id="closeButton"');
  });

  it("translates only Email", () => {
    expect(viewData(JA_I18N).channels.map(({ label }) => label)).toEqual([
      "WhatsApp",
      "Telegram",
      "Discord",
      JA_I18N.chatSupportDialog.emailLabel,
    ]);
  });

  it("opens the chosen channel and closes", () => {
    const sink = createEventSink();
    const appService = { openUrl: vi.fn() };
    const store = {
      selectChannelHref: (payload) =>
        chatSupportStore.selectChannelHref({}, payload),
    };

    chatSupportHandlers.handleChannelClick(
      { ...sink, appService, store },
      { _event: { currentTarget: { dataset: { channelId: "email" } } } },
    );

    expect(appService.openUrl).toHaveBeenCalledWith(
      "mailto:contact@routevn.com",
    );
    expect(sink.events).toEqual(["close"]);
  });

  it("opens a focused channel with Enter or Space only", () => {
    const sink = createEventSink();
    const appService = { openUrl: vi.fn() };
    const store = {
      selectChannelHref: (payload) =>
        chatSupportStore.selectChannelHref({}, payload),
    };
    const keyEvent = (key) => ({
      _event: {
        key,
        preventDefault: vi.fn(),
        currentTarget: { dataset: { channelId: "telegram" } },
      },
    });

    chatSupportHandlers.handleChannelKeyDown(
      { ...sink, appService, store },
      keyEvent("Tab"),
    );
    expect(appService.openUrl).not.toHaveBeenCalled();

    chatSupportHandlers.handleChannelKeyDown(
      { ...sink, appService, store },
      keyEvent("Enter"),
    );
    chatSupportHandlers.handleChannelKeyDown(
      { ...sink, appService, store },
      keyEvent(" "),
    );
    expect(appService.openUrl).toHaveBeenCalledTimes(2);
    expect(appService.openUrl).toHaveBeenCalledWith("https://t.me/routevn");
  });

  // The desktop app opens only links its opener allowlist matches, as globs.
  it("lets the desktop app open every channel", () => {
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
    const blocked = viewData()
      .channels.map(({ href }) => href)
      .filter((href) => !allow.some(({ url }) => globToRegExp(url).test(href)));

    expect(blocked).toEqual([]);
  });
});
