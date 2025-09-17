import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

export const tauriFs = {
  readDir,
  exists,
  join,
};
