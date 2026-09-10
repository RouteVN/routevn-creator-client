import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "vite";
import { createIOSDevPlugin } from "../../scripts/ios-dev-server.js";
import { callDevServer, resolveDevServerURL } from "../../scripts/ios-dev.js";

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "ios-dev-test-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

describe("iPhone development workflow", () => {
  it("uses the LAN interface and supports explicit host/port settings", () => {
    const interfaces = {
      utun0: [{ family: "IPv4", address: "10.0.0.2", internal: false }],
      en0: [{ family: "IPv4", address: "192.168.1.10", internal: false }],
    };
    expect(resolveDevServerURL({}, interfaces)).toBe(
      "http://192.168.1.10:3004/ios/index.html",
    );
    expect(
      resolveDevServerURL(
        { IOS_DEV_HOST: "dev-mac.local", IOS_DEV_PORT: "4000" },
        {},
      ),
    ).toBe("http://dev-mac.local:4000/ios/index.html");
    expect(() => resolveDevServerURL({}, {})).toThrow("No LAN address");
    expect(() =>
      resolveDevServerURL({ IOS_DEV_PORT: "invalid" }, interfaces),
    ).toThrow("IOS_DEV_PORT");
    expect(() =>
      resolveDevServerURL({ IOS_DEV_HOST: "http://localhost" }, interfaces),
    ).toThrow("IOS_DEV_HOST");
  });

  it("injects live reload into the iOS HTML and sends a reload over a real WebSocket", async () => {
    const cwd = await temporaryDirectory();
    await mkdir(join(cwd, "static/ios"), { recursive: true });
    await writeFile(
      join(cwd, "static/ios/index.html"),
      '<html><head><script src="/ios/adoptedStyleSheets.js"></script></head><body>Project One</body></html>',
    );
    const token = "test-command-token";
    const server = await createServer({
      configFile: false,
      root: cwd,
      publicDir: "static",
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        createIOSDevPlugin({
          url: "http://dev-mac.local:3004/ios/index.html",
          token,
          cwd,
        }),
      ],
    });
    cleanups.push(() => server.close());
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const statePath = join(cwd, "server.json");
    await writeFile(statePath, JSON.stringify({ url: origin, token }));
    const html = await (await fetch(`${origin}/ios/index.html`)).text();
    expect(html).toContain("/@vite/client");
    expect(html).toContain("/ios/adoptedStyleSheets.js");
    expect(
      (await fetch(`${origin}/__routevn_ios_dev/refresh`, { method: "POST" }))
        .status,
    ).toBe(403);
    await expect(callDevServer("refresh", statePath)).rejects.toThrow(
      "No connected dev clients",
    );
    const socket = new WebSocket(
      `${origin.replace("http:", "ws:")}/?token=${server.config.webSocketToken}`,
      "vite-hmr",
    );
    cleanups.push(() => socket.close());
    await new Promise((resolve, reject) => {
      socket.addEventListener("message", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const message = new Promise((resolve) =>
      socket.addEventListener(
        "message",
        (event) => resolve(JSON.parse(event.data)),
        { once: true },
      ),
    );
    expect(await callDevServer("refresh", statePath)).toMatchObject({
      clients: 1,
    });
    expect(await message).toEqual({ type: "full-reload", path: "*" });
  });

  it("dev and packaged only update the device setting and launch without building or installing", async () => {
    const cwd = await temporaryDirectory();
    await mkdir(join(cwd, "scripts"));
    await copyFile("scripts/ios.sh", join(cwd, "scripts/ios.sh"));
    await mkdir(
      join(cwd, "ios/routevn/build/Build/Products/Debug-iphoneos/routevn.app"),
      { recursive: true },
    );
    const bin = join(cwd, "bin");
    await mkdir(bin);
    await writeFile(
      join(bin, "ios-deploy"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_COMMAND_LOG, JSON.stringify(args) + "\\n");
if (args.includes("--upload")) fs.copyFileSync(args[args.indexOf("--upload") + 1], process.env.TEST_DEVICE_CONFIG);
`,
      { mode: 0o755 },
    );
    for (const name of ["bun", "xcodebuild", "xcrun"]) {
      await writeFile(
        join(bin, name),
        '#!/bin/sh\necho "Unexpected build/Simulator command" >&2\nexit 99\n',
        { mode: 0o755 },
      );
    }
    const log = join(cwd, "commands.jsonl");
    const config = join(cwd, "device.json");
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TEST_COMMAND_LOG: log,
      TEST_DEVICE_CONFIG: config,
    };
    execFileSync(
      "bash",
      [
        "scripts/ios.sh",
        "dev",
        "--",
        "--device",
        "test-device",
        "--dev-server",
        "http://dev-mac.local:3004/ios/index.html",
      ],
      { cwd, env },
    );
    expect(JSON.parse(await readFile(config, "utf8"))).toEqual({
      url: "http://dev-mac.local:3004/ios/index.html",
    });
    execFileSync(
      "bash",
      ["scripts/ios.sh", "packaged", "--device", "test-device"],
      { cwd, env },
    );
    expect(JSON.parse(await readFile(config, "utf8"))).toEqual({ url: "" });
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call).toContain("test-device");
      if (call.includes("--bundle")) expect(call).toContain("--noinstall");
      else expect(call).toContain("--upload");
      expect(call).not.toContain("--uninstall");
    }
  });
});
