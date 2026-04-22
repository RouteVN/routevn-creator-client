import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import JSZip from "jszip";

import {
  BUNDLE_CHUNKING,
  BUNDLE_CHUNKING_PRESETS,
  createBundleInstructions,
  createBundleResult,
  parseBundle,
} from "../src/deps/services/shared/projectExportService.js";

const toKiB = (value) => Math.round((value / 1024) * 10) / 10;

const createSegmentBytes = (length, seed = 1) => {
  let state = seed >>> 0;
  return Uint8Array.from(
    Array.from({ length }, () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state & 0xff;
    }),
  );
};

const concatBytes = (...parts) => {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.byteLength;
  });

  return result;
};

const insertBytes = (source, offset, inserted) => {
  return concatBytes(
    source.slice(0, offset),
    inserted,
    source.slice(offset, source.byteLength),
  );
};

const replaceBytes = (source, offset, replacement) => {
  return concatBytes(
    source.slice(0, offset),
    replacement,
    source.slice(offset + replacement.byteLength, source.byteLength),
  );
};

const zipBundle = async (bundle) => {
  const zip = new JSZip();
  zip.file("package.bin", bundle);
  const zipBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6,
    },
  });

  return zipBuffer.byteLength;
};

const createBenchmarkInstructions = () => {
  return createBundleInstructions({
    projectData: {
      story: {
        initialSceneId: "scene-1",
        scenes: {
          "scene-1": {
            initialSectionId: "section-1",
            sections: {
              "section-1": {
                lines: [],
              },
            },
          },
        },
      },
    },
    bundler: {
      appVersion: "benchmark",
    },
    project: {
      namespace: "benchmark",
    },
  });
};

const benchmarkCases = [
  {
    id: "identical-large-atlases",
    description: "three identical large atlas-like payloads",
    createAssets() {
      const base = concatBytes(
        createSegmentBytes(96 * 1024, 11),
        createSegmentBytes(224 * 1024, 29),
        createSegmentBytes(64 * 1024, 47),
      );
      return {
        "atlas-a": { buffer: base, mime: "application/octet-stream" },
        "atlas-b": { buffer: base, mime: "application/octet-stream" },
        "atlas-c": { buffer: base, mime: "application/octet-stream" },
      };
    },
  },
  {
    id: "boundary-shifted-variants",
    description: "shared content with small insertions causing boundary shifts",
    createAssets() {
      const prefix = createSegmentBytes(96 * 1024, 101);
      const body = createSegmentBytes(192 * 1024, 103);
      const suffix = createSegmentBytes(160 * 1024, 107);
      const insertedA = createSegmentBytes(97, 109);
      const insertedB = createSegmentBytes(131, 113);
      const base = concatBytes(prefix, body, suffix);
      return {
        base: { buffer: base, mime: "application/octet-stream" },
        shiftedA: {
          buffer: insertBytes(base, 48 * 1024, insertedA),
          mime: "application/octet-stream",
        },
        shiftedB: {
          buffer: insertBytes(base, 160 * 1024, insertedB),
          mime: "application/octet-stream",
        },
      };
    },
  },
  {
    id: "shared-header-footer",
    description: "common header and footer with unique middles",
    createAssets() {
      const header = createSegmentBytes(128 * 1024, 211);
      const footer = createSegmentBytes(96 * 1024, 223);
      return {
        "sheet-a": {
          buffer: concatBytes(
            header,
            createSegmentBytes(80 * 1024, 227),
            footer,
          ),
          mime: "application/octet-stream",
        },
        "sheet-b": {
          buffer: concatBytes(
            header,
            createSegmentBytes(80 * 1024, 229),
            footer,
          ),
          mime: "application/octet-stream",
        },
        "sheet-c": {
          buffer: concatBytes(
            header,
            createSegmentBytes(80 * 1024, 233),
            footer,
          ),
          mime: "application/octet-stream",
        },
      };
    },
  },
  {
    id: "reordered-blocks",
    description:
      "large files sharing blocks but with reordered or replaced regions",
    createAssets() {
      const blocks = Array.from({ length: 10 }, (_, index) =>
        createSegmentBytes(48 * 1024, 301 + index),
      );
      return {
        "story-a": {
          buffer: concatBytes(...blocks.slice(0, 8)),
          mime: "application/octet-stream",
        },
        "story-b": {
          buffer: concatBytes(
            ...blocks.slice(0, 3),
            blocks[8],
            ...blocks.slice(4, 8),
          ),
          mime: "application/octet-stream",
        },
        "story-c": {
          buffer: concatBytes(blocks[9], ...blocks.slice(1, 8)),
          mime: "application/octet-stream",
        },
      };
    },
  },
  {
    id: "mixed-small-and-large",
    description: "many small assets plus a few overlapping large assets",
    createAssets() {
      const assets = {};
      const iconA = createSegmentBytes(8 * 1024, 401);
      const iconB = createSegmentBytes(8 * 1024, 409);

      for (let index = 0; index < 24; index += 1) {
        assets[`icon-${index}`] = {
          buffer: index % 3 === 0 ? iconA : iconB,
          mime: "application/octet-stream",
        };
      }

      const base = concatBytes(
        createSegmentBytes(96 * 1024, 421),
        createSegmentBytes(128 * 1024, 431),
        createSegmentBytes(96 * 1024, 439),
      );
      assets.largeA = {
        buffer: base,
        mime: "application/octet-stream",
      };
      assets.largeB = {
        buffer: replaceBytes(
          base,
          96 * 1024,
          createSegmentBytes(128 * 1024, 443),
        ),
        mime: "application/octet-stream",
      };
      assets.largeC = {
        buffer: insertBytes(base, 72 * 1024, createSegmentBytes(83, 449)),
        mime: "application/octet-stream",
      };

      return assets;
    },
  },
  {
    id: "compressed-like-random",
    description: "mostly random payloads with one exact duplicate",
    createAssets() {
      const randomA = createSegmentBytes(320 * 1024, 503);
      const randomB = createSegmentBytes(320 * 1024, 509);
      const randomC = createSegmentBytes(320 * 1024, 521);
      return {
        randomA: { buffer: randomA, mime: "application/octet-stream" },
        randomB: { buffer: randomB, mime: "application/octet-stream" },
        randomC: { buffer: randomC, mime: "application/octet-stream" },
        randomADupe: { buffer: randomA, mime: "application/octet-stream" },
      };
    },
  },
];

