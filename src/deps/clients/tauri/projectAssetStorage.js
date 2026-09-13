import { invoke } from "@tauri-apps/api/core";
import { computeSha256 } from "../sha256.js";

export const writeProjectAsset = async ({ filePath, bytes, sha256 }) => {
  const data =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  await invoke("write_project_asset", data, {
    headers: {
      "x-asset-path": encodeURIComponent(filePath),
      "x-asset-sha256": sha256 ?? (await computeSha256(data)),
    },
  });
};
