import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAssetStoreClient } from "../../src/deps/clients/assetStoreClient.js";
import { createProjectTemplateDownloadService } from "../../src/deps/services/shared/projectTemplateDownloadService.js";
import { startMockAssetStoreServer } from "../../scripts/mock-asset-store-server.js";

let mock;

beforeAll(async () => {
  // The mock logs each view and download it counts.
  vi.spyOn(console, "log").mockImplementation(() => {});
  mock = await startMockAssetStoreServer({ port: 0 });
});

afterAll(() => mock.close());

const rpc = async (method, params) => {
  const response = await fetch(mock.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-RouteVN-RPC": "1" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return response.json();
};

const DEVICE = { id: "123456789ABC123456789ABC" };

const findTemplate = async (client, title) => {
  const { templates } = await client.listProjectTemplates();
  return templates.find((template) => template.title === title);
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const listParams = (overrides = {}) => ({
  query: null,
  creatorModelSchema: 21,
  page: { cursor: null, limit: 20 },
  ...overrides,
});

describe("mock asset store server", () => {
  it("serves the Creator's template list and pages through the client", async () => {
    const client = createAssetStoreClient({
      url: mock.url,
      creatorModelSchema: 21,
    });

    const { templates, nextCursor } = await client.listProjectTemplates();

    expect(templates.map(({ title }) => title)).toEqual([
      "Classic Romance",
      "Night Mystery",
      "Fantasy Quest",
      "School Days",
      "Haunted House",
      "Space Station",
      "Kinetic Novel",
    ]);
    expect(nextCursor).toBeUndefined();
    for (const template of templates) {
      expect(template.id).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(template.coverUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/files\//);
      expect(template.creator.avatarUrl).toMatch(/\/files\//);
    }
  });

  it("lists a template written with a newer Creator model only to a Creator that has it", async () => {
    const current = await rpc("assetStore.listProjectTemplates", listParams());
    const newer = await rpc(
      "assetStore.listProjectTemplates",
      listParams({ creatorModelSchema: 99 }),
    );

    const titles = ({ result }) => result.items.map(({ data }) => data.title);
    expect(titles(current)).not.toContain("Future Template");
    expect(titles(newer)[0]).toBe("Future Template");
  });

  it("matches titles and creator names, and pages with cursors bound to the filters", async () => {
    const byCreator = await rpc(
      "assetStore.listProjectTemplates",
      listParams({ query: "studio two" }),
    );
    expect(byCreator.result.items.map(({ data }) => data.title)).toEqual([
      "Night Mystery",
      "Haunted House",
    ]);

    const first = await rpc(
      "assetStore.listProjectTemplates",
      listParams({ page: { cursor: null, limit: 3 } }),
    );
    const second = await rpc(
      "assetStore.listProjectTemplates",
      listParams({ page: { cursor: first.result.nextCursor, limit: 3 } }),
    );
    expect(first.result.items).toHaveLength(3);
    expect(second.result.items[0].data.title).toBe("School Days");
    // Each page's files name every file its items do, and only those.
    expect(first.result.files.map(({ fileId }) => fileId)).toEqual(
      expect.arrayContaining(
        first.result.items.map(({ data }) => data.coverFileId),
      ),
    );

    const mismatched = await rpc(
      "assetStore.listProjectTemplates",
      listParams({
        query: "night",
        page: { cursor: first.result.nextCursor, limit: 3 },
      }),
    );
    expect(mismatched.error.data.code).toBe("INVALID_CURSOR");
  });

  it("refuses params the API would refuse", async () => {
    const unknown = await rpc(
      "assetStore.listProjectTemplates",
      listParams({ sort: "TITLE" }),
    );
    const limit = await rpc(
      "assetStore.listProjectTemplates",
      listParams({ page: { cursor: null, limit: 50 } }),
    );
    const id = await rpc("assetStore.getProjectTemplateById", {
      projectTemplateId: "short",
    });
    const method = await rpc("assetStore.listAssetPacks", {});

    expect(unknown.error.code).toBe(-32602);
    expect(limit.error.code).toBe(-32602);
    expect(id.error.code).toBe(-32602);
    expect(method.error.code).toBe(-32601);
  });

  it("serves a template's page through the client, and RESOURCE_NOT_FOUND for one it doesn't list", async () => {
    const client = createAssetStoreClient({
      url: mock.url,
      creatorModelSchema: 21,
      getDevice: async () => ({ id: "123456789ABC123456789ABC" }),
    });
    const { templates } = await client.listProjectTemplates();
    const mystery = templates.find(({ title }) => title === "Night Mystery");

    const template = await client.getProjectTemplateById({
      projectTemplateId: mystery.id,
    });

    expect(template.screenshots).toHaveLength(4);
    expect(template.description.at(-1)).toMatchObject({
      imageUrl: expect.stringMatching(/\/files\//),
      alt: "The notebook screen",
    });
    expect(template.versionName).toBe("2.0.1");
    await expect(
      client.getProjectTemplateById({ projectTemplateId: "0000000000000000" }),
    ).rejects.toMatchObject({ code: "project_template_not_found" });
  });

  it("serves each file it names as SVG to any origin, and answers preflights", async () => {
    const { result } = await rpc(
      "assetStore.listProjectTemplates",
      listParams(),
    );
    const image = await fetch(result.files[0].url);
    const preflight = await fetch(mock.url, { method: "OPTIONS" });

    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/svg+xml");
    expect(image.headers.get("access-control-allow-origin")).toBe("*");
    expect(await image.text()).toMatch(/^<svg /);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "X-RouteVN-RPC",
    );
  });

  it("signs a template's package, served in byte ranges until the URL expires", async () => {
    const client = createAssetStoreClient({
      url: mock.url,
      creatorModelSchema: 21,
      getDevice: async () => DEVICE,
    });
    const kinetic = await findTemplate(client, "Kinetic Novel");

    const zip = await client.getProjectTemplateDownload({
      projectTemplateId: kinetic.id,
      countDownload: true,
    });
    const range = await fetch(zip.url, { headers: { Range: "bytes=0-3" } });
    const expired = await fetch(zip.url.replace(/expires=\d+/, "expires=1"), {
      headers: { Range: "bytes=0-3" },
    });
    const { result } = await rpc("assetStore.getProjectTemplateById", {
      projectTemplateId: kinetic.id,
    });

    expect(zip.expiresAt).toBeGreaterThan(Date.now());
    expect(zip.directoryOffset + zip.directorySize).toBeLessThan(zip.size);
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe(`bytes 0-3/${zip.size}`);
    expect([...new Uint8Array(await range.arrayBuffer())]).toEqual([
      0x50, 0x4b, 0x03, 0x04,
    ]);
    expect(expired.status).toBe(403);
    // A template's page names the same package.
    expect(result.projectTemplate.data.package).toMatchObject({
      size: zip.size,
      directoryOffset: zip.directoryOffset,
      directorySize: zip.directorySize,
    });
    expect(console.log).toHaveBeenCalledWith(
      `download of Kinetic Novel from device ${DEVICE.id}`,
    );
  });

  it("serves packages the app downloads whole: the template's state at its own resolution and every file", async () => {
    const assetStore = createAssetStoreClient({
      url: mock.url,
      creatorModelSchema: 21,
    });
    const kinetic = await findTemplate(assetStore, "Kinetic Novel");
    const progress = [];

    const template = await createProjectTemplateDownloadService({
      assetStore,
      creatorModelSchema: 21,
    }).downloadProjectTemplate({
      templateId: kinetic.id,
      onProgress: (event) => progress.push(event),
    });

    const { items } = template.repository.files;
    expect(template.repository.project.resolution).toEqual({
      width: 1280,
      height: 720,
    });
    // The bundled template under the template's own title.
    expect(JSON.stringify(template.repository)).toContain('"KINETIC NOVEL"');
    expect(template.files.map(({ fileId }) => fileId).sort()).toEqual(
      Object.keys(items).sort(),
    );
    for (const { fileId, bytes } of template.files) {
      expect(sha256(bytes)).toBe(items[fileId].sha256);
    }
    const total = Object.values(items).reduce((sum, { size }) => sum + size, 0);
    expect(progress.at(-1)).toEqual({
      stage: "downloading",
      current: total,
      total,
    });
  });

  it("serves a package with a file that fails its checksum with --fail package", async () => {
    const broken = await startMockAssetStoreServer({
      port: 0,
      fail: "package",
    });
    try {
      const assetStore = createAssetStoreClient({
        url: broken.url,
        creatorModelSchema: 21,
      });
      const romance = await findTemplate(assetStore, "Classic Romance");

      await expect(
        createProjectTemplateDownloadService({
          assetStore,
          creatorModelSchema: 21,
        }).downloadProjectTemplate({ templateId: romance.id }),
      ).rejects.toMatchObject({ code: "integrity_mismatch" });
    } finally {
      broken.close();
    }
  });
});
