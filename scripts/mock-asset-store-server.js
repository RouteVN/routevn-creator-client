// A local stand-in for the asset store API's project template methods, until
// the API serves them. It answers JSON-RPC at /asset-store/rpc as the API
// does, with the same params, results and errors, and serves each file it
// names at /files/<fileId>. Development builds call 127.0.0.1:3100, the
// mock's default port, so the Creator uses it without configuration.
//
//   bun run mock:asset-store [--port 3100] [--delay 400] [--fail list|detail]
//
// --delay waits before every answer, to show loading states; --fail makes the
// template list or a template's page fail, to show their errors.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createMockAssetStoreFixtures } from "./mock-asset-store-fixtures.js";

const RPC_PATH = "/asset-store/rpc";
const FILES_PATH = "/files/";
const MAX_QUERY_LENGTH = 100;
const ID_PATTERN = /^[A-Za-z0-9]{16}$/;
const CARD_FIELDS = [
  "title",
  "summary",
  "coverFileId",
  "screenshotFileIds",
  "languages",
  "resolution",
  "creatorModelSchema",
  "pricing",
  "listedAt",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-RouteVN-RPC",
  "Access-Control-Max-Age": "600",
};

class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const invalidParams = (reason) =>
  new RpcError(-32602, "Invalid params", { reason });

const notFound = () =>
  new RpcError(-32000, "Resource not found", {
    code: "RESOURCE_NOT_FOUND",
    details: { resourceType: "PROJECT_TEMPLATE" },
  });

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const onlyKeys = (value, allowed, what) => {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw invalidParams(`${what} has unknown property ${extra}`);
};

const encodeCursor = (offset, filters) =>
  Buffer.from(JSON.stringify({ offset, filters })).toString("base64url");

const decodeCursor = (cursor, filters) => {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      Number.isInteger(decoded.offset) &&
      decoded.offset >= 0 &&
      JSON.stringify(decoded.filters) === JSON.stringify(filters)
    ) {
      return decoded.offset;
    }
  } catch {
    // An unreadable cursor is refused below, as a mismatched one is.
  }
  throw new RpcError(-32000, "Invalid cursor", {
    code: "INVALID_CURSOR",
    details: { reason: "INVALID_OR_MISMATCHED" },
  });
};

const toCard = ({ id, creator, data }) => ({
  id,
  data: Object.fromEntries(CARD_FIELDS.map((field) => [field, data[field]])),
  creator,
});

// Every file ID a result names, with its URL.
const listFiles = (fileIds, fileUrl) =>
  [...new Set(fileIds)].map((fileId) => ({ fileId, url: fileUrl(fileId) }));

const cardFileIds = ({ creator, data }) => [
  data.coverFileId,
  ...data.screenshotFileIds,
  creator.avatarFileId,
];

const descriptionFileIds = (description) =>
  description.flatMap((block) =>
    block.type === "IMAGE" ? [block.fileId] : [],
  );

