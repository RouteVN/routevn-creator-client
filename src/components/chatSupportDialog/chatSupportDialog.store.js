import {
  ROUTEVN_DISCORD_URL,
  ROUTEVN_CONTACT_EMAIL_URL,
  ROUTEVN_TELEGRAM_URL,
  ROUTEVN_WHATSAPP_URL,
} from "../../internal/routevnUrls.js";

// Brand names and contact details stay as they are; only Email is
// translated.
const CHANNELS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    svg: "whatsapp",
    detail: "+65 8911 3417",
    href: ROUTEVN_WHATSAPP_URL,
  },
  {
    id: "telegram",
    label: "Telegram",
    svg: "telegram",
    detail: "@routevn",
    href: ROUTEVN_TELEGRAM_URL,
  },
  {
    id: "discord",
    label: "Discord",
    svg: "discord",
    detail: "discord.gg/8J9dyZSu9C",
    href: ROUTEVN_DISCORD_URL,
  },
  {
    id: "email",
    svg: "mail",
    detail: "contact@routevn.com",
    href: ROUTEVN_CONTACT_EMAIL_URL,
  },
];

export const createInitialState = () => ({});

export const selectChannelHref = (_context, { channelId } = {}) =>
  CHANNELS.find((channel) => channel.id === channelId)?.href;

export const selectViewData = ({ props = {}, i18n = {} }) => {
  const copy = i18n.chatSupportDialog ?? {};

  return {
    open: Boolean(props.open),
    title: copy.title ?? "Chat Support",
    description:
      copy.description ??
      "Message us on any of these, and we'll get back to you.",
    closeLabel: copy.closeLabel ?? "Close",
    channels: CHANNELS.map((channel) => ({
      ...channel,
      label: channel.label ?? copy.emailLabel ?? "Email",
    })),
  };
};
