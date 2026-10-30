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

// Where a pack's published package is: its ZIP's file, size and directory.
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

const createClient = (respond) => {
  const fetchImpl = vi.fn(async (_url, request) =>
    respond(JSON.parse(request.body)),
  );
  return {
    fetchImpl,
    client: createAssetStoreClient({ url: RPC_URL, fetchImpl }),
  };
};

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

  it("returns a pack with its published package's location", async () => {
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
      package: {
        url: "https://files.example/FiPackPackage001",
        size: 40_234_531,
        directoryOffset: 40_228_607,
        directorySize: 5902,
      },
      releaseNotes: "",
      creator: { name: "Creator One" },
    });
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

  it("treats a pack without a readable package as unavailable", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          assetPack: {
            id: "AsPkPackOne00001",
            data: {
              ...packItem("AsPkPackOne00001").data,
              package: { ...packagePlace, directoryOffset: 40_234_000 },
            },
          },
          creator,
          files,
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
});
