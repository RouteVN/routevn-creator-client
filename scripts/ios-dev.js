import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const devServerStatePath = resolve(".artifacts/ios-dev-server.json");

export function resolveDevServerURL(
  env = process.env,
  interfaces = networkInterfaces(),
) {
  const port = Number(env.IOS_DEV_PORT ?? 3004);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("IOS_DEV_PORT must be a port between 1 and 65535.");
  }
  // Prefer the Mac's Wi-Fi/Ethernet interfaces over VPNs and virtual adapters.
  const address = Object.entries(interfaces)
    .filter(([name]) => /^en\d+$/.test(name))
    .flatMap(([, addresses]) => addresses)
    .find((entry) => entry.family === "IPv4" && !entry.internal)?.address;
  const host = env.IOS_DEV_HOST ?? address;
  if (!host) {
    throw new Error(
      "No LAN address found. Set IOS_DEV_HOST to an address the iPhone can reach.",
    );
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new Error(
      "IOS_DEV_HOST must be a hostname or IPv4 address, without a scheme or port.",
    );
  }
  return new URL(`http://${host}:${port}/ios/index.html`).href;
}

export async function callDevServer(command, statePath = devServerStatePath) {
  let state;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    throw new Error("Start bun run watch:ios first.");
  }
  let response;
  try {
    const port = new URL(state.url).port;
    response = await fetch(
      `http://127.0.0.1:${port === "" ? 80 : port}/__routevn_ios_dev/${command}`,
      {
        method: command === "refresh" ? "POST" : "GET",
        headers: { Authorization: `Bearer ${state.token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    throw new Error(
      "The iOS dev server is unavailable. Start bun run watch:ios first.",
    );
  }
  if (!response.ok) {
    throw new Error(`iOS dev server: ${await response.text()}`);
  }
  return response.json();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const command = process.argv[2];
    if (command === "refresh") {
      const { clients } = await callDevServer("refresh");
      console.log(
        `JavaScript reload sent to ${clients} connected dev client(s). No native build or install.`,
      );
    } else if (command === "url") {
      const { url } = await callDevServer("status");
      console.log(url);
    } else {
      throw new Error("Usage: node scripts/ios-dev.js [url|refresh]");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
