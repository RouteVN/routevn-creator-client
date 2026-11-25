import { describe, expect, it, vi } from "vitest";
import {
  createAssetStoreClient,
  resolveAssetStoreRpcUrl,
} from "../../src/deps/clients/assetStoreClient.js";

const RPC_URL = "http://127.0.0.1:3100/asset-store/rpc";

const creator = {
  id: "Cr8rCreatorOne01",
  name: "Creator One",
  avatarFileId: "FiCreatorAvatar1",
};

const packItem = (id, overrides = {}) => ({
  id,
  data: {
    title: `Pack ${id}`,
    summary: "Hand-drawn forest backgrounds.",
    coverFileId: "FiPackCover00001",
    pricing: { type: "FREE" },
    assetCounts: { IMAGES: 40, SOUNDS: 2 },
    listedAt: 1786492800000,
    ...overrides,
  },
  creator,
});

// A pack's counts as the client gives them: by type in the app's order,
// with their total.
const packCounts = {
  assetCounts: [
    { assetType: "IMAGES", count: 40 },
    { assetType: "SOUNDS", count: 2 },
  ],
  assetCount: 42,
};

const files = [
  { fileId: "FiPackCover00001", url: "https://files.example/FiPackCover00001" },
  { fileId: "FiCreatorAvatar1", url: "https://files.example/FiCreatorAvatar1" },
  { fileId: "FiPackPackage001", url: "https://files.example/FiPackPackage001" },
];

// A pack's package manifest, as the pack's details carry it.
const manifest = {
  schema: "routevn.import-pack.v3",
  package: { kind: "routevn.creator.asset-package", name: "Pack One" },
  repository: {
    files: {
      items: {
        forest: {
          id: "forest",
          mimeType: "image/png",
          source: { url: "./files/forest" },
        },
        theme: {
          id: "theme",
          mimeType: "audio/mpeg",
          source: { url: "./files/theme" },
        },
      },
    },
  },
};

// The package's media files, each at its own public URL.
const mediaFiles = [
  { id: "forest", url: "https://files.example/FiPackPackage001/forest" },
  { id: "theme", url: "https://files.example/FiPackPackage001/theme" },
];

// Where a pack's published package is: its ZIP's file, size and directory.
// The API still sends it for older apps; this one never reads it.
const packagePlace = {
  fileId: "FiPackPackage001",
  size: 40_234_531,
  directoryOffset: 40_228_607,
  directorySize: 5902,
};

const rpcResponse = (body, init) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

const createClient = (respond, { getDevice } = {}) => {
  const fetchImpl = vi.fn(async (_url, request) =>
    respond(JSON.parse(request.body)),
  );
  return {
    fetchImpl,
    client: createAssetStoreClient({ url: RPC_URL, fetchImpl, getDevice }),
  };
};

// What the app says of the device a view is made on: its ID and facts.
const device = {
  id: "123456789ABC123456789ABC",
  language: "ja",
  uiLanguage: "en",
  os: "windows",
  formFactor: "desktop",
  client: "desktopApp",
  channel: "direct",
  app: "routevn-creator",
  appVersion: "1.22.1",
};

const packResponse = () =>
  rpcResponse({
    jsonrpc: "2.0",
    id: 1,
    result: {
      assetPack: {
        id: "AsPkPackOne00001",
        data: {
          ...packItem("AsPkPackOne00001").data,
          package: packagePlace,
        },
      },
      creator,
      files,
      manifest,
      mediaFiles,
    },
  });

// The package's signed URL and place, as an import asks for them.
const signedPackageUrl =
  "https://uploads.example/objects/FiPackPackage001?X-Amz-Signature=abc";
const downloadResponse = (change = {}) =>
  rpcResponse({
    jsonrpc: "2.0",
    id: 1,
    result: {
      versionName: "1.0.0",
      downloadUrl: signedPackageUrl,
      expiresAt: 1786579800000,
      size: 40_234_531,
      directoryOffset: 40_228_607,
      directorySize: 5902,
      ...change,
    },
  });

const sentParams = (fetchImpl) =>
  fetchImpl.mock.calls.map(([, request]) => JSON.parse(request.body).params);

