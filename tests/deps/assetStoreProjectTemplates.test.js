import { describe, expect, it, vi } from "vitest";
import { createAssetStoreClient } from "../../src/deps/clients/assetStoreClient.js";

const RPC_URL = "http://127.0.0.1:3100/asset-store/rpc";

const creator = {
  id: "Cr8rCreatorOne01",
  name: "Creator One",
  avatarFileId: "FiCreatorAvatar1",
};

// A template card's data, as `listProjectTemplates` answers it.
const cardData = (overrides = {}) => ({
  title: "Template One",
  summary: "  A starter project.  ",
  coverFileId: "FiTemplateTitle1",
  screenshotFileIds: ["FiTemplateTitle1", "FiTemplateMenu01"],
  languages: ["en", "ja"],
  resolution: { width: 1920, height: 1080 },
  creatorModelSchema: 21,
  pricing: { type: "FREE" },
  listedAt: 1795000000000,
  ...overrides,
});

const files = [
  { fileId: "FiTemplateTitle1", url: "https://files.example/title" },
  { fileId: "FiTemplateMenu01", url: "https://files.example/menu" },
  { fileId: "FiCreatorAvatar1", url: "https://files.example/avatar" },
  { fileId: "FiDescription001", url: "https://files.example/notebook" },
];

const rpcResponse = (body) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

const createClient = (respond, options = {}) => {
  const fetchImpl = vi.fn(async (_url, request) =>
    respond(JSON.parse(request.body)),
  );
  return {
    fetchImpl,
    client: createAssetStoreClient({ url: RPC_URL, fetchImpl, ...options }),
  };
};

const device = { id: "123456789ABC123456789ABC", app: "routevn-creator" };

describe("asset store project templates", () => {
  it("lists template cards with this Creator's model schema", async () => {
    const { client, fetchImpl } = createClient(
      () =>
        rpcResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            items: [
              { id: "Tp1TemplateOne01", data: cardData(), creator },
              // Not shown: paid, without a resolution, without a creator.
              {
                id: "Tp1TemplatePaid1",
                data: cardData({ pricing: { type: "PAID" } }),
                creator,
              },
              {
                id: "Tp1TemplateNoRes",
                data: cardData({ resolution: null }),
                creator,
              },
              { id: "Tp1TemplateNoCre", data: cardData() },
            ],
            files,
            nextCursor: "cursor-2",
          },
        }),
      { creatorModelSchema: 21 },
    );

    const page = await client.listProjectTemplates({ query: "  romance " });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "assetStore.listProjectTemplates",
      params: {
        query: "romance",
        creatorModelSchema: 21,
        page: { cursor: null, limit: 20 },
      },
    });
    expect(page).toEqual({
      templates: [
        {
          id: "Tp1TemplateOne01",
          title: "Template One",
          summary: "A starter project.",
          coverUrl: "https://files.example/title",
          resolution: { width: 1920, height: 1080 },
          languages: ["en", "ja"],
          releasedAt: 1795000000000,
          creator: {
            id: "Cr8rCreatorOne01",
            name: "Creator One",
            avatarUrl: "https://files.example/avatar",
          },
        },
      ],
      nextCursor: "cursor-2",
    });
  });

  it("asks for the next page with its cursor, and a blank query as none", async () => {
    const { client, fetchImpl } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { items: [], files: [], nextCursor: null },
      }),
    );

    const page = await client.listProjectTemplates({
      cursor: "cursor-2",
      query: "   ",
    });

    const { params } = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(params.query).toBeNull();
    expect(params.page).toEqual({ cursor: "cursor-2", limit: 20 });
    // The app's own Creator model schema by default.
    expect(params.creatorModelSchema).toEqual(expect.any(Number));
    expect(page).toEqual({ templates: [], nextCursor: undefined });
  });

  it("reads a template's page with its description and screenshots, counting a view", async () => {
    const { client, fetchImpl } = createClient(
      () =>
        rpcResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            projectTemplate: {
              id: "Tp1TemplateOne01",
              data: {
                ...cardData({
                  screenshotFileIds: [
                    "FiTemplateTitle1",
                    "FiMissingFile001",
                    "FiTemplateMenu01",
                  ],
                }),
                description: [
                  {
                    type: "PARAGRAPH",
                    children: [{ text: "A starter.", marks: [], link: null }],
                  },
                  {
                    type: "IMAGE",
                    fileId: "FiDescription001",
                    alt: "The notebook",
                    width: 1920,
                    height: 1080,
                  },
                ],
                versionName: "1.2.0",
                releaseNotes: " Adds an ending. ",
                lastUpdatedAt: 1795100000000,
                package: {
                  fileId: "FiTemplatePackag",
                  size: 1024,
                  directoryOffset: 900,
                  directorySize: 124,
                },
              },
            },
            creator,
            files,
          },
        }),
      { getDevice: async () => device },
    );

    const template = await client.getProjectTemplateById({
      projectTemplateId: "Tp1TemplateOne01",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params).toEqual({
      projectTemplateId: "Tp1TemplateOne01",
      device,
    });
    expect(template).toMatchObject({
      id: "Tp1TemplateOne01",
      title: "Template One",
      description: [
        { text: "A starter." },
        {
          imageUrl: "https://files.example/notebook",
          alt: "The notebook",
          width: 1920,
          height: 1080,
        },
      ],
      // A screenshot whose file has no URL is left out.
      screenshots: [
        { url: "https://files.example/title" },
        { url: "https://files.example/menu" },
      ],
      versionName: "1.2.0",
      releaseNotes: "Adds an ending.",
      updatedAt: 1795100000000,
    });
  });

  it("reads a template without a device when the device can't be read", async () => {
    const { client, fetchImpl } = createClient(
      () =>
        rpcResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            projectTemplate: { id: "Tp1TemplateOne01", data: cardData() },
            creator,
            files,
          },
        }),
      {
        getDevice: async () => {
          throw new Error("no database");
        },
      },
    );

    await client.getProjectTemplateById({
      projectTemplateId: "Tp1TemplateOne01",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params).toEqual({
      projectTemplateId: "Tp1TemplateOne01",
    });
  });

  it("says a template is gone when the store no longer lists it", async () => {
    const { client } = createClient(() =>
      rpcResponse({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32000,
          message: "Resource not found",
          data: {
            code: "RESOURCE_NOT_FOUND",
            details: { resourceType: "PROJECT_TEMPLATE" },
          },
        },
      }),
    );

    await expect(
      client.getProjectTemplateById({ projectTemplateId: "Tp1TemplateOne01" }),
    ).rejects.toMatchObject({ code: "project_template_not_found" });
  });

  it("says the store is unavailable for an answer it can't read", async () => {
    const { client } = createClient(() =>
      rpcResponse({ jsonrpc: "2.0", id: 1, result: { items: "none" } }),
    );

    await expect(client.listProjectTemplates()).rejects.toMatchObject({
      code: "asset_store_unavailable",
    });
  });
});
