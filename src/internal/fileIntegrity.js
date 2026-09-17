export const verifyFileIntegrity = async (
  bytes,
  metadata = {},
  computeHash,
) => {
  // Older projects may not have a baseline. Never manufacture one on read.
  if (metadata.size != null && bytes.byteLength !== metadata.size) {
    const error = new Error(
      "The stored file size does not match its import record.",
    );
    error.code = "file_integrity_mismatch";
    throw error;
  }
  if (
    metadata.sha256 &&
    (await computeHash(bytes)) !== metadata.sha256.toLowerCase()
  ) {
    const error = new Error(
      "The stored file checksum does not match its import record.",
    );
    error.code = "file_integrity_mismatch";
    throw error;
  }
};
