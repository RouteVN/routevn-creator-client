// The web app database's getOrSet in real browsers: two tabs racing to keep a
// value under one key both answer the one that was kept, and it stays across
// reloads. Uses isolated browser profiles and a local page.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, webkit } from "playwright";

const source = await readFile(
  new URL("../../src/deps/clients/web/db.js", import.meta.url),
  "utf8",
);
const server = createServer((request, response) => {
  if (request.url === "/db.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end(source);
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end("<!doctype html><title>Project One</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const keep = (page, value) =>
  page.evaluate(async (value) => {
    const { createDb } = await import("/db.js");
    const db = createDb({ path: "app" });
    await db.init();
    return Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        db.getOrSet("deviceId", `${value}-${index}`),
      ),
    );
  }, value);

try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const first = await context.newPage();
      const second = await context.newPage();
      await Promise.all([first.goto(origin), second.goto(origin)]);

      const answers = (
        await Promise.all([keep(first, "first"), keep(second, "second")])
      ).flat();
      const [kept] = answers;
      assert.match(kept, /^(first|second)-\d$/);
      assert.deepEqual(new Set(answers), new Set([kept]));

      await first.reload();
      assert.deepEqual(new Set(await keep(first, "reloaded")), new Set([kept]));
      const read = await first.evaluate(async () => {
        const { createDb } = await import("/db.js");
        const db = createDb({ path: "app" });
        await db.init();
        return db.get("deviceId");
      });
      assert.equal(read, kept);
      console.log(`${name}: racing tabs and a reload keep one value`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