export const createMockAssetStore = ({ fixtures, fileUrl, fail } = {}) => {
  const { templates } = fixtures;

  const methods = {
    "assetStore.listProjectTemplates"(params) {
      onlyKeys(params, ["query", "creatorModelSchema", "page"], "params");
      const { query, creatorModelSchema, page } = params;
      if (
        query !== null &&
        (typeof query !== "string" ||
          query.length < 1 ||
          query.length > MAX_QUERY_LENGTH)
      ) {
        throw invalidParams("query is null or 1 to 100 characters");
      }
      if (!Number.isInteger(creatorModelSchema) || creatorModelSchema < 1) {
        throw invalidParams("creatorModelSchema is a positive integer");
      }
      if (!isObject(page)) throw invalidParams("page is required");
      onlyKeys(page, ["cursor", "limit"], "page");
      if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 20) {
        throw invalidParams("page.limit is 1 to 20");
      }
      if (page.cursor !== null && typeof page.cursor !== "string") {
        throw invalidParams("page.cursor is null or a string");
      }
      if (fail === "list") {
        throw new RpcError(-32603, "Internal error (mock --fail list)");
      }

      const filters = { query, creatorModelSchema };
      const needle = query?.toLowerCase();
      const matching = templates.filter(
        ({ creator, data }) =>
          data.creatorModelSchema <= creatorModelSchema &&
          (!needle ||
            data.title.toLowerCase().includes(needle) ||
            creator.name.toLowerCase().includes(needle)),
      );
      const start =
        page.cursor === null ? 0 : decodeCursor(page.cursor, filters);
      const end = start + page.limit;
      const pageItems = matching.slice(start, end);
      return {
        items: pageItems.map(toCard),
        files: listFiles(pageItems.flatMap(cardFileIds), fileUrl),
        nextCursor: end < matching.length ? encodeCursor(end, filters) : null,
      };
    },

    "assetStore.getProjectTemplateById"(params) {
      onlyKeys(params, ["projectTemplateId", "device"], "params");
      const { projectTemplateId, device } = params;
      if (
        typeof projectTemplateId !== "string" ||
        !ID_PATTERN.test(projectTemplateId)
      ) {
        throw invalidParams("projectTemplateId is 16 Base62 characters");
      }
      if (device !== undefined && !isObject(device)) {
        throw invalidParams("device is an object");
      }
      if (fail === "detail") {
        throw new RpcError(-32603, "Internal error (mock --fail detail)");
      }
      const template = templates.find(({ id }) => id === projectTemplateId);
      if (!template) throw notFound();
      if (device) {
        console.log(`view of ${template.data.title} from device ${device.id}`);
      }
      return {
        projectTemplate: { id: template.id, data: template.data },
        creator: template.creator,
        files: listFiles(
          [
            ...cardFileIds(template),
            ...descriptionFileIds(template.data.description),
          ],
          fileUrl,
        ),
      };
    },
  };

  // A JSON-RPC request body to its response body.
  const answer = (body) => {
    const id = isObject(body) && "id" in body ? body.id : null;
    try {
      if (!isObject(body) || body.jsonrpc !== "2.0") {
        throw new RpcError(-32600, "Invalid request");
      }
      const method = methods[body.method];
      if (!method) throw new RpcError(-32601, "Method not found");
      if (!isObject(body.params)) throw invalidParams("params is an object");
      return { jsonrpc: "2.0", id, result: method(body.params) };
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      const rpcError = { code: error.code, message: error.message };
      if (error.data) rpcError.data = error.data;
      return { jsonrpc: "2.0", id, error: rpcError };
    }
  };

  return { answer };
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString()));
    request.on("error", reject);
  });

export const startMockAssetStoreServer = ({
  host = "127.0.0.1",
  port = 3100,
  delayMs = 0,
  fail,
} = {}) =>
  new Promise((resolve, reject) => {
    const fixtures = createMockAssetStoreFixtures();
    let baseUrl;
    const store = createMockAssetStore({
      fixtures,
      fail,
      fileUrl: (fileId) => `${baseUrl}${FILES_PATH}${fileId}`,
    });
    const wait = () =>
      new Promise((resolveWait) => setTimeout(resolveWait, delayMs));

    const server = createServer(async (request, response) => {
      const path = request.url.split("?")[0];
      if (request.method === "OPTIONS") {
        response.writeHead(204, CORS_HEADERS).end();
        return;
      }
      if (path === RPC_PATH && request.method === "POST") {
        let body;
        try {
          body = JSON.parse(await readBody(request));
        } catch {
          body = undefined;
        }
        await wait();
        const text = JSON.stringify(
          body === undefined
            ? {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: "Parse error" },
              }
            : store.answer(body),
        );
        response
          .writeHead(200, {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(text),
          })
          .end(text);
        return;
      }
      const file =
        request.method === "GET" && path.startsWith(FILES_PATH)
          ? fixtures.files.get(path.slice(FILES_PATH.length))
          : undefined;
      if (file) {
        response
          .writeHead(200, {
            ...CORS_HEADERS,
            "Content-Type": "image/svg+xml",
            "Cache-Control": "no-cache",
          })
          .end(file);
        return;
      }
      response.writeHead(404, CORS_HEADERS).end("Not found");
    });

    server.on("error", reject);
    server.listen(port, host, () => {
      baseUrl = `http://${host}:${server.address().port}`;
      resolve({
        server,
        url: `${baseUrl}${RPC_PATH}`,
        close: () => server.close(),
      });
    });
  });

const readOption = (args, name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const fail = readOption(args, "fail");
  if (fail !== undefined && fail !== "list" && fail !== "detail") {
    console.error("--fail takes list or detail");
    process.exit(1);
  }
  const { url } = await startMockAssetStoreServer({
    port: Number(readOption(args, "port") ?? 3100),
    delayMs: Number(readOption(args, "delay") ?? 400),
    fail,
  });
  console.log(`Mock asset store at ${url}`);
  console.log(
    "Serves assetStore.listProjectTemplates and assetStore.getProjectTemplateById.",
  );
}