const policies = [
  {
    id: "whole-file-only",
    chunking: BUNDLE_CHUNKING_PRESETS.wholeFileOnly,
  },
  {
    id: "fastcdc-small",
    chunking: BUNDLE_CHUNKING_PRESETS.fastcdcSmall,
  },
  {
    id: "fastcdc-medium",
    chunking: BUNDLE_CHUNKING_PRESETS.fastcdcMedium,
  },
  {
    id: "fastcdc-large",
    chunking: BUNDLE_CHUNKING_PRESETS.fastcdcLarge,
  },
  {
    id: "fastcdc-conservative",
    chunking: BUNDLE_CHUNKING_PRESETS.fastcdcConservative,
  },
];

const chunkingConfigsMatch = (left, right) => {
  return (
    left.algorithm === right.algorithm &&
    left.mode === right.mode &&
    left.minSize === right.minSize &&
    left.avgSize === right.avgSize &&
    left.maxSize === right.maxSize &&
    left.smallFileThreshold === right.smallFileThreshold
  );
};

const verifyBundleRoundTrip = async ({ bundle, assets }) => {
  const parsed = await parseBundle(bundle);

  Object.entries(assets).forEach(([assetId, asset]) => {
    assert.deepEqual(
      Array.from(parsed.assets[assetId].buffer),
      Array.from(asset.buffer),
    );
  });
};

const runPolicyOnCase = async ({ benchmarkCase, policy, instructions }) => {
  const assets = benchmarkCase.createAssets();
  const startBundleMs = performance.now();
  const { bundle, stats, manifest } = await createBundleResult(
    instructions,
    assets,
    {
      chunking: policy.chunking,
    },
  );
  const bundleMs = performance.now() - startBundleMs;
  const startParseMs = performance.now();
  await verifyBundleRoundTrip({
    bundle,
    assets,
  });
  const parseMs = performance.now() - startParseMs;
  const zipBytes = await zipBundle(bundle);

  return {
    caseId: benchmarkCase.id,
    policyId: policy.id,
    zipBytes,
    packageBinBytes: stats.packageBinBytes,
    rawAssetBytes: stats.rawAssetBytes,
    uniqueChunkCount: stats.uniqueChunkCount,
    chunkReferenceCount: stats.chunkReferenceCount,
    dedupedBytes: stats.dedupedBytes,
    bundleMs: Math.round(bundleMs * 100) / 100,
    parseMs: Math.round(parseMs * 100) / 100,
    chunking: manifest.chunking,
  };
};

