const ASSET_STORE_RPC_PATH = "/reader/rpc";
const PRODUCTION_RPC_URL = `https://api1.routevn.com${ASSET_STORE_RPC_PATH}`;
// Development builds call a local API that serves the asset store methods.
const LOCAL_RPC_URL = `http://127.0.0.1:3100${ASSET_STORE_RPC_PATH}`;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_LIMIT = 20;
const MAX_QUERY_LENGTH = 100;

export class AssetStoreError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "AssetStoreError";
    this.code = code;
  }
}

const unavailable = (cause) =>
  new AssetStoreError(
    "asset_store_unavailable",
    "The asset store could not be loaded.",
    { cause },
  );

const packNotFound = () =>
  new AssetStoreError(
    "asset_pack_not_found",
    "The asset pack is no longer available.",
  );

const authorNotFound = () =>
  new AssetStoreError(
    "asset_author_not_found",
    "The author is no longer available.",
  );

export const resolveAssetStoreRpcUrl = ({ debug = false, override } = {}) => {
  const url = new URL(debug ? (override ?? LOCAL_RPC_URL) : PRODUCTION_RPC_URL);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Invalid asset store endpoint.");
  }
  return url.href;
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isText = (value) => typeof value === "string" && value.length > 0;

const isCount = (value) => Number.isInteger(value) && value >= 0;

const isTimestamp = (value) => Number.isInteger(value) && value > 0;

const runText = (runs) =>
  Array.isArray(runs) ? runs.map((run) => run?.text ?? "").join("") : "";

// Reader rich text as plain paragraphs; list items keep a bullet, images are
// left out.
const readParagraphs = (blocks) => {
  if (!Array.isArray(blocks)) return [];
  const paragraphs = [];
  for (const block of blocks) {
    if (block?.type === "HEADING") paragraphs.push(block.text ?? "");
    if (block?.type === "PARAGRAPH") paragraphs.push(runText(block.children));
    if (block?.type === "LIST" && Array.isArray(block.items)) {
      for (const item of block.items) {
        paragraphs.push(`• ${runText(item?.children)}`);
      }
    }
  }
  return paragraphs.filter((paragraph) => paragraph.trim() !== "");
};

