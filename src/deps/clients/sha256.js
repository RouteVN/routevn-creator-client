import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const computeSha256 = async (bytes, cryptoImpl = globalThis.crypto) => {
  if (cryptoImpl?.subtle?.digest) {
    const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(digest));
  }

  // LAN HTTP development URLs and native custom schemes may lack Web Crypto.
  const input = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
  return bytesToHex(sha256(input));
};
