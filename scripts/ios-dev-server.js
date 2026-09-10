import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { watch } from "@rettangoli/fe/cli";
import yaml from "js-yaml";
import { devServerStatePath, resolveDevServerURL } from "./ios-dev.js";

export function createIOSDevPlugin({ url, token, cwd = process.cwd() }) {
  return {
    name: "routevn-ios-dev",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split("?")[0];
        if (pathname?.startsWith("/__routevn_ios_dev/")) {
          const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            request.socket.remoteAddress,
          );
          if (!local || request.headers.authorization !== `Bearer ${token}`) {
            response.writeHead(403).end("Local development commands only.");
            return;
          }
          if (
            pathname === "/__routevn_ios_dev/refresh" &&
            request.method === "POST"
          ) {
            if (server.ws.clients.size === 0) {
              response
                .writeHead(409)
                .end(
                  "No connected dev clients. Open the iPhone app with bun run ios:dev.",
                );
              return;
            }
            server.ws.send({ type: "full-reload", path: "*" });
          } else if (
            pathname !== "/__routevn_ios_dev/status" ||
            request.method !== "GET"
          ) {
            response.writeHead(405).end("Unsupported development command.");
            return;
          }
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          response.end(
            JSON.stringify({ url, clients: server.ws.clients.size }),
          );
          return;
        }
        if (pathname !== "/ios/index.html") {
          next();
          return;
        }
        try {
          // Vite serves publicDir files verbatim. Transform the live iOS HTML
          // explicitly so its HMR client is present, while keeping the polyfill.
          const html = await readFile(
            resolve(cwd, "static/ios/index.html"),
            "utf8",
          );
          const transformed = await server.transformIndexHtml(
            request.url,
            html,
          );
          response.writeHead(200, {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
          });
          response.end(transformed);
          console.log(
            `[iOS dev] HTML loaded by ${request.socket.remoteAddress}`,
          );
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

async function start() {
  const url = resolveDevServerURL();
  const port = new URL(url).port;
  const token = randomBytes(32).toString("hex");
  const { fe } = yaml.load(await readFile("rettangoli.config.yaml", "utf8"));
  await watch({
    ...fe,
    setup: "src/setup.ios.js",
    port: port === "" ? 80 : Number(port),
    vitePlugins: [createIOSDevPlugin({ url, token })],
  });
  await mkdir(dirname(devServerStatePath), { recursive: true });
  await writeFile(devServerStatePath, JSON.stringify({ url, token }), {
    mode: 0o600,
  });
  console.log(`\niPhone dev URL: ${url}`);
  console.log("Keep the iPhone and Mac on the same local network.");
  console.log("Open the installed app: bun run ios:dev");
  console.log("Refresh JavaScript:     bun run ios:refresh");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
