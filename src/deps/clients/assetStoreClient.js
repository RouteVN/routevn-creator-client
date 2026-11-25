import { SCHEMA_VERSION } from "@routevn/creator-model";
import { isDebugHost } from "../../internal/debugHost.js";

const ASSET_STORE_RPC_PATH = "/asset-store/rpc";
const PRODUCTION_RPC_URL = `https://api1.routevn.com${ASSET_STORE_RPC_PATH}`;
// Development builds call a local API that serves the asset store methods.
const LOCAL_RPC_URL = `http://127.0.0.1:3100${ASSET_STORE_RPC_PATH}`;
const MAX_RESPONSE_BYTES = 1024 * 1024;
// A pack's details carry its package's manifest, up to 2 MiB, and a URL for
// each of its media files.
const MAX_PACK_RESPONSE_BYTES = 4 * 1024 * 1024;
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

const templateNotFound = () =>
  new AssetStoreError(
    "project_template_not_found",
    "The project template is no longer available.",
  );

const creatorNotFound = () =>
  new AssetStoreError(
    "asset_creator_not_found",
    "The creator is no longer available.",
  );

// A page from a dev server (a local or private host, on a port) is a
// development build whatever its bundle mode, so it never reaches the
// production API. Release apps load from their own scheme or a domain.
const isDevServerPage = (page) =>
  (page?.protocol === "http:" || page?.protocol === "https:") &&
  page.port !== "" &&
  isDebugHost(page.hostname);

export const resolveAssetStoreRpcUrl = ({
  debug = false,
  page,
  override,
} = {}) => {
  const development = debug || isDevServerPage(page);
  const url = new URL(
    development ? (override ?? LOCAL_RPC_URL) : PRODUCTION_RPC_URL,
  );
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Invalid asset store endpoint.");
  }
  return url.href;
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isText = (value) => typeof value === "string" && value.length > 0;

const isByteCount = (value) => Number.isSafeInteger(value) && value >= 0;

const isTimestamp = (value) => Number.isInteger(value) && value > 0;

// A block's text runs joined, or "" when a run's text is not text, so the
// block is left out.
const runText = (runs) => {
  if (!Array.isArray(runs)) return "";
  const texts = runs.map((run) => run?.text ?? "");
  return texts.every((text) => typeof text === "string") ? texts.join("") : "";
};

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

