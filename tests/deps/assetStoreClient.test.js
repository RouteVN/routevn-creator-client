import { describe, expect, it, vi } from "vitest";
import {
  createAssetStoreClient,
  resolveAssetStoreRpcUrl,
} from "../../src/deps/clients/assetStoreClient.js";

const RPC_URL = "http://127.0.0.1:3100/reader/rpc";

const author = {
  id: "Cr8rAuthorOne001",
  name: "Author One",
  avatarFileId: "FiAuthorAvatar01",
};

const packItem = (id, overrides = {}) => ({
  id,
  data: {
    title: `Pack ${id}`,
    coverFileId: "FiPackCover00001",
    pricing: { type: "FREE" },
    assetCount: 42,
    listedAt: 1786492800000,
    ...overrides,
  },
  author,
});

const files = [
  { fileId: "FiPackCover00001", url: "https://files.example/FiPackCover00001" },
  { fileId: "FiAuthorAvatar01", url: "https://files.example/FiAuthorAvatar01" },
  { fileId: "FiPackManifest01", url: "https://files.example/FiPackManifest01" },
];

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
      "https://api1.routevn.com/reader/rpc",
    );
    expect(resolveAssetStoreRpcUrl({ debug: true })).toBe(RPC_URL);
    expect(
      resolveAssetStoreRpcUrl({
        debug: true,
        override: "http://localhost:3000/reader/rpc",
      }),
    ).toBe("http://localhost:3000/reader/rpc");
    expect(
      resolveAssetStoreRpcUrl({
        override: "http://localhost:3000/reader/rpc",
      }),
    ).toBe("https://api1.routevn.com/reader/rpc");
  });

  it("lists free packs as JSON-RPC with the reader headers", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          items: [
            packItem("AsPkPackOne00001", {
              description: [
                {
                  type: "PARAGRAPH",
                  children: [
                    { text: "Smooth transitions.", marks: [], link: null },
                  ],
                },
              ],
              screenshotFileIds: ["FiPackShot000001"],
            }),
          ],
          files: [
            ...files,
            {
              fileId: "FiPackShot000001",
              url: "https://files.example/FiPackShot000001",
            },
          ],
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
      method: "reader.listAssetPacks",
      params: {
        query: null,
        authorId: null,
        pricingType: "FREE",
        tags: null,
        page: { cursor: "cursor-1", limit: 20 },
      },
    });
    expect(page).toEqual({
      packs: [
        {
          id: "AsPkPackOne00001",
          title: "Pack AsPkPackOne00001",
          assetCount: 42,
          coverUrl: "https://files.example/FiPackCover00001",
          // Cards carry these so a pack page can show them at once.
          description: ["Smooth transitions."],
          screenshotUrls: ["https://files.example/FiPackShot000001"],
          releasedAt: 1786492800000,
          author: {
            id: "Cr8rAuthorOne001",
            name: "Author One",
            avatarUrl: "https://files.example/FiAuthorAvatar01",
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

  it("sends the chosen tags", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { items: [], files: [], nextCursor: null },
      }),
    );
    const sentTags = (call) =>
      JSON.parse(fetchImpl.mock.calls[call][1].body).params.tags;

    await client.listAssetPacks({ tags: ["IMAGES", "SOUNDS"] });
    await client.listAssetPacks({ tags: [] });

    expect(sentTags(0)).toEqual(["IMAGES", "SOUNDS"]);
    expect(sentTags(1)).toBeNull();
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
            { id: "AsPkNoAuthor0001", data: packItem("x").data },
            "not a pack",
            packItem("AsPkNoCover00001", { coverFileId: null }),
          ],
          files: [
            { fileId: "FiAuthorAvatar01", url: "javascript:alert(1)" },
            { fileId: "FiPackCover00001", url: "not a url" },
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
        assetCount: 42,
        coverUrl: undefined,
        description: [],
        screenshotUrls: [],
        releasedAt: 1786492800000,
        author: { id: author.id, name: author.name, avatarUrl: undefined },
      },
    ]);
  });

  it("returns a pack with the import link from its manifest file", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          assetPack: {
            id: "AsPkPackOne00001",
            data: {
              ...packItem("AsPkPackOne00001").data,
              manifestFileId: "FiPackManifest01",
            },
          },
          author,
          files,
        },
      }),
    );

    const pack = await client.getAssetPackById({
      assetPackId: "AsPkPackOne00001",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      method: "reader.getAssetPackById",
      params: { assetPackId: "AsPkPackOne00001" },
    });
    expect(pack).toMatchObject({
      id: "AsPkPackOne00001",
      importUrl: "https://files.example/FiPackManifest01",
      author: { name: "Author One" },
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
              manifestFileId: "FiPackManifest01",
              screenshotFileIds: [
                "FiPackShot000002",
                "FiPackShotMissin",
                "FiPackShot000001",
              ],
              versionName: "1.0.0",
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
              ],
            },
          },
          author,
          files: [
            ...files,
            {
              fileId: "FiPackShot000001",
              url: "https://files.example/FiPackShot000001",
            },
            {
              fileId: "FiPackShot000002",
              url: "https://files.example/FiPackShot000002",
            },
          ],
        },
      }),
    );

    const pack = await client.getAssetPackById({
      assetPackId: "AsPkPackOne00001",
    });

    expect(pack).toMatchObject({
      description: ["About", "Smooth transitions.", "• Masks"],
      screenshotUrls: [
        "https://files.example/FiPackShot000002",
        "https://files.example/FiPackShot000001",
      ],
      versionName: "1.0.0",
      releasedAt: 1786492800000,
      updatedAt: 1786579200000,
    });
  });

  it("lists one author's packs", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { items: [], files: [], nextCursor: null },
      }),
    );

    await client.listAssetPacks({ authorId: "Cr8rAuthorOne001" });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params).toMatchObject({
      query: null,
      authorId: "Cr8rAuthorOne001",
      pricingType: "FREE",
    });
  });

  it("reads an author's profile through the reader creator method", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          creator: {
            id: "Cr8rAuthorOne001",
            data: {
              schemaVersion: 1,
              status: "PUBLISHED",
              name: "Author One",
              handle: null,
              description: "Makes transitions.\n\n  Free to use.  ",
              avatarFileId: "FiAuthorAvatar01",
              links: [
                { label: "X", url: "https://x.example/author" },
                { label: "Plain", url: "http://insecure.example" },
                { label: "Script", url: "javascript:alert(1)" },
              ],
            },
          },
          products: [],
          files,
        },
      }),
    );

    const author = await client.getAuthorById({ authorId: "Cr8rAuthorOne001" });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      method: "reader.getCreatorById",
      params: { creatorId: "Cr8rAuthorOne001" },
    });
    expect(author).toEqual({
      id: "Cr8rAuthorOne001",
      name: "Author One",
      avatarUrl: "https://files.example/FiAuthorAvatar01",
      description: ["Makes transitions.", "Free to use."],
      links: [{ label: "X", url: "https://x.example/author" }],
    });
  });

  it("reports a missing author with its own code", async () => {
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
      client.getAuthorById({ authorId: "Cr8rMissing00001" }),
    ).rejects.toMatchObject({ code: "asset_author_not_found" });
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
              manifestFileId: "FiPackManifest01",
            },
          },
          author,
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
