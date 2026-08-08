import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(
  scriptDirectory,
  "..",
  "tests",
  "fixtures",
  "import-packages",
);
const host = process.env.ROUTEVN_IMPORT_TEST_HOST ?? "127.0.0.1";
const port = Number(process.env.ROUTEVN_IMPORT_TEST_PORT ?? 4179);
const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const previewMp4 = Buffer.from(
  "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",
  "base64",
);

const send = (response, status, body, contentType) => {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": contentType,
  });
  response.end(body);
};

const sendFixture = async (response, name) => {
  try {
    const body = await readFile(join(fixtureDirectory, name));
    send(response, 200, body, "application/json; charset=utf-8");
  } catch {
    send(
      response,
      500,
      JSON.stringify({ error: "fixture_unavailable" }),
      "application/json; charset=utf-8",
    );
  }
};

const routes = new Map([
  ["/manifests/transforms.json", "transforms.valid.json"],
  ["/manifests/animations.json", "animations.valid.json"],
  ["/manifests/integrity-failure.json", "integrity-failure.json"],
]);

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "accept, content-type",
      "access-control-allow-methods": "GET, OPTIONS",
    });
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (url.pathname === "/") {
    send(
      response,
      200,
      JSON.stringify(
        {
          manifests: [
            "/manifests/transforms.json",
            "/manifests/animations.json",
            "/manifests/integrity-failure.json",
          ],
          redirects: ["/import/transforms", "/import/animations"],
          files: ["/files/pixel.png", "/files/preview.mp4"],
          failures: ["/status/401", "/status/404", "/status/500"],
        },
        null,
        2,
      ),
      "application/json; charset=utf-8",
    );
    return;
  }

  if (url.pathname === "/import/transforms") {
    response.writeHead(302, { location: "/manifests/transforms.json" });
    response.end();
    return;
  }
  if (url.pathname === "/import/animations") {
    response.writeHead(302, { location: "/manifests/animations.json" });
    response.end();
    return;
  }
  if (url.pathname === "/files/pixel.png") {
    send(response, 200, pixelPng, "image/png");
    return;
  }
  if (url.pathname === "/files/preview.mp4") {
    send(response, 200, previewMp4, "video/mp4");
    return;
  }
  if (url.pathname === "/files/slow-pixel.png") {
    setTimeout(() => send(response, 200, pixelPng, "image/png"), 1_500);
    return;
  }
  if (url.pathname.startsWith("/status/")) {
    const status = Number(url.pathname.slice("/status/".length));
    send(
      response,
      Number.isInteger(status) ? status : 500,
      JSON.stringify({ error: `test_status_${status}` }),
      "application/json; charset=utf-8",
    );
    return;
  }

  const fixture = routes.get(url.pathname);
  if (fixture) {
    await sendFixture(response, fixture);
    return;
  }
  send(
    response,
    404,
    JSON.stringify({ error: "not_found" }),
    "application/json; charset=utf-8",
  );
});

server.listen(port, host, () => {
  console.log(`Import-package test server: http://${host}:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