// Responses list each image once in `files`; items refer to them by file id.
const isWebUrl = (value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

const readFileUrls = (files) => {
  const urls = new Map();
  for (const file of files) {
    if (isObject(file) && isText(file.fileId) && isWebUrl(file.url)) {
      urls.set(file.fileId, file.url);
    }
  }
  return urls;
};

const readAuthor = (author, fileUrls) => {
  if (!isObject(author) || !isText(author.id) || !isText(author.name)) {
    return undefined;
  }
  return {
    id: author.id,
    name: author.name,
    avatarUrl: fileUrls.get(author.avatarFileId),
  };
};

// Profile links open in the system browser, so only HTTPS links are kept.
const readLinks = (links) =>
  Array.isArray(links)
    ? links
        .filter(
          (link) =>
            isObject(link) &&
            isText(link.label) &&
            isWebUrl(link.url) &&
            new URL(link.url).protocol === "https:",
        )
        .map((link) => ({ label: link.label, url: link.url }))
    : [];

// The app has no purchases, so it shows and opens free packs only. A card
// carries the description and screenshots too, so a pack page shows them
// before the pack's details load.
const readPack = ({ id, data, author: authorData }, fileUrls) => {
  if (!isText(id) || !isObject(data)) {
    return undefined;
  }
  const author = readAuthor(authorData, fileUrls);
  if (
    !isText(data.title) ||
    !isCount(data.assetCount) ||
    data.pricing?.type !== "FREE" ||
    !author
  ) {
    return undefined;
  }
  return {
    id,
    title: data.title,
    assetCount: data.assetCount,
    coverUrl: fileUrls.get(data.coverFileId),
    description: readParagraphs(data.description),
    screenshotUrls: Array.isArray(data.screenshotFileIds)
      ? data.screenshotFileIds
          .map((fileId) => fileUrls.get(fileId))
          .filter(Boolean)
      : [],
    releasedAt: isTimestamp(data.listedAt) ? data.listedAt : undefined,
    author,
  };
};

export const createAssetStoreClient = ({
  url = resolveAssetStoreRpcUrl({
    debug: import.meta.env?.DEV === true,
    override: import.meta.env?.VITE_ROUTEVN_ASSET_STORE_RPC_URL,
  }),
  fetchImpl = globalThis.fetch,
} = {}) => {
  const call = async (method, params, { notFound = packNotFound } = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let text;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RouteVN-RPC": "1",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Asset store request failed with ${response.status}.`);
      }
      if (Number(response.headers.get("Content-Length")) > MAX_RESPONSE_BYTES) {
        throw new Error("Asset store response is too large.");
      }
      text = await response.text();
    } catch (error) {
      throw unavailable(error);
    } finally {
      clearTimeout(timeout);
    }
    if (text.length > MAX_RESPONSE_BYTES) {
      throw unavailable(new Error("Asset store response is too large."));
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw unavailable(error);
    }
    if (body?.error?.data?.code === "RESOURCE_NOT_FOUND") {
      throw notFound();
    }
    if (!isObject(body) || !isObject(body.result)) {
      throw unavailable(new Error(`Asset store method ${method} failed.`));
    }
    return body.result;
  };

  return {
    // `query` matches pack titles and author names; empty lists every pack.
    // `tags` lists packs with any of the tags. `authorId` lists one author's
    // packs.
    async listAssetPacks({ cursor, query, tags = [], authorId } = {}) {
      const trimmedQuery = query?.trim().slice(0, MAX_QUERY_LENGTH);
      const result = await call("reader.listAssetPacks", {
        query: trimmedQuery ? trimmedQuery : null,
        authorId: authorId ?? null,
        pricingType: "FREE",
        tags: tags.length > 0 ? tags : null,
        page: { cursor: cursor ?? null, limit: PAGE_LIMIT },
      });
      if (!Array.isArray(result.items) || !Array.isArray(result.files)) {
        throw unavailable(new Error("Invalid asset pack list."));
      }
      const fileUrls = readFileUrls(result.files);
      return {
        packs: result.items
          .filter(isObject)
          .map((item) => readPack(item, fileUrls))
          .filter(Boolean),
        nextCursor: isText(result.nextCursor) ? result.nextCursor : undefined,
      };
    },

    async getAssetPackById({ assetPackId } = {}) {
      const result = await call("reader.getAssetPackById", { assetPackId });
      if (!isObject(result.assetPack) || !Array.isArray(result.files)) {
        throw unavailable(new Error("Invalid asset pack."));
      }
      const fileUrls = readFileUrls(result.files);
      const { id, data } = result.assetPack;
      const pack = readPack({ id, data, author: result.author }, fileUrls);
      if (!pack) throw packNotFound();
      pack.versionName = isText(data.versionName)
        ? data.versionName
        : undefined;
      pack.updatedAt = isTimestamp(data.lastUpdatedAt)
        ? data.lastUpdatedAt
        : undefined;
      pack.importUrl = fileUrls.get(data.manifestFileId);
      if (!pack.importUrl) {
        throw unavailable(new Error("The asset pack has no import link."));
      }
      return pack;
    },

    // An author is a publisher profile, read through the reader's creator
    // method.
    async getAuthorById({ authorId } = {}) {
      const result = await call(
        "reader.getCreatorById",
        { creatorId: authorId },
        { notFound: authorNotFound },
      );
      const { creator } = result;
      if (
        !isObject(creator) ||
        !isText(creator.id) ||
        !isObject(creator.data) ||
        !isText(creator.data.name) ||
        !Array.isArray(result.files)
      ) {
        throw unavailable(new Error("Invalid author."));
      }
      const { data } = creator;
      const description = isText(data.description) ? data.description : "";
      return {
        id: creator.id,
        name: data.name,
        avatarUrl: readFileUrls(result.files).get(data.avatarFileId),
        description: description
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        links: readLinks(data.links),
      };
    },
  };
};
