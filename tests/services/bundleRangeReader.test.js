import { describe, expect, it, vi } from "vitest";
import {
  createBundle,
  createBundleRangeReader,
} from "../../src/deps/services/shared/projectExportService.js";

const instructions = { title: "Project One" };
const assets = {
  "image-one": { mime: "image/png", buffer: new Uint8Array([1, 2, 3, 4]) },
  "image-two": { mime: "image/png", buffer: new Uint8Array([5, 6, 7]) },
};

const rangeResponse = (bundle, init) => {
  const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(init.headers.range);
  return new Response(bundle.slice(Number(start), Number(end) + 1), {
    status: 206,
    headers: {
      "content-range": `bytes ${start}-${end}/${bundle.byteLength}`,
    },
  });
};

const expectContents = async (reader) => {
  expect(await reader.readInstructions()).toEqual(instructions);
  for (const [id, asset] of Object.entries(assets)) {
    expect((await reader.readAsset(id)).buffer).toEqual(asset.buffer);
  }
};

describe("bundle range reader", () => {
  it("preserves range loading without a full download", async () => {
    const bundle = await createBundle(instructions, assets);
    const fetchFn = vi.fn(async (_url, init) => rangeResponse(bundle, init));
    const reader = await createBundleRangeReader({ fetchFn });
    await expectContents(reader);
    expect(reader.totalLength).toBe(bundle.byteLength);
    expect(fetchFn.mock.calls.every(([, init]) => init.headers.range)).toBe(
      true,
    );
  });

  it("caches a genuine full response without refetching", async () => {
    const bundle = await createBundle(instructions, assets);
    const fetchFn = vi.fn(async () => new Response(bundle));
    await expectContents(await createBundleRangeReader({ fetchFn }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each(["empty", "header-only", "truncated"])(
    "recovers from an %s initial 200 response without caching incomplete bytes",
    async (kind) => {
      const bundle = await createBundle(instructions, assets);
      const lengths = {
        empty: 0,
        "header-only": 16,
        truncated: bundle.length - 1,
      };
      const fetchFn = vi.fn(async (_url, init) => {
        if (init.headers?.range)
          return new Response(bundle.slice(0, lengths[kind]));
        expect(init.cache).toBe("no-store");
        return new Response(bundle);
      });
      await expectContents(await createBundleRangeReader({ fetchFn }));
      expect(fetchFn).toHaveBeenCalledTimes(2);
    },
  );

  it("shares one fresh full download when concurrent asset ranges return partial 200 bodies", async () => {
    const bundle = await createBundle(instructions, assets);
    let brokenRanges = false;
    let finishDownload;
    const download = new Promise((resolve) => {
      finishDownload = resolve;
    });
    const fetchFn = vi.fn(async (_url, init) => {
      if (!init.headers?.range) {
        expect(init.cache).toBe("no-store");
        await download;
        return new Response(bundle);
      }
      const response = rangeResponse(bundle, init);
      return brokenRanges
        ? new Response(await response.arrayBuffer())
        : response;
    });
    const reader = await createBundleRangeReader({ fetchFn });
    brokenRanges = true;
    const reads = Promise.all(
      Object.keys(assets).map((id) => reader.readAsset(id)),
    );
    await vi.waitFor(() => {
      expect(
        fetchFn.mock.calls.filter(([, init]) => !init.headers?.range),
      ).toHaveLength(1);
    });
    finishDownload();
    const loaded = await reads;
    expect(loaded.map((asset) => asset.buffer)).toEqual(
      Object.values(assets).map((asset) => asset.buffer),
    );
    expect(reader.totalLength).toBe(bundle.length);
    await expectContents(reader);
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });

  it("rejects an incomplete recovery download without looping or reporting success", async () => {
    const bundle = await createBundle(instructions, assets);
    let brokenRanges = false;
    const fetchFn = vi.fn(async (_url, init) => {
      if (brokenRanges) return new Response(bundle.slice(0, 16));
      return rangeResponse(bundle, init);
    });
    const reader = await createBundleRangeReader({ fetchFn });
    brokenRanges = true;
    await expect(reader.readAsset("image-two")).rejects.toThrow(
      `Full bundle response returned 16 bytes, expected ${bundle.length}`,
    );
    expect(reader.totalLength).toBe(bundle.length);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});
