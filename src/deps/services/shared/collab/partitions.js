const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const MAIN_PARTITION = "m";

const toNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;

const encodeBase58Fixed6 = (value) => {
  let remaining = value >>> 0;
  let encoded = "";

  do {
    encoded = BASE58_ALPHABET[remaining % 58] + encoded;
    remaining = Math.floor(remaining / 58);
  } while (remaining > 0);

  return encoded.padStart(6, BASE58_ALPHABET[0]).slice(-6);
};

const hashSceneId = (sceneId) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sceneId.length; index += 1) {
    hash ^= sceneId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const collectSceneTokens = (partitions = []) => {
  const tokens = new Set();
  for (const partition of partitions) {
    if (typeof partition !== "string") continue;
    if (partition.startsWith("m:s:")) {
      tokens.add(partition.slice(4));
      continue;
    }
    if (partition.startsWith("s:")) {
      tokens.add(partition.slice(2));
    }
  }
  return tokens;
};

export const mainPartitionFor = () => MAIN_PARTITION;

export const scenePartitionTokenFor = (sceneId) => {
  const normalizedSceneId = toNonEmptyString(sceneId);
  if (!normalizedSceneId) {
    throw new Error("sceneId is required to build a partition token");
  }
  return encodeBase58Fixed6(hashSceneId(normalizedSceneId));
};

export const mainScenePartitionFor = (sceneId) =>
  `m:s:${scenePartitionTokenFor(sceneId)}`;

export const scenePartitionFor = (sceneId) =>
  `s:${scenePartitionTokenFor(sceneId)}`;

export const collapsePartitionsToSingle = (...candidates) => {
  const partitions = candidates.flatMap((entry) =>
    Array.isArray(entry) ? entry : [entry],
  );
  const normalized = [];
  const seen = new Set();

  for (const candidate of partitions) {
    const partition = toNonEmptyString(candidate);
    if (!partition || seen.has(partition)) continue;
    seen.add(partition);
    normalized.push(partition);
  }

  if (normalized.length === 0) {
    throw new Error("partition is required");
  }

  if (normalized.includes(MAIN_PARTITION)) {
    const sceneTokens = collectSceneTokens(normalized);
    if (sceneTokens.size > 1) {
      return MAIN_PARTITION;
    }
    const mainScene = normalized.find((partition) =>
      partition.startsWith("m:s:"),
    );
    if (mainScene) return mainScene;
  }

  const sceneTokens = collectSceneTokens(normalized);
  if (sceneTokens.size > 1) {
    return MAIN_PARTITION;
  }

  const mainScene = normalized.find((partition) =>
    partition.startsWith("m:s:"),
  );
  if (mainScene) return mainScene;

  const sceneOnly = normalized.find((partition) => partition.startsWith("s:"));
  if (sceneOnly) return sceneOnly;

  return normalized[0];
};

export const getProjectSubscriptionPartitions = (state) => {
  const partitions = [MAIN_PARTITION];
  const sceneItems = state?.scenes?.items || {};
  for (const sceneId of Object.keys(sceneItems)) {
    partitions.push(mainScenePartitionFor(sceneId));
    partitions.push(scenePartitionFor(sceneId));
  }
  return partitions;
};