describe("assetStoreClient", () => {
  it("uses the production API in release builds and a local API in development", () => {
    expect(resolveAssetStoreRpcUrl()).toBe(
      "https://api1.routevn.com/asset-store/rpc",
    );
    expect(resolveAssetStoreRpcUrl({ debug: true })).toBe(RPC_URL);
    expect(
      resolveAssetStoreRpcUrl({
        debug: true,
        override: "http://localhost:3000/asset-store/rpc",
      }),
    ).toBe("http://localhost:3000/asset-store/rpc");
    expect(
      resolveAssetStoreRpcUrl({
        override: "http://localhost:3000/asset-store/rpc",
      }),
    ).toBe("https://api1.routevn.com/asset-store/rpc");
  });

  it("never uses the production API from a page on a dev server", () => {
    for (const page of [
      "http://localhost:3001/project/images",
      "http://127.0.0.1:3001/",
      "http://192.168.1.20:3001/",
    ]) {
      expect(resolveAssetStoreRpcUrl({ page: new URL(page) })).toBe(RPC_URL);
      expect(
        resolveAssetStoreRpcUrl({
          page: new URL(page),
          override: "http://127.0.0.1:3000/asset-store/rpc",
        }),
      ).toBe("http://127.0.0.1:3000/asset-store/rpc");
    }
    // Release apps load from their own scheme or a domain.
    for (const page of [
      "tauri://localhost/project/images",
      "http://tauri.localhost/",
      "https://creator.example.com/",
    ]) {
      expect(resolveAssetStoreRpcUrl({ page: new URL(page) })).toBe(
        "https://api1.routevn.com/asset-store/rpc",
      );
    }
  });

  it("lists free packs as JSON-RPC with the RPC header", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          items: [
            {
              // Counts come in any order; types the app does not know and
              // counts that are not positive are left out.
              ...packItem("AsPkPackOne00001", {
                assetCounts: { SOUNDS: 2, LATER_TYPE: 9, IMAGES: 40, FONTS: 0 },
              }),
            },
          ],
          files,
          nextCursor: "cursor-2",
        },
      }),
    );

    const page = await client.listAssetPacks({ cursor: "cursor-1" });

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe(RPC_URL);
    expect(request).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RouteVN-RPC": "1" },
      credentials: "omit",
      cache: "no-store",
    });
    expect(JSON.parse(request.body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "assetStore.listAssetPacks",
      params: {
        query: null,
        pricingType: "FREE",
        assetTypes: null,
        page: { cursor: "cursor-1", limit: 20 },
      },
    });
    expect(page).toEqual({
      packs: [
        {
          id: "AsPkPackOne00001",
          title: "Pack AsPkPackOne00001",
          summary: "Hand-drawn forest backgrounds.",
          ...packCounts,
          coverUrl: "https://files.example/FiPackCover00001",
          releasedAt: 1786492800000,
          creator: {
            id: "Cr8rCreatorOne01",
            name: "Creator One",
            avatarUrl: "https://files.example/FiCreatorAvatar1",
          },
        },
      ],
      nextCursor: "cursor-2",
    });
  });

  it("asks for the first page and ends the list on a null cursor", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { items: [], files: [], nextCursor: null },
      }),
    );

    const page = await client.listAssetPacks();

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params.page).toEqual({
      cursor: null,
      limit: 20,
    });
    expect(page).toEqual({ packs: [], nextCursor: undefined });
  });

  it("sends a trimmed search query of at most 100 characters", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { items: [], files: [], nextCursor: null },
      }),
    );
    const sentQuery = (call) =>
      JSON.parse(fetchImpl.mock.calls[call][1].body).params.query;

    await client.listAssetPacks({ query: "  transition  " });
    await client.listAssetPacks({ query: "   " });
    await client.listAssetPacks({ query: "x".repeat(150) });

    expect(sentQuery(0)).toBe("transition");
    expect(sentQuery(1)).toBeNull();
    expect(sentQuery(2)).toBe("x".repeat(100));
  });

  it("sends the chosen asset types", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { items: [], files: [], nextCursor: null },
      }),
    );
    const sentAssetTypes = (call) =>
      JSON.parse(fetchImpl.mock.calls[call][1].body).params.assetTypes;

    await client.listAssetPacks({ assetTypes: ["IMAGES", "SOUNDS"] });
    await client.listAssetPacks({ assetTypes: [] });

    expect(sentAssetTypes(0)).toEqual(["IMAGES", "SOUNDS"]);
    expect(sentAssetTypes(1)).toBeNull();
  });

  it("drops paid and malformed packs and images without a usable URL", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          items: [
            packItem("AsPkPaidPack0001", {
              pricing: { type: "PAID", amountMinor: 499, currency: "USD" },
            }),
            packItem("AsPkNoTitle00001", { title: "" }),
            packItem("AsPkNoCounts0001", { assetCounts: [40] }),
            { id: "AsPkNoCreator001", data: packItem("x").data },
            "not a pack",
            // An invalid summary leaves the card without one.
            {
              ...packItem("AsPkNoCover00001", {
                coverFileId: null,
                summary: 42,
              }),
            },
          ],
          files: [
            { fileId: "FiCreatorAvatar1", url: "javascript:alert(1)" },
            { fileId: "FiPackCover00001", url: "ftp://files.example/cover" },
          ],
          nextCursor: null,
        },
      }),
    );

    const { packs } = await client.listAssetPacks();

    expect(packs).toEqual([
      {
        id: "AsPkNoCover00001",
        title: "Pack AsPkNoCover00001",
        summary: "",
        ...packCounts,
        coverUrl: undefined,
        releasedAt: 1786492800000,
        creator: { id: creator.id, name: creator.name, avatarUrl: undefined },
      },
    ]);
  });

  it("returns a pack with its package's manifest and media URLs, and not its package", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          assetPack: {
            id: "AsPkPackOne00001",
            data: {
              ...packItem("AsPkPackOne00001").data,
              package: packagePlace,
            },
          },
          creator,
          files,
          manifest,
          mediaFiles: [
            ...mediaFiles,
            { id: "noUrl", url: "file:///etc/passwd" },
            { url: "https://files.example/no-id" },
            null,
          ],
        },
      }),
    );

    const pack = await client.getAssetPackById({
      assetPackId: "AsPkPackOne00001",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      method: "assetStore.getAssetPackById",
      params: { assetPackId: "AsPkPackOne00001" },
    });
    expect(pack).toMatchObject({
      id: "AsPkPackOne00001",
      summary: "Hand-drawn forest backgrounds.",
      manifest,
      mediaFileUrls: {
        forest: "https://files.example/FiPackPackage001/forest",
        theme: "https://files.example/FiPackPackage001/theme",
      },
      releaseNotes: "",
      creator: { name: "Creator One" },
    });
    expect(pack).not.toHaveProperty("package");
  });

  it("reads a pack's details of more than 1 MiB, up to 4 MiB", async () => {
    const declaring = (bytes) => () =>
      new Response(packResponse().body, {
        headers: { "content-length": String(bytes) },
      });

    await expect(
      createClient(declaring(3 * 1024 * 1024)).client.getAssetPackById({
        assetPackId: "AsPkPackOne00001",
      }),
    ).resolves.toMatchObject({ id: "AsPkPackOne00001" });
    await expect(
      createClient(declaring(5 * 1024 * 1024)).client.getAssetPackById({
        assetPackId: "AsPkPackOne00001",
      }),
    ).rejects.toMatchObject({ code: "asset_store_unavailable" });
  });

  it("reads the pack page details from the pack", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          assetPack: {
            id: "AsPkPackOne00001",
            data: {
              ...packItem("AsPkPackOne00001").data,
              package: packagePlace,
              versionName: "1.0.0",
              releaseNotes: "  Adds masks.\nFixes fades.\n",
              lastUpdatedAt: 1786579200000,
              description: [
                { type: "HEADING", text: "About" },
                {
                  type: "PARAGRAPH",
                  children: [
                    { text: "Smooth ", marks: [], link: null },
                    { text: "transitions.", marks: ["BOLD"], link: null },
                  ],
                },
                {
                  type: "PARAGRAPH",
                  children: [{ text: "  ", marks: [], link: null }],
                },
                {
                  type: "LIST",
                  items: [
                    { children: [{ text: "Masks", marks: [], link: null }] },
                  ],
                },
                {
                  type: "IMAGE",
                  fileId: "FiPackCover00001",
                  alt: "",
                  width: 1,
                  height: 1,
                },
                {
                  type: "IMAGE",
                  fileId: "FiPackShotMissin",
                  alt: "Missing",
                  width: 1,
                  height: 1,
                },
              ],
            },
          },
          creator,
          files,
          manifest,
          mediaFiles,
        },
      }),
    );

    const pack = await client.getAssetPackById({
      assetPackId: "AsPkPackOne00001",
    });

    // The description keeps its order without the image `files` does not
    // map.
    expect(pack).not.toHaveProperty("screenshotUrls");
    expect(pack).toMatchObject({
      description: [
        { text: "About" },
        { text: "Smooth transitions." },
        { text: "• Masks" },
        {
          imageUrl: "https://files.example/FiPackCover00001",
          alt: "",
          width: 1,
          height: 1,
        },
      ],
      versionName: "1.0.0",
      releaseNotes: "Adds masks.\nFixes fades.",
      releasedAt: 1786492800000,
      updatedAt: 1786579200000,
    });
  });

  it("leaves out malformed description blocks instead of failing the pack page", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          assetPack: {
            id: "AsPkPackOne00001",
            data: {
              ...packItem("AsPkPackOne00001").data,
              package: packagePlace,
              description: [
                { type: "HEADING", text: 42 },
                { type: "HEADING", text: { value: "About" } },
                { type: "HEADING", text: "About" },
                null,
                { type: "PARAGRAPH", children: "Smooth transitions." },
                { type: "PARAGRAPH", children: [{ text: ["Bad"] }] },
                {
                  type: "PARAGRAPH",
                  children: [{ text: "Smooth " }, { marks: [] }, { text: "!" }],
                },
                {
                  type: "LIST",
                  items: [
                    { children: [{ text: 7 }] },
                    null,
                    { children: [{ text: "Masks" }] },
                  ],
                },
                { type: "IMAGE", fileId: "FiPackCover00001", width: "1" },
              ],
            },
          },
          creator,
          files,
          manifest,
          mediaFiles,
        },
      }),
    );

    const pack = await client.getAssetPackById({
      assetPackId: "AsPkPackOne00001",
    });

    expect(pack.description).toEqual([
      { text: "About" },
      { text: "Smooth !" },
      { text: "• Masks" },
    ]);
  });

  it("reads a creator's profile and free packs in one request", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          creator: {
            id: "Cr8rCreatorOne01",
            data: {
              schemaVersion: 1,
              status: "PUBLISHED",
              name: "Creator One",
              handle: null,
              description: "Makes transitions.\n\n  Free to use.  ",
              avatarFileId: "FiCreatorAvatar1",
              links: [
                { label: "X", url: "https://x.example/creator" },
                { label: "Plain", url: "http://insecure.example" },
                { label: "Script", url: "javascript:alert(1)" },
              ],
            },
          },
          // Packs carry card data and no creator of their own.
          assetPacks: [
            { id: "AsPkPackTwo00001", data: packItem("AsPkPackTwo00001").data },
            {
              id: "AsPkPaidPack0001",
              data: packItem("AsPkPaidPack0001", {
                pricing: { type: "PAID", amountMinor: 499, currency: "USD" },
              }).data,
            },
            {
              id: "AsPkPackOne00001",
              data: packItem("AsPkPackOne00001", {
                coverFileId: null,
                summary: "  Padded summary.  ",
              }).data,
            },
            "not a pack",
          ],
          files,
        },
      }),
    );

    const page = await client.getCreatorById({
      creatorId: "Cr8rCreatorOne01",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      method: "assetStore.getCreatorById",
      params: { creatorId: "Cr8rCreatorOne01" },
    });
    const packCreator = {
      id: "Cr8rCreatorOne01",
      name: "Creator One",
      avatarUrl: "https://files.example/FiCreatorAvatar1",
    };
    expect(page).toEqual({
      creator: {
        ...packCreator,
        description: ["Makes transitions.", "Free to use."],
        links: [{ label: "X", url: "https://x.example/creator" }],
      },
      packs: [
        {
          id: "AsPkPackTwo00001",
          title: "Pack AsPkPackTwo00001",
          summary: "Hand-drawn forest backgrounds.",
          ...packCounts,
          coverUrl: "https://files.example/FiPackCover00001",
          releasedAt: 1786492800000,
          creator: packCreator,
        },
        {
          id: "AsPkPackOne00001",
          title: "Pack AsPkPackOne00001",
          summary: "Padded summary.",
          ...packCounts,
          coverUrl: undefined,
          releasedAt: 1786492800000,
          creator: packCreator,
        },
      ],
    });
  });

  it("reads a creator with no free packs as having none", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          creator: { id: "Cr8rCreatorOne01", data: { name: "Creator One" } },
          assetPacks: [
            {
              id: "AsPkPaidPack0001",
              data: packItem("AsPkPaidPack0001", {
                pricing: { type: "PAID", amountMinor: 499, currency: "USD" },
              }).data,
            },
          ],
          files: [],
        },
      }),
    );

    const page = await client.getCreatorById({
      creatorId: "Cr8rCreatorOne01",
    });

    expect(page).toEqual({
      creator: {
        id: "Cr8rCreatorOne01",
        name: "Creator One",
        avatarUrl: undefined,
        description: [],
        links: [],
      },
      packs: [],
    });
  });

  it("reports a creator response without its packs as an unavailable store", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          creator: { id: "Cr8rCreatorOne01", data: { name: "Creator One" } },
          files: [],
        },
      }),
    );

    await expect(
      client.getCreatorById({ creatorId: "Cr8rCreatorOne01" }),
    ).rejects.toMatchObject({ code: "asset_store_unavailable" });
  });

  it("reports a missing creator with its own code", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32000,
          message: "Domain error",
          data: {
            code: "RESOURCE_NOT_FOUND",
            details: { resourceType: "CREATOR" },
          },
        },
      }),
    );

    await expect(
      client.getCreatorById({ creatorId: "Cr8rMissing00001" }),
    ).rejects.toMatchObject({ code: "asset_creator_not_found" });
  });

  it("sends the device's ID and facts with each read of a pack, which counts one view", async () => {
    const getDevice = vi.fn(async () => device);
    const { client, fetchImpl } = createClient(packResponse, { getDevice });

    const viewed = await client.getAssetPackById({
      assetPackId: "AsPkPackOne00001",
    });

    expect(sentParams(fetchImpl)).toEqual([
      { assetPackId: "AsPkPackOne00001", device },
    ]);
    expect(viewed).toMatchObject({ id: "AsPkPackOne00001", manifest });
  });

  it("sends no device on the pack list or a creator's page", async () => {
    const getDevice = vi.fn(async () => device);
    const { client, fetchImpl } = createClient(
      () =>
        rpcResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            items: [],
            files: [],
            nextCursor: null,
            creator: {
              id: "Cr8rCreatorOne01",
              data: { name: "Creator One" },
            },
            assetPacks: [],
          },
        }),
      { getDevice },
    );

    await client.listAssetPacks();
    await client.getCreatorById({ creatorId: "Cr8rCreatorOne01" });

    for (const params of sentParams(fetchImpl)) {
      expect(params).not.toHaveProperty("device");
    }
    expect(getDevice).not.toHaveBeenCalled();
  });

  it("still reads the pack, without a device, when the device can't be read", async () => {
    const { client, fetchImpl } = createClient(packResponse, {
      getDevice: vi.fn(async () => {
        throw new Error("Database unavailable");
      }),
    });

    const pack = await client.getAssetPackById({
      assetPackId: "AsPkPackOne00001",
    });

    expect(sentParams(fetchImpl)).toEqual([
      { assetPackId: "AsPkPackOne00001" },
    ]);
    expect(pack).toMatchObject({ id: "AsPkPackOne00001" });
  });

  it("asks for the package's signed URL without the device, counting no download", async () => {
    const getDevice = vi.fn(async () => device);
    const { client, fetchImpl } = createClient(downloadResponse, {
      getDevice,
    });

    const download = await client.getAssetPackDownload({
      assetPackId: "AsPkPackOne00001",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      method: "assetStore.getAssetPackDownloadUrl",
      params: { assetPackId: "AsPkPackOne00001" },
    });
    expect(sentParams(fetchImpl)).toEqual([
      { assetPackId: "AsPkPackOne00001" },
    ]);
    expect(getDevice).not.toHaveBeenCalled();
    expect(download).toEqual({
      url: signedPackageUrl,
      expiresAt: 1786579800000,
      size: 40_234_531,
      directoryOffset: 40_228_607,
      directorySize: 5902,
    });
  });

  it("sends the device's ID and facts when an import starts, which counts one download", async () => {
    const { client, fetchImpl } = createClient(downloadResponse, {
      getDevice: vi.fn(async () => device),
    });

    await client.getAssetPackDownload({
      assetPackId: "AsPkPackOne00001",
      countDownload: true,
    });

    expect(sentParams(fetchImpl)).toEqual([
      { assetPackId: "AsPkPackOne00001", device },
    ]);
  });

  it("still asks for the package, without a device, when the device can't be read", async () => {
    const { client, fetchImpl } = createClient(downloadResponse, {
      getDevice: vi.fn(async () => {
        throw new Error("Database unavailable");
      }),
    });

    await expect(
      client.getAssetPackDownload({
        assetPackId: "AsPkPackOne00001",
        countDownload: true,
      }),
    ).resolves.toMatchObject({ url: signedPackageUrl });
    expect(sentParams(fetchImpl)).toEqual([
      { assetPackId: "AsPkPackOne00001" },
    ]);
  });

  it.each([
    ["no URL", { downloadUrl: undefined }],
    ["a URL that is not on the web", { downloadUrl: "file:///package.zip" }],
    ["no expiry", { expiresAt: undefined }],
    ["a directory past its end", { directoryOffset: 40_234_000 }],
    ["an empty directory", { directorySize: 0 }],
  ])(
    "treats a package download with %s as unavailable",
    async (_name, change) => {
      const { client } = createClient(() => downloadResponse(change));

      await expect(
        client.getAssetPackDownload({ assetPackId: "AsPkPackOne00001" }),
      ).rejects.toMatchObject({ code: "asset_store_unavailable" });
    },
  );

  it("reports a pack no longer listed as missing when its package is asked for", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32000,
          message: "Domain error",
          data: {
            code: "RESOURCE_NOT_FOUND",
            details: { resourceType: "ASSET_PACK" },
          },
        },
      }),
    );

    await expect(
      client.getAssetPackDownload({ assetPackId: "AsPkMissing00001" }),
    ).rejects.toMatchObject({ code: "asset_pack_not_found" });
  });

  it("reports a failed view like any failed read of the pack", async () => {
    const { client } = createClient(() => new Response("", { status: 503 }), {
      getDevice: async () => device,
    });

    await expect(
      client.getAssetPackById({ assetPackId: "AsPkPackOne00001" }),
    ).rejects.toMatchObject({ code: "asset_store_unavailable" });
  });

  it("reports a missing pack separately from an unavailable store", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32000,
          message: "Domain error",
          data: {
            code: "RESOURCE_NOT_FOUND",
            details: { resourceType: "ASSET_PACK" },
          },
        },
      }),
    );

    await expect(
      client.getAssetPackById({ assetPackId: "AsPkMissing00001" }),
    ).rejects.toMatchObject({ code: "asset_pack_not_found" });
  });

  it.each([
    ["its manifest", { manifest: undefined }],
    ["its media files", { mediaFiles: undefined }],
  ])("treats a pack without %s as unavailable", async (_name, change) => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          assetPack: {
            id: "AsPkPackOne00001",
            data: packItem("AsPkPackOne00001").data,
          },
          creator,
          files,
          manifest,
          mediaFiles,
          ...change,
        },
      }),
    );

    await expect(
      client.getAssetPackById({ assetPackId: "AsPkPackOne00001" }),
    ).rejects.toMatchObject({ code: "asset_store_unavailable" });
  });

  it("treats a pack it may not show as missing", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          assetPack: {
            id: "AsPkPaidPack0001",
            data: {
              ...packItem("AsPkPaidPack0001").data,
              pricing: { type: "PAID", amountMinor: 499, currency: "USD" },
              package: packagePlace,
            },
          },
          creator,
          files,
          manifest,
          mediaFiles,
        },
      }),
    );

    await expect(
      client.getAssetPackById({ assetPackId: "AsPkPaidPack0001" }),
    ).rejects.toMatchObject({ code: "asset_pack_not_found" });
  });

  it.each([
    ["an HTTP error", () => new Response("", { status: 503 })],
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
    ["invalid JSON", () => new Response("{")],
    [
      "an RPC error",
      () =>
        rpcResponse({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32602, message: "Invalid params" },
        }),
    ],
    [
      "an unexpected result",
      () => rpcResponse({ jsonrpc: "2.0", id: 1, result: { items: "none" } }),
    ],
    [
      "an oversized response",
      () =>
        new Response("{}", {
          headers: { "content-length": String(2 * 1024 * 1024) },
        }),
    ],
  ])("reports %s as an unavailable store", async (_name, respond) => {
    const { client } = createClient(respond);

    await expect(client.listAssetPacks()).rejects.toMatchObject({
      name: "AssetStoreError",
      code: "asset_store_unavailable",
    });
  });

  describe("image sizes", () => {
    const small = (fileId) => `https://files.example/${fileId}/640`;
    const large = (fileId) => `https://files.example/${fileId}/1920`;
    // An image's entry with its variants, copies at most 640 and 1920 px
    // wide; its `url` is the 1920 px copy.
    const imageWithVariants = (fileId) => ({
      fileId,
      url: large(fileId),
      variants: { width640: small(fileId), width1920: large(fileId) },
    });
    const variantFiles = [
      imageWithVariants("FiPackCover00001"),
      imageWithVariants("FiCreatorAvatar1"),
      imageWithVariants("FiPackShot000001"),
    ];
    const listResponse = (items, listFiles) => () =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { items, files: listFiles, nextCursor: null },
      });
    const packDetailsResponse =
      ({ data = {}, packFiles = variantFiles, packMediaFiles = mediaFiles }) =>
      () =>
        rpcResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            assetPack: {
              id: "AsPkPackOne00001",
              data: {
                ...packItem("AsPkPackOne00001").data,
                package: packagePlace,
                ...data,
              },
            },
            creator,
            files: packFiles,
            manifest,
            mediaFiles: packMediaFiles,
          },
        });
    const creatorResponse = (avatarFileId) => () =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          creator: {
            id: "Cr8rCreatorOne01",
            data: { name: "Creator One", avatarFileId },
          },
          assetPacks: [
            { id: "AsPkPackOne00001", data: packItem("AsPkPackOne00001").data },
          ],
          files: variantFiles,
        },
      });

    it("draws card covers and avatars from their 640 px variant, and the full image when an entry has none", async () => {
      const { client } = createClient(
        listResponse(
          [
            packItem("AsPkPackOne00001"),
            packItem("AsPkPackTwo00001", { coverFileId: "FiPackCover00002" }),
          ],
          [
            ...variantFiles,
            {
              fileId: "FiPackCover00002",
              url: "https://files.example/FiPackCover00002",
            },
          ],
        ),
      );

      const { packs } = await client.listAssetPacks();

      expect(
        packs.map(({ coverUrl, creator }) => [coverUrl, creator.avatarUrl]),
      ).toEqual([
        [small("FiPackCover00001"), small("FiCreatorAvatar1")],
        ["https://files.example/FiPackCover00002", small("FiCreatorAvatar1")],
      ]);
    });

    it.each([
      ["null variants", null],
      [
        "variants without a 640 px copy",
        { width1920: "https://files.example/x" },
      ],
      [
        "a 640 px copy that is not a web URL",
        { width640: "javascript:alert(1)" },
      ],
      ["variants that are not an object", "width640"],
    ])(
      "draws a card's full image when its entry has %s",
      async (_name, variants) => {
        const cover = {
          fileId: "FiPackCover00001",
          url: large("FiPackCover00001"),
          variants,
        };
        const { client } = createClient(
          listResponse([packItem("AsPkPackOne00001")], [cover]),
        );

        const { packs } = await client.listAssetPacks();

        expect(packs[0].coverUrl).toBe(large("FiPackCover00001"));
      },
    );

    it("draws a pack page's cover and description images full size and its creator's avatar small", async () => {
      const { client } = createClient(
        packDetailsResponse({
          data: {
            description: [
              {
                type: "IMAGE",
                fileId: "FiPackShot000001",
                alt: "A diagram",
                width: 1920,
                height: 1080,
              },
            ],
          },
        }),
      );

      const pack = await client.getAssetPackById({
        assetPackId: "AsPkPackOne00001",
      });

      expect(pack.coverUrl).toBe(large("FiPackCover00001"));
      expect(pack.description).toEqual([
        {
          imageUrl: large("FiPackShot000001"),
          alt: "A diagram",
          width: 1920,
          height: 1080,
        },
      ]);
      expect(pack.creator.avatarUrl).toBe(small("FiCreatorAvatar1"));
    });

    it("reads the package's manifest and media files the same whatever `files` carries", async () => {
      // A media file is read by its `url` alone.
      const packMediaFiles = [
        {
          ...mediaFiles[0],
          variants: { width640: "https://files.example/forest/640" },
        },
        mediaFiles[1],
      ];
      const readPackContents = async (packFiles) => {
        const { client } = createClient(
          packDetailsResponse({ packFiles, packMediaFiles }),
        );
        const pack = await client.getAssetPackById({
          assetPackId: "AsPkPackOne00001",
        });
        return { manifest: pack.manifest, mediaFileUrls: pack.mediaFileUrls };
      };

      const withVariants = await readPackContents(variantFiles);

      expect(withVariants).toEqual({
        manifest,
        mediaFileUrls: {
          forest: "https://files.example/FiPackPackage001/forest",
          theme: "https://files.example/FiPackPackage001/theme",
        },
      });
      expect(withVariants).toEqual(await readPackContents(files));
    });

    it("draws a creator page's avatar and pack covers small", async () => {
      const { client } = createClient(creatorResponse("FiCreatorAvatar1"));

      const page = await client.getCreatorById({
        creatorId: "Cr8rCreatorOne01",
      });

      expect(page.creator.avatarUrl).toBe(small("FiCreatorAvatar1"));
      expect(page.packs[0].coverUrl).toBe(small("FiPackCover00001"));
      expect(page.packs[0].creator.avatarUrl).toBe(small("FiCreatorAvatar1"));
    });

    it("leaves out an image whose ID is null, absent or not in `files`", async () => {
      const noAvatar = { id: creator.id, name: creator.name };
      const list = createClient(
        listResponse(
          [
            {
              ...packItem("AsPkPackOne00001", { coverFileId: null }),
              creator: noAvatar,
            },
            packItem("AsPkPackTwo00001", { coverFileId: "FiPackCoverGone1" }),
          ],
          variantFiles,
        ),
      ).client;
      const details = createClient(
        packDetailsResponse({
          data: {
            coverFileId: null,
            description: [
              { type: "PARAGRAPH", children: [{ text: "About" }] },
              {
                type: "IMAGE",
                fileId: "FiPackShotGone01",
                width: 1,
                height: 1,
              },
            ],
          },
        }),
      ).client;
      const creatorPage = createClient(creatorResponse(null)).client;

      const { packs } = await list.listAssetPacks();
      const pack = await details.getAssetPackById({
        assetPackId: "AsPkPackOne00001",
      });
      const page = await creatorPage.getCreatorById({
        creatorId: "Cr8rCreatorOne01",
      });

      expect(packs[0].coverUrl).toBeUndefined();
      expect(packs[0].creator.avatarUrl).toBeUndefined();
      expect(packs[1].coverUrl).toBeUndefined();
      expect(pack.coverUrl).toBeUndefined();
      expect(pack.description).toEqual([{ text: "About" }]);
      expect(page.creator.avatarUrl).toBeUndefined();
      expect(page.packs[0].creator.avatarUrl).toBeUndefined();
    });
  });
});
