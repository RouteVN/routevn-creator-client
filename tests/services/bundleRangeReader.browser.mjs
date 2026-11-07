// Exercise reloads with a host that returns range bodies mislabeled as 200.
// Uses isolated browser profiles and a local fixture; no user projects change.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, webkit } from "playwright";
import { createBundle } from "../../src/deps/services/shared/projectExportService.js";

const source = await readFile(
  process.env.BUNDLE_READER_SOURCE ??
    new URL(
      "../../src/deps/services/shared/projectExportService.js",
      import.meta.url,
    ),
  "utf8",
);
const assets = {
  "image-one": { mime: "image/png", buffer: new Uint8Array([1, 2, 3, 4]) },
  "image-two": { mime: "image/png", buffer: new Uint8Array([5, 6, 7]) },
};
const bundle = await createBundle({ title: "Project One" }, assets);
const payloadOffset = 16 + new DataView(bundle.buffer).getUint32(1, false);
let breakRanges = false;
let recoveryDownloads = 0;
const server = createServer((request, response) => {
  if (request.url === "/reader.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(source);
    return;
  }
  if (request.url === "/package.bin") {
    response.setHeader("cache-control", "no-store");
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    if (!match) {
      recoveryDownloads++;
      response.writeHead(200);
      response.end(bundle);
      return;
    }
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (breakRanges && start >= payloadOffset) {
      response.writeHead(200);
    } else {
      response.writeHead(206, {
        "content-range": `bytes ${start}-${end}/${bundle.length}`,
      });
    }
    response.end(bundle.slice(start, end + 1));
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end("<!doctype html><title>Project One</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (let load = 0; load < 3; load++) {
        breakRanges = load > 0;
        recoveryDownloads = 0;
        if (load === 0) await page.goto(origin);
        else await page.reload();
        const result = await page.evaluate(async () => {
          const { createBundleRangeReader } = await import("/reader.js");
          const reader = await createBundleRangeReader();
          const loaded = await Promise.all([
            reader.readAsset("image-one"),
            reader.readAsset("image-two"),
          ]);
          return {
            assets: loaded.map((asset) => Array.from(asset.buffer)),
            instructions: await reader.readInstructions(),
            totalLength: reader.totalLength,
          };
        });
        assert.deepEqual(result.assets, [
          [1, 2, 3, 4],
          [5, 6, 7],
        ]);
        assert.deepEqual(result.instructions, { title: "Project One" });
        assert.equal(result.totalLength, bundle.length);
        assert.equal(recoveryDownloads, load === 0 ? 0 : 1);
      }
      console.log(
        `${name}: initial load and two malformed-range reloads passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
