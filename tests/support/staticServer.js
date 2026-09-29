import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

// Serves a built web root on a random local port. Paths without an extension
// load that folder's index.html.
export const serveStatic = async (webRoot) => {
  const root = path.resolve(webRoot);
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const entryPath = path.extname(pathname)
      ? pathname
      : path.posix.join(pathname, "index.html");
    const filename = path.resolve(root, `.${entryPath}`);
    if (!filename.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(filename);
      response.setHeader(
        "Content-Type",
        mimeTypes[path.extname(filename)] ?? "application/octet-stream",
      );
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  };
};
