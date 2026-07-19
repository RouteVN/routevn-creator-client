import { invoke } from "@tauri-apps/api/core";

export const setDiscordPresenceDetails = ({ details }) => {
  return invoke("set_discord_presence_details", { details });
};
