import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeSha256 } from "../../src/deps/clients/sha256.js";

describe("SHA-256 across runtimes", () => {
  afterEach(() => vi.unstubAllGlobals());

  const vectors = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ];

  it.each(vectors)(
    "matches the SHA-256 vector for %j with and without Web Crypto",
    async (text, expected) => {
      const bytes = new TextEncoder().encode(text);
      expect(await computeSha256(bytes, webcrypto)).toBe(expected);
      expect(await computeSha256(bytes.buffer, {})).toBe(expected);
    },
  );

  it("hashes only the bytes in a view, including binary data", async () => {
    const buffer = Uint8Array.from({ length: 1024 }, (_, index) => index % 256);
    const expected = createHash("sha256")
      .update(buffer.subarray(13, 987))
      .digest("hex");
    const view = new DataView(buffer.buffer, 13, 974);
    expect(await computeSha256(view, {})).toBe(expected);
    expect(await computeSha256(view, webcrypto)).toBe(expected);
  });

  it("works when the runtime has no crypto object", async () => {
    vi.stubGlobal("crypto", undefined);
    expect(await computeSha256(new TextEncoder().encode("abc"))).toBe(
      vectors[1][1],
    );
  });

  it("preserves native digest failures", async () => {
    const error = new Error("Digest failed");
    const cryptoImpl = { subtle: { digest: vi.fn().mockRejectedValue(error) } };
    await expect(computeSha256(new Uint8Array(), cryptoImpl)).rejects.toBe(
      error,
    );
  });
});