// Rich text as plain paragraphs (`{ text }`) and images (`{ imageUrl, alt,
// width, height }`); list items keep a bullet. An image `files` does not map,
// and a malformed block or list item, are left out.
const readDescription = (blocks, fileUrls) => {
  if (!Array.isArray(blocks)) return [];
  const description = [];
  const paragraph = (text, prefix = "") => {
    if (text.trim() !== "") description.push({ text: `${prefix}${text}` });
  };
  for (const block of blocks) {
    if (block?.type === "HEADING" && typeof block.text === "string") {
      paragraph(block.text);
    }
    if (block?.type === "PARAGRAPH") paragraph(runText(block.children));
    if (block?.type === "LIST" && Array.isArray(block.items)) {
      for (const item of block.items) {
        paragraph(runText(item?.children), "• ");
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

// An image's entry may carry `variants`. With `small`, for images drawn small
// such as cards and avatars, an image maps to its `variants.width640`, at most
// 640 px wide, when it has one, and to its full-size `url` otherwise.
const readFileUrls = (files, { small = false } = {}) => {
  const urls = new Map();
  for (const file of files) {
    if (isObject(file) && isText(file.fileId) && isWebUrl(file.url)) {
      const smallUrl = file.variants?.width640;
      urls.set(file.fileId, small && isWebUrl(smallUrl) ? smallUrl : file.url);
    }
  }
  return urls;
};

// The package's media files a pack page shows, each at its own public URL:
// `{ [fileId]: url }`, by the manifest's file ids.
const readMediaFileUrls = (mediaFiles) => {
  const urls = {};
  for (const file of mediaFiles) {
    if (isObject(file) && isText(file.id) && isWebUrl(file.url)) {
      urls[file.id] = file.url;
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
// The description comes with the pack's details. The creator's avatar comes
// from `avatarUrls`, which a pack page reads small beside its large cover.
const readPack = (
  { id, data, creator: creatorData },
  fileUrls,
  avatarUrls = fileUrls,
) => {
  if (!isText(id) || !isObject(data)) {
    return undefined;
  }
  const creator = readCreator(creatorData, avatarUrls);
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

const isResolution = (value) =>
  isObject(value) &&
  isPositiveInteger(value.width) &&
  isPositiveInteger(value.height);

// A project template card carries what the template gallery shows: the title,
// summary, cover, resolution, languages, release date and creator. As with
// packs, only free templates are shown.
const readTemplateCard = ({ id, data, creator: creatorData }, fileUrls) => {
  if (!isText(id) || !isObject(data)) {
    return undefined;
  }
  const creator = readCreator(creatorData, fileUrls);
  if (
    !isText(data.title) ||
    !isResolution(data.resolution) ||
    data.pricing?.type !== "FREE" ||
    !creator
  ) {
    return undefined;
  }
  return {
    id,
    title: data.title,
    summary: typeof data.summary === "string" ? data.summary.trim() : "",
    coverUrl: fileUrls.get(data.coverFileId),
    resolution: {
      width: data.resolution.width,
      height: data.resolution.height,
    },
    languages: Array.isArray(data.languages)
      ? data.languages.filter(isText)
      : [],
    releasedAt: isTimestamp(data.listedAt) ? data.listedAt : undefined,
    creator,
  };
};

// A template's screenshots, in order, as `[{ url }]`; one whose file is not
// mapped to a usable URL is left out.
const readScreenshots = (screenshotFileIds, fileUrls) =>
  Array.isArray(screenshotFileIds)
    ? screenshotFileIds
        .map((fileId) => fileUrls.get(fileId))
        .filter(Boolean)
        .map((url) => ({ url }))
    : [];

export const createAssetStoreClient = ({
  url = resolveAssetStoreRpcUrl({
    debug: import.meta.env?.DEV === true,
    page: globalThis.location,
    override: import.meta.env?.VITE_ROUTEVN_ASSET_STORE_RPC_URL,
  }),
  fetchImpl = globalThis.fetch,
  // The device a view or a download is made on: its ID and facts.
  getDevice = async () => undefined,
  // The Creator model schema this app writes, so the store lists only the
  // project templates it can open.
  creatorModelSchema = SCHEMA_VERSION,
} = {}) => {
  const call = async (
    method,
    params,
    { notFound = packNotFound, maxBytes = MAX_RESPONSE_BYTES } = {},
  ) => {
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
      if (Number(response.headers.get("Content-Length")) > maxBytes) {
        throw new Error("Asset store response is too large.");
      }
      text = await response.text();
    } catch (error) {
      throw unavailable(error);
    } finally {
      clearTimeout(timeout);
    }
    if (text.length > maxBytes) {
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

  // This device's ID and facts, or undefined when they can't be read.
  const readDevice = async () => {
    try {
      return await getDevice();
    } catch {
      return undefined;
    }
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
      // Cards draw their cover and avatar small.
      const fileUrls = readFileUrls(result.files, { small: true });
      return {
        packs: result.items
          .filter(isObject)
          .map((item) => readPack(item, fileUrls))
          .filter(Boolean),
        nextCursor: isText(result.nextCursor) ? result.nextCursor : undefined,
      };
    },

    // A person opening the pack's page: the pack, its package's manifest
    // and the public URLs of its media files, which the page shows without
    // reading the package. The read is sent with this device's ID and facts,
    // so it counts one view of the pack; a device that can't be read leaves
    // them out, and the pack still loads.
    async getAssetPackById({ assetPackId } = {}) {
      const params = { assetPackId };
      const device = await readDevice();
      if (device) params.device = device;
      const result = await call("assetStore.getAssetPackById", params, {
        maxBytes: MAX_PACK_RESPONSE_BYTES,
      });
      if (
        !isObject(result.assetPack) ||
        !Array.isArray(result.files) ||
        !isObject(result.manifest) ||
        !Array.isArray(result.mediaFiles)
      ) {
        throw unavailable(new Error("Invalid asset pack."));
      }
      // The page draws its cover and description images large and the
      // creator's avatar small.
      const fileUrls = readFileUrls(result.files);
      const { id, data } = result.assetPack;
      const pack = readPack(
        { id, data, creator: result.creator },
        fileUrls,
        readFileUrls(result.files, { small: true }),
      );
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
      pack.manifest = result.manifest;
      pack.mediaFileUrls = readMediaFileUrls(result.mediaFiles);
      return pack;
    },

    // The pack's package ZIP, which an import reads in place with byte
    // ranges: its signed URL, which stops working at `expiresAt`, its size,
    // and where its central directory is. With `countDownload`, the read is
    // sent with this device's ID and facts and counts one download of the
    // pack; without it, as when only a fresh URL is needed, it counts none.
    async getAssetPackDownload({ assetPackId, countDownload = false } = {}) {
      const params = { assetPackId };
      if (countDownload) {
        const device = await readDevice();
        if (device) params.device = device;
      }
      const result = await call("assetStore.getAssetPackDownloadUrl", params);
      const { downloadUrl, expiresAt, size, directoryOffset, directorySize } =
        result;
      if (
        !isWebUrl(downloadUrl) ||
        !isTimestamp(expiresAt) ||
        !isByteCount(size) ||
        !isByteCount(directoryOffset) ||
        !isByteCount(directorySize) ||
        directorySize === 0 ||
        directoryOffset + directorySize > size
      ) {
        throw unavailable(new Error("Invalid asset pack download."));
      }
      return {
        url: downloadUrl,
        expiresAt,
        size,
        directoryOffset,
        directorySize,
      };
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
      // The page draws the avatar and its pack cards small.
      const fileUrls = readFileUrls(result.files, { small: true });
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

    // Project template cards, newest first. `query` matches template titles
    // and creator names; empty lists every template. Templates written with a
    // newer Creator model than this app's are left out by the store.
    async listProjectTemplates({ cursor, query } = {}) {
      const trimmedQuery = query?.trim().slice(0, MAX_QUERY_LENGTH);
      const result = await call("assetStore.listProjectTemplates", {
        query: trimmedQuery ? trimmedQuery : null,
        creatorModelSchema,
        page: { cursor: cursor ?? null, limit: PAGE_LIMIT },
      });
      if (!Array.isArray(result.items) || !Array.isArray(result.files)) {
        throw unavailable(new Error("Invalid project template list."));
      }
      const fileUrls = readFileUrls(result.files);
      return {
        templates: result.items
          .filter(isObject)
          .map((item) => readTemplateCard(item, fileUrls))
          .filter(Boolean),
        nextCursor: isText(result.nextCursor) ? result.nextCursor : undefined,
      };
    },

    // A person opening a template's page: the card fields with the rich-text
    // description, the screenshots, the version and its last update. The read
    // is sent with this device's ID and facts, so it counts one view of the
    // template; a device that can't be read leaves them out.
    async getProjectTemplateById({ projectTemplateId } = {}) {
      const params = { projectTemplateId };
      const device = await readDevice();
      if (device) params.device = device;
      const result = await call("assetStore.getProjectTemplateById", params, {
        notFound: templateNotFound,
      });
      if (!isObject(result.projectTemplate) || !Array.isArray(result.files)) {
        throw unavailable(new Error("Invalid project template."));
      }
      const fileUrls = readFileUrls(result.files);
      const { id, data } = result.projectTemplate;
      const template = readTemplateCard(
        { id, data, creator: result.creator },
        fileUrls,
      );
      if (!template) throw templateNotFound();
      template.description = readDescription(data.description, fileUrls);
      template.screenshots = readScreenshots(data.screenshotFileIds, fileUrls);
      template.versionName = isText(data.versionName)
        ? data.versionName
        : undefined;
      template.releaseNotes =
        typeof data.releaseNotes === "string" ? data.releaseNotes.trim() : "";
      template.updatedAt = isTimestamp(data.lastUpdatedAt)
        ? data.lastUpdatedAt
        : undefined;
      return template;
    },

    // The signed URL of a template's package ZIP, which a project is created
    // from, as `getAssetPackDownload` gives a pack's. With `countDownload`,
    // set when creation starts, it counts one download of the template.
    async getProjectTemplateDownload({
      projectTemplateId,
      countDownload = false,
    } = {}) {
      const params = { projectTemplateId };
      if (countDownload) {
        const device = await readDevice();
        if (device) params.device = device;
      }
      const result = await call(
        "assetStore.getProjectTemplateDownloadUrl",
        params,
        { notFound: templateNotFound },
      );
      const { downloadUrl, expiresAt, size, directoryOffset, directorySize } =
        result;
      if (
        !isWebUrl(downloadUrl) ||
        !isTimestamp(expiresAt) ||
        !isByteCount(size) ||
        !isByteCount(directoryOffset) ||
        !isByteCount(directorySize) ||
        directorySize === 0 ||
        directoryOffset + directorySize > size
      ) {
        throw unavailable(new Error("Invalid project template download."));
      }
      return {
        url: downloadUrl,
        expiresAt,
        size,
        directoryOffset,
        directorySize,
      };
    },
  };
};
