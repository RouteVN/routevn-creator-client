import { spawn, spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  statSync,
  unwatchFile,
  watch,
  watchFile,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const siteDir = join(rootDir, "_site");
const publicDir = join(siteDir, "public");
const mainJsPath = join(publicDir, "main.js");
const sourceDir = join(rootDir, "src");
const tauriConfigPath = join(rootDir, "src-tauri", "tauri.conf.json");
const port = Number.parseInt(
  process.env.ROUTEVN_ANDROID_DEV_PORT ?? "3003",
  10,
);
const requestedSerial = process.env.ANDROID_SERIAL;
const packageName = "com.routevn.creator";
const activityName = `${packageName}/.MainActivity`;
const adbCommand = process.env.ADB ?? "adb";
const rtglCommand = process.env.ROUTEVN_RTGL_BIN ?? "rtgl";
const devPath = "/web/index.html";
const devUrl = `http://127.0.0.1:${port}${devPath}`;
const skipInitialBuild = process.env.ROUTEVN_ANDROID_DEV_SKIP_BUILD === "1";

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("ROUTEVN_ANDROID_DEV_PORT must be a valid TCP port.");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

const runSync = ({ command, args, cwd = rootDir, stdio = "pipe" }) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(stderr || stdout || `${command} ${args.join(" ")} failed`);
  }

  return result.stdout?.trim() ?? "";
};

const runAdb = ({ serial, args, stdio = "pipe" }) => {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  return runSync({ command: adbCommand, args: adbArgs, stdio });
};

const readDevices = () => {
  const output = runAdb({ args: ["devices", "-l"] });
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, status] = line.split(/\s+/, 2);
      return { line, serial, status };
    });
};

const selectDevice = () => {
  const devices = readDevices();
  const readyDevices = devices.filter((device) => device.status === "device");
  if (requestedSerial) {
    const requestedDevice = readyDevices.find(
      (device) => device.serial === requestedSerial,
    );
    if (requestedDevice) {
      return requestedDevice;
    }

    const availableSerials = readyDevices
      .map((device) => device.serial)
      .join(", ");
    throw new Error(
      `ANDROID_SERIAL=${requestedSerial} is not available. Ready devices: ${availableSerials || "none"}.`,
    );
  }

  if (readyDevices.length === 0) {
    const blockedDevices = devices
      .map((device) => `${device.serial} (${device.status})`)
      .join(", ");
    throw new Error(
      `No authorized Android device found. adb devices: ${blockedDevices || "none"}.`,
    );
  }

  return readyDevices[0];
};

const assertAppInstalled = (serial) => {
  let output;
  try {
    output = runAdb({
      serial,
      args: ["shell", "pm", "path", packageName],
    });
  } catch {
    output = "";
  }

  if (!output.startsWith("package:")) {
    throw new Error(
      `Android package ${packageName} is not installed. Run bun run android:install once, then restart android:dev.`,
    );
  }
};

const resolveRequestPath = (requestUrl) => {
  const url = new URL(requestUrl, devUrl);
  if (
    url.pathname === "/" ||
    url.pathname === "/web" ||
    url.pathname === "/web/"
  ) {
    return join(siteDir, "android", "index.html");
  }

  if (url.pathname === devPath) {
    return join(siteDir, "android", "index.html");
  }

  const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = resolve(siteDir, requestPath);
  const relativePath = relative(siteDir, filePath);
  if (relativePath === "" || relativePath.startsWith("..")) {
    return undefined;
  }

  return filePath;
};

