const ASSET_STORE_RPC_PATH = "/asset-store/rpc";
const PRODUCTION_RPC_URL = `https://api1.routevn.com${ASSET_STORE_RPC_PATH}`;
// Development builds call a local API that serves the asset store methods.
const LOCAL_RPC_URL = `http://127.0.0.1:3100${ASSET_STORE_RPC_PATH}`;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_LIMIT = 20;
const MAX_QUERY_LENGTH = 100;
// The kinds of resources a pack can hold, in the order the app shows them.
const ASSET_TYPES = Object.freeze([
  "IMAGES",
  "SOUNDS",
  "VIDEOS",
  "CHARACTERS",
  "TRANSFORMS",
  "ANIMATIONS",
  "AUDIO_EFFECTS",
  "PARTICLES",
  "SPRITESHEETS",
  "COLORS",
  "FONTS",
  "TEXT_STYLES",
  "LAYOUTS",
  "VARIABLES",
  "CONTROLS",
]);

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

const creatorNotFound = () =>
  new AssetStoreError(
    "asset_creator_not_found",
    "The creator is no longer available.",
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

const isTimestamp = (value) => Number.isInteger(value) && value > 0;

const runText = (runs) =>
  Array.isArray(runs) ? runs.map((run) => run?.text ?? "").join("") : "";

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

// Rich text as plain paragraphs (`{ text }`) and images (`{ imageUrl, alt,
// width, height }`); list items keep a bullet. An image `files` does not map
// is left out.
const readDescription = (blocks, fileUrls) => {
  if (!Array.isArray(blocks)) return [];
  const description = [];
  const paragraph = (text) => {
    if (text.trim() !== "") description.push({ text });
  };
  for (const block of blocks) {
    if (block?.type === "HEADING") paragraph(block.text ?? "");
    if (block?.type === "PARAGRAPH") paragraph(runText(block.children));
    if (block?.type === "LIST" && Array.isArray(block.items)) {
      for (const item of block.items) {
        paragraph(`• ${runText(item?.children)}`);
      }
    }
    const imageUrl = block?.type === "IMAGE" && fileUrls.get(block.fileId);
    if (
      imageUrl &&
      isPositiveInteger(block.width) &&
      isPositiveInteger(block.height)
    ) {
      description.push({
        imageUrl,
        alt: typeof block.alt === "string" ? block.alt : "",
        width: block.width,
        height: block.height,
      });
    }
  }
  return description;
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

const readCreator = (creator, fileUrls) => {
  if (!isObject(creator) || !isText(creator.id) || !isText(creator.name)) {
    return undefined;
  }
  return {
    id: creator.id,
    name: creator.name,
    avatarUrl: fileUrls.get(creator.avatarFileId),
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

// A pack's assets of each type, as `[{ assetType, count }]` in the app's type
// order. Types the app does not know, and counts that are not positive, are
// left out.
const readAssetCounts = (assetCounts) =>
  ASSET_TYPES.filter((assetType) =>
    isPositiveInteger(assetCounts[assetType]),
  ).map((assetType) => ({ assetType, count: assetCounts[assetType] }));

// The app has no purchases, so it shows and opens free packs only. A card
// carries the title, summary, cover, asset counts, release date and creator.
// The description comes with the pack's details.
const readPack = ({ id, data, creator: creatorData }, fileUrls) => {
  if (!isText(id) || !isObject(data)) {
    return undefined;
  }
  const creator = readCreator(creatorData, fileUrls);
  if (
    !isText(data.title) ||
    !isObject(data.assetCounts) ||
    data.pricing?.type !== "FREE" ||
    !creator
  ) {
    return undefined;
  }
  const assetCounts = readAssetCounts(data.assetCounts);
  return {
    id,
    title: data.title,
    // A pack published without a summary has none.
    summary: typeof data.summary === "string" ? data.summary.trim() : "",
    assetCounts,
    assetCount: assetCounts.reduce((total, { count }) => total + count, 0),
    coverUrl: fileUrls.get(data.coverFileId),
    releasedAt: isTimestamp(data.listedAt) ? data.listedAt : undefined,
    creator,
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
    // `query` matches pack titles and creator names; empty lists every pack.
    // `assetTypes` lists packs with assets of any of the types.
    async listAssetPacks({ cursor, query, assetTypes = [] } = {}) {
      const trimmedQuery = query?.trim().slice(0, MAX_QUERY_LENGTH);
      const result = await call("assetStore.listAssetPacks", {
        query: trimmedQuery ? trimmedQuery : null,
        pricingType: "FREE",
        assetTypes: assetTypes.length > 0 ? assetTypes : null,
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
      const result = await call("assetStore.getAssetPackById", { assetPackId });
      if (!isObject(result.assetPack) || !Array.isArray(result.files)) {
        throw unavailable(new Error("Invalid asset pack."));
      }
      const fileUrls = readFileUrls(result.files);
      const { id, data } = result.assetPack;
      const pack = readPack({ id, data, creator: result.creator }, fileUrls);
      if (!pack) throw packNotFound();
      pack.description = readDescription(data.description, fileUrls);
      pack.versionName = isText(data.versionName)
        ? data.versionName
        : undefined;
      pack.releaseNotes =
        typeof data.releaseNotes === "string" ? data.releaseNotes.trim() : "";
      pack.updatedAt = isTimestamp(data.lastUpdatedAt)
        ? data.lastUpdatedAt
        : undefined;
      pack.importUrl = fileUrls.get(data.manifestFileId);
      if (!pack.importUrl) {
        throw unavailable(new Error("The asset pack has no import link."));
      }
      return pack;
    },

    // A creator's profile and packs. The API sends up to 100 of the creator's
    // packs, newest first, without a creator on each, so each pack takes it
    // from the profile.
    async getCreatorById({ creatorId } = {}) {
      const result = await call(
        "assetStore.getCreatorById",
        { creatorId },
        { notFound: creatorNotFound },
      );
      const { creator } = result;
      if (
        !isObject(creator) ||
        !isText(creator.id) ||
        !isObject(creator.data) ||
        !isText(creator.data.name) ||
        !Array.isArray(result.assetPacks) ||
        !Array.isArray(result.files)
      ) {
        throw unavailable(new Error("Invalid creator."));
      }
      const { data } = creator;
      const fileUrls = readFileUrls(result.files);
      const packCreator = {
        id: creator.id,
        name: data.name,
        avatarFileId: data.avatarFileId,
      };
      const description = isText(data.description) ? data.description : "";
      return {
        creator: {
          id: creator.id,
          name: data.name,
          avatarUrl: fileUrls.get(data.avatarFileId),
          description: description
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          links: readLinks(data.links),
        },
        packs: result.assetPacks
          .filter(isObject)
          .map(({ id, data: packData }) =>
            readPack({ id, data: packData, creator: packCreator }, fileUrls),
          )
          .filter(Boolean),
      };
    },
  };
};
