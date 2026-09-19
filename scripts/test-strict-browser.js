import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const engineName = process.argv.includes("--webkit") ? "webkit" : "chromium";
const workspace = await mkdtemp(join(tmpdir(), "routevn-strict-browser-"));
let browser;
let server;
try {
  const output = join(workspace, "strict.js");
  execFileSync(
    "bun",
    [
      "build",
      "tests/projectCompatibility/strictBrowserEntry.mjs",
      "--target",
      "browser",
      "--outfile",
      output,
    ],
    { stdio: "pipe" },
  );
  const bundle = await readFile(output);
  server = createServer((request, response) => {
    response.setHeader(
      "Content-Type",
      request.url === "/strict.js" ? "text/javascript" : "text/html",
    );
    response.end(
      request.url === "/strict.js"
        ? bundle
        : '<!doctype html><script type="module" src="/strict.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await (engineName === "webkit" ? webkit : chromium).launch({
    headless: true,
  });
  const context = await browser.newContext();
  const first = await context.newPage(),
    second = await context.newPage();
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const page of [first, second]) {
    await page.goto(url);
    await page.waitForFunction(() => window.openStrictProject);
    await page.evaluate(() => window.openStrictProject("project-one"));
  }
  const file = (id, fileId) => ({
    id,
    partition: "main",
    type: "file.create",
    payload: {
      fileId,
      data: { mimeType: "image/png", size: 1, sha256: "one" },
    },
  });
  const results = await Promise.all([
    first.evaluate(
      (request) => window.strictProject.submit([request]),
      file("first-command", "shared-file"),
    ),
    second.evaluate(
      (request) => window.strictProject.submit([request]),
      file("second-command", "shared-file"),
    ),
  ]);
  assert.equal(
    results.filter((result) => result.valid).length,
    1,
    "Web Locks must make competing creates validate serially",
  );
  const drafts = await first.evaluate(() => window.strictProject.drafts());
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].schemaVersion, 2);
  assert.equal(drafts[0].rawSchemaVersion, 2);
  assert.equal(drafts[0].payload.mv, 16);
  for (const page of [first, second]) {
    const state = await page.evaluate(() => window.strictProject.state());
    assert.equal(state.files.items["shared-file"].id, "shared-file");
  }
  const invalid = await first.evaluate(
    (request) =>
      window.strictProject.submit([
        request,
        {
          id: "bad-image",
          partition: "main",
          type: "image.create",
          payload: {
            imageId: "image-one",
            data: { type: "image", name: "Image One", fileId: "missing-file" },
          },
        },
      ]),
    file("batch-command", "another-file"),
  );
  assert.equal(invalid.valid, false);
  assert.equal(
    (await first.evaluate(() => window.strictProject.drafts())).length,
    1,
  );
  const winningRequest = file(drafts[0].id, "shared-file");
  assert.equal(
    (
      await second.evaluate(
        (request) => window.strictProject.submit([request]),
        winningRequest,
      )
    ).valid,
    true,
  );
  assert.equal(
    (await first.evaluate(() => window.strictProject.drafts())).length,
    1,
  );
  await first.reload();
  await first.waitForFunction(() => window.openStrictProject);
  await first.evaluate(() => window.openStrictProject("project-one"));
  assert.equal(
    (await first.evaluate(() => window.strictProject.state())).files.items[
      "shared-file"
    ].id,
    "shared-file",
  );
  console.log(
    `Strict ${engineName}: PASS (two tabs, actual IndexedDB and Web Locks, atomic preflight, exact retry, reload)`,
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(workspace, { recursive: true, force: true });
}