const serveFile = (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let filePath;
  try {
    filePath = resolveRequestPath(request.url ?? "/");
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Cache-Control": "no-store" });
    response.end("Not found");
    return;
  }

  let stats = statSync(filePath);
  if (stats.isDirectory()) {
    filePath = join(filePath, "index.html");
    if (!existsSync(filePath)) {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end("Not found");
      return;
    }
    stats = statSync(filePath);
  }

  if (!stats.isFile()) {
    response.writeHead(404, { "Cache-Control": "no-store" });
    response.end("Not found");
    return;
  }

  const contentType =
    contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  response.writeHead(200, {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Content-Length": stats.size,
    "Content-Type": contentType,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
};

const listen = async (server) =>
  new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

const launchApp = (serial) => {
  const reloadToken = `${Date.now()}`;
  runAdb({
    serial,
    args: [
      "shell",
      "am",
      "start",
      "-n",
      activityName,
      "--es",
      "routevnDevServerUrl",
      devUrl,
      "--es",
      "routevnDevReloadToken",
      reloadToken,
    ],
  });
};

const createFrontendBuildProcess = () => {
  return spawn(rtglCommand, ["fe", "build", "-s", "src/setup.android.js"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });
};

const startSourceWatcher = ({ onChange }) => {
  const cleanupFns = [];

  try {
    const sourceWatcher = watch(
      sourceDir,
      { persistent: true, recursive: true },
      (_eventType, filename) => {
        if (!filename) {
          onChange();
          return;
        }

        const normalizedFilename = filename.toString().replaceAll("\\", "/");
        if (
          normalizedFilename.endsWith(".js") ||
          normalizedFilename.endsWith(".json") ||
          normalizedFilename.endsWith(".yaml") ||
          normalizedFilename.endsWith(".yml")
        ) {
          onChange();
        }
      },
    );
    cleanupFns.push(() => sourceWatcher.close());
  } catch {
    console.warn(
      "Recursive source watching is unavailable on this platform. Restart android:dev after frontend source changes.",
    );
  }

  if (existsSync(tauriConfigPath)) {
    watchFile(tauriConfigPath, { interval: 500 }, (current, previous) => {
      if (current.mtimeMs !== previous.mtimeMs) {
        onChange();
      }
    });
    cleanupFns.push(() => unwatchFile(tauriConfigPath));
  }

  return () => {
    for (const cleanup of cleanupFns) {
      cleanup();
    }
  };
};

const createFrontendBuildRunner = ({ onBuildSuccess }) => {
  let buildProcess;
  let buildQueued = false;

  const runBuild = () => {
    if (buildProcess) {
      buildQueued = true;
      return;
    }

    console.log("Rebuilding Android frontend bundle...");
    buildProcess = createFrontendBuildProcess();
    buildProcess.on("exit", (code, signal) => {
      buildProcess = undefined;

      if (code === 0) {
        onBuildSuccess();
      } else {
        const reason = signal ? `signal ${signal}` : `exit code ${code}`;
        console.error(`Android frontend rebuild failed with ${reason}.`);
      }

      if (buildQueued) {
        buildQueued = false;
        runBuild();
      }
    });
    buildProcess.on("error", (error) => {
      buildProcess = undefined;
      console.error(
        `Failed to start Android frontend rebuild: ${error.message}`,
      );
      if (buildQueued) {
        buildQueued = false;
        runBuild();
      }
    });
  };

  return {
    runBuild,
    stop() {
      if (buildProcess) {
        buildProcess.kill();
      }
    },
  };
};

const createDebouncedBuildRequest = ({ runBuild }) => {
  let buildTimer;

  return {
    requestBuild() {
      clearTimeout(buildTimer);
      buildTimer = setTimeout(runBuild, 200);
    },
    clear() {
      clearTimeout(buildTimer);
    },
  };
};

const createReloadHandler = ({ serial }) => {
  return () => {
    launchApp(serial);
    console.log(`Reloaded Android WebView from ${devUrl}`);
  };
};

const assertFrontendOutput = () => {
  if (!existsSync(mainJsPath)) {
    throw new Error(
      "_site/public/main.js is missing. Run bun run build:android before android:dev.",
    );
  }
};

const runInitialBuild = () => {
  if (skipInitialBuild) {
    return;
  }

  console.log("Building Android web assets...");
  runSync({
    command: "bun",
    args: ["run", "build:android"],
    stdio: "inherit",
  });
};

const verifyRtglAvailable = () => {
  try {
    runSync({ command: rtglCommand, args: ["--version"] });
  } catch {
    console.warn(
      `Could not run \`${rtglCommand} --version\`; android:dev will still try to use it for frontend rebuilds.`,
    );
  }
};

verifyRtglAvailable();
runInitialBuild();
assertFrontendOutput();

const device = selectDevice();
assertAppInstalled(device.serial);
runAdb({
  serial: device.serial,
  args: ["reverse", `tcp:${port}`, `tcp:${port}`],
});

const server = createServer(serveFile);
await listen(server);

let shutdownStarted = false;
let launched = false;
const reloadAfterBuild = createReloadHandler({ serial: device.serial });
const frontendBuildRunner = createFrontendBuildRunner({
  onBuildSuccess: () => {
    if (launched) {
      reloadAfterBuild();
    }
  },
});
const debouncedBuild = createDebouncedBuildRequest({
  runBuild: frontendBuildRunner.runBuild,
});
const stopSourceWatcher = startSourceWatcher({
  onChange: () => {
    if (launched) {
      debouncedBuild.requestBuild();
    }
  },
});

const shutdown = () => {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  debouncedBuild.clear();
  stopSourceWatcher();
  frontendBuildRunner.stop();
  server.close();
  try {
    runAdb({
      serial: device.serial,
      args: ["reverse", "--remove", `tcp:${port}`],
    });
  } catch {
    // The device may already be disconnected.
  }
};

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

launchApp(device.serial);
launched = true;
console.log(`Serving Android dev build at ${devUrl}`);
console.log(`Device: ${device.line}`);
console.log(
  "Edit frontend source files; successful rebuilds will reload the WebView.",
);
