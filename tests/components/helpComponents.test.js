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
  const createPlayer = (props) => {
    const state = youtubePlayerStore.createInitialState();
    const store = {};
    Object.entries(youtubePlayerStore).forEach(([name, fn]) => {
      if (name !== "createInitialState") {
        store[name] = (payload) => fn({ state, props, i18n: EN_I18N }, payload);
      }
    });
    const sink = createEventSink();
    const deps = {
      ...sink,
      store,
      props,
      render: vi.fn(),
      appService: { openUrl: vi.fn() },
    };

    return {
      deps,
      events: sink.events,
      viewData: () => store.selectViewData(),
      html: () =>
        renderViewYaml(
          "src/components/youtubePlayer/youtubePlayer.view.yaml",
          store.selectViewData(),
        ),
    };
  };

  const openMenu = (player) => {
    player.deps.store.openMenu({ x: 0, y: 0 });
    player.deps.render();
  };

  it("plays the video full screen with its title", () => {
    const html = createPlayer({
      youtubeId: "Sngq78OLSB8",
      title: "Images",
    }).html();

    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/Sngq78OLSB8?autoplay=1&amp;rel=0&amp;playsinline=1"',
    );
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('title="Images"');
  });

  it("offers Open on YouTube from a three-dot menu", () => {
    const player = createPlayer({ youtubeId: "Sngq78OLSB8", title: "Images" });
    const html = player.html();

    const menuButton = html.match(/<rtgl-button id="menuButton"[^>]*>/)[0];
    expect(menuButton).toContain('pre="ellipsis"');
    expect(menuButton).toContain('sq="true"');
    expect(menuButton).toContain('aria-label="Actions"');
    expect(html).not.toContain(">Open on YouTube<");
    expect(player.viewData().menu.items).toEqual([
      { type: "item", label: "Open on YouTube", value: "open-on-youtube" },
    ]);
  });

  it("opens the menu under its button", () => {
    const player = createPlayer({ youtubeId: "Sngq78OLSB8" });

    youtubePlayerHandlers.handleMenuButtonClick(player.deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({ right: 300.4, bottom: 56.6 }),
        },
      },
    });

    expect(player.viewData().menu).toMatchObject({
      isOpen: true,
      x: 300,
      y: 57,
    });

    youtubePlayerHandlers.handleMenuClose(player.deps);
    expect(player.viewData().menu.isOpen).toBe(false);
    expect(player.events).toEqual([]);
  });

  it("hands the video over to YouTube from the menu", () => {
    const player = createPlayer({ youtubeId: "Sngq78OLSB8" });
    openMenu(player);

    youtubePlayerHandlers.handleMenuItemClick(player.deps, {
      _event: { detail: { item: player.viewData().menu.items[0] } },
    });

    expect(player.viewData().menu.isOpen).toBe(false);
    expect(player.events).toEqual(["close"]);
    expect(player.deps.appService.openUrl).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=Sngq78OLSB8",
    );
  });

  it("closes", () => {
    const player = createPlayer({ youtubeId: "Sngq78OLSB8" });

    youtubePlayerHandlers.handleClose(player.deps);

    expect(player.events).toEqual(["close"]);
    expect(player.deps.appService.openUrl).not.toHaveBeenCalled();
  });

  it("shows nothing without a video", () => {
    expect(createPlayer({}).html()).not.toContain("<rtgl-dialog");
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