const instructions = createBenchmarkInstructions();
const allResults = [];

for (const benchmarkCase of benchmarkCases) {
  for (const policy of policies) {
    allResults.push(
      await runPolicyOnCase({
        benchmarkCase,
        policy,
        instructions,
      }),
    );
  }
}

const totalsByPolicy = policies.map((policy) => {
  const rows = allResults.filter((result) => result.policyId === policy.id);
  return {
    policyId: policy.id,
    totalZipBytes: rows.reduce((sum, row) => sum + row.zipBytes, 0),
    totalPackageBinBytes: rows.reduce(
      (sum, row) => sum + row.packageBinBytes,
      0,
    ),
    totalUniqueChunkCount: rows.reduce(
      (sum, row) => sum + row.uniqueChunkCount,
      0,
    ),
    totalDedupedBytes: rows.reduce((sum, row) => sum + row.dedupedBytes, 0),
    totalBundleMs:
      Math.round(rows.reduce((sum, row) => sum + row.bundleMs, 0) * 100) / 100,
    totalParseMs:
      Math.round(rows.reduce((sum, row) => sum + row.parseMs, 0) * 100) / 100,
  };
});

const currentDefaultPolicy = policies.find((policy) =>
  chunkingConfigsMatch(policy.chunking, BUNDLE_CHUNKING),
);
assert.ok(
  currentDefaultPolicy,
  "Current default chunking policy must be benchmarked.",
);

const bestOverall = [...totalsByPolicy].sort((left, right) => {
  return (
    left.totalZipBytes - right.totalZipBytes ||
    left.totalPackageBinBytes - right.totalPackageBinBytes
  );
})[0];

assert.equal(
  bestOverall.policyId,
  currentDefaultPolicy.id,
  `Default policy ${currentDefaultPolicy.id} is not the best benchmark result (${bestOverall.policyId}).`,
);

const bestByCase = benchmarkCases.map((benchmarkCase) => {
  const rows = allResults
    .filter((result) => result.caseId === benchmarkCase.id)
    .sort((left, right) => {
      return (
        left.zipBytes - right.zipBytes ||
        left.packageBinBytes - right.packageBinBytes
      );
    });

  return {
    caseId: benchmarkCase.id,
    description: benchmarkCase.description,
    bestPolicyId: rows[0].policyId,
    rows: rows.map((row) => ({
      policyId: row.policyId,
      zipKiB: toKiB(row.zipBytes),
      packageKiB: toKiB(row.packageBinBytes),
      dedupedKiB: toKiB(row.dedupedBytes),
      uniqueChunkCount: row.uniqueChunkCount,
      bundleMs: row.bundleMs,
    })),
  };
});

console.log(
  JSON.stringify(
    {
      defaultPolicyId: currentDefaultPolicy.id,
      currentDefaultChunking: BUNDLE_CHUNKING,
      bestOverallPolicyId: bestOverall.policyId,
      bestOverallTotals: {
        totalZipKiB: toKiB(bestOverall.totalZipBytes),
        totalPackageKiB: toKiB(bestOverall.totalPackageBinBytes),
        totalDedupedKiB: toKiB(bestOverall.totalDedupedBytes),
        totalUniqueChunkCount: bestOverall.totalUniqueChunkCount,
        totalBundleMs: bestOverall.totalBundleMs,
        totalParseMs: bestOverall.totalParseMs,
      },
      totalsByPolicy: totalsByPolicy.map((row) => ({
        policyId: row.policyId,
        totalZipKiB: toKiB(row.totalZipBytes),
        totalPackageKiB: toKiB(row.totalPackageBinBytes),
        totalDedupedKiB: toKiB(row.totalDedupedBytes),
        totalUniqueChunkCount: row.totalUniqueChunkCount,
        totalBundleMs: row.totalBundleMs,
        totalParseMs: row.totalParseMs,
      })),
      bestByCase,
    },
    null,
    2,
  ),
);
