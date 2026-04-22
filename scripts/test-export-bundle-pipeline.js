import assert from "node:assert/strict";

import createRouteEngine from "route-engine-js";
import JSZip from "jszip";

import {
  createBundleInstructions,
  createBundleResult,
  createProjectExportService,
  parseBundle,
} from "../src/deps/services/shared/projectExportService.js";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
  constructProjectData,
} from "../src/internal/project/projection.js";

const originalFetch = globalThis.fetch;

const createTreeCollection = (items = {}, tree = []) => ({
  items,
  tree,
});

const createDataUrl = (bytes, mimeType = "application/octet-stream") => {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
};

const createAssetBytes = (length, offset = 0) => {
  return Uint8Array.from(
    Array.from({ length }, (_, index) => (index + offset) % 251),
  );
};

const expectEngineInitToSucceed = (projectData) => {
  const engine = createRouteEngine({
    handlePendingEffects: () => {},
  });

  engine.init({
    initialState: {
      global: {},
      projectData,
    },
  });
};

const fileBytesById = {
  "file-live": createAssetBytes(160 * 1024, 0),
  "file-target": createAssetBytes(160 * 1024, 0),
  "file-dead": createAssetBytes(160 * 1024, 17),
};

const repositoryState = {
  project: {
    resolution: {
      width: 1920,
      height: 1080,
    },
  },
  story: {
    initialSceneId: "scene-1",
  },
  files: createTreeCollection(),
  images: createTreeCollection(
    {
      "image-live": {
        id: "image-live",
        type: "image",
        name: "Live Image",
        fileId: "file-live",
        fileType: "image/png",
        fileSize: fileBytesById["file-live"].byteLength,
      },
      "image-target": {
        id: "image-target",
        type: "image",
        name: "Target Image",
        fileId: "file-target",
        fileType: "image/png",
        fileSize: fileBytesById["file-target"].byteLength,
      },
      "image-dead": {
        id: "image-dead",
        type: "image",
        name: "Dead Image",
        fileId: "file-dead",
        fileType: "image/png",
        fileSize: fileBytesById["file-dead"].byteLength,
      },
    },
    [{ id: "image-live" }, { id: "image-target" }, { id: "image-dead" }],
  ),
  spritesheets: createTreeCollection(),
  videos: createTreeCollection(),
  sounds: createTreeCollection(),
  particles: createTreeCollection(),
  animations: createTreeCollection(),
  characters: createTreeCollection(),
  fonts: createTreeCollection(),
  colors: createTreeCollection(),
  textStyles: createTreeCollection(),
  controls: createTreeCollection(),
  transforms: createTreeCollection(),
  variables: createTreeCollection(),
  layouts: createTreeCollection(
    {
      "layout-choice": {
        id: "layout-choice",
        type: "layout",
        name: "Choice Layout",
        layoutType: "normal",
        elements: {
          items: {
            button: {
              id: "button",
              type: "button",
              click: {
                payload: {
                  actions: {
                    sectionTransition: {
                      sectionId: "section-2",
                    },
                  },
                },
              },
            },
          },
          tree: [{ id: "button" }],
        },
      },
    },
    [{ id: "layout-choice" }],
  ),
  scenes: createTreeCollection(
    {
      "scene-1": {
        id: "scene-1",
        type: "scene",
        name: "Scene 1",
        initialSectionId: "section-1",
        sections: createTreeCollection(
          {
            "section-1": {
              id: "section-1",
              type: "section",
              name: "Section 1",
              lines: createTreeCollection(
                {
                  "line-1": {
                    id: "line-1",
                    actions: {
                      background: {
                        resourceId: "image-live",
                        resourceType: "image",
                      },
                      dialogue: {
                        content: [{ text: "Hello" }],
                        ui: {
                          resourceId: "layout-choice",
                          resourceType: "layout",
                        },
                      },
                    },
                  },
                },
                [{ id: "line-1" }],
              ),
            },
          },
          [{ id: "section-1" }],
        ),
      },
      "scene-2": {
        id: "scene-2",
        type: "scene",
        name: "Scene 2",
        initialSectionId: "section-2",
        sections: createTreeCollection(
          {
            "section-2": {
              id: "section-2",
              type: "section",
              name: "Section 2",
              lines: createTreeCollection(
                {
                  "line-2": {
                    id: "line-2",
                    actions: {
                      background: {
                        resourceId: "image-target",
                        resourceType: "image",
                      },
                    },
                  },
                },
                [{ id: "line-2" }],
              ),
            },
          },
          [{ id: "section-2" }],
        ),
      },
      "scene-dead": {
        id: "scene-dead",
        type: "scene",
        name: "Dead Scene",
        initialSectionId: "section-dead",
        sections: createTreeCollection(
          {
            "section-dead": {
              id: "section-dead",
              type: "section",
              name: "Dead Section",
              lines: createTreeCollection(
                {
                  "line-dead": {
                    id: "line-dead",
                    actions: {
                      background: {
                        resourceId: "image-dead",
                        resourceType: "image",
                      },
                    },
                  },
                },
                [{ id: "line-dead" }],
              ),
            },
          },
          [{ id: "section-dead" }],
        ),
      },
    },
    [{ id: "scene-1" }, { id: "scene-2" }, { id: "scene-dead" }],
  ),
};

const usage = collectUsedResourcesForExport(repositoryState);
assert.deepEqual(
  new Set(usage.story.sceneIds),
  new Set(["scene-1", "scene-2"]),
);
assert.deepEqual(
  new Set(usage.story.sectionIds),
  new Set(["section-1", "section-2"]),
);
assert.deepEqual(new Set(usage.fileIds), new Set(["file-live", "file-target"]));

const filteredState = buildFilteredStateForExport(repositoryState, usage);
const projectData = constructProjectData(filteredState);
const fileEntries = usage.fileIds.map((fileId) => ({
  fileId,
  mimeType: "image/png",
}));
const bundlePayload = createBundleInstructions({
  projectData,
  bundler: {
    appVersion: "test-export-pipeline",
  },
  project: {
    namespace: "test-project",
  },
});

let savedZipBlob;
let savedZipName;

globalThis.fetch = async (input, init) => {
  if (input === "/bundle/index.html") {
    return new Response("<!doctype html><html><body>bundle</body></html>");
  }

  if (input === "/bundle/main.js") {
    return new Response("console.log('bundle runtime');");
  }

  return originalFetch(input, init);
};

try {
  const service = createProjectExportService({
    fileAdapter: {
      createDistributionZipStreamed: async ({
        projectData,
        fileEntries,
        zipName,
        filePicker,
        staticFiles,
        getFileContent,
      }) => {
        const files = {};
        for (const fileEntry of fileEntries) {
          const content = await getFileContent(fileEntry.id);
          try {
            const response = await fetch(content.url);
            const buffer = await response.arrayBuffer();
            files[fileEntry.id] = {
              buffer: new Uint8Array(buffer),
              mime:
                content.type ||
                fileEntry.mimeType ||
                "application/octet-stream",
            };
          } finally {
            content.revoke?.();
          }
        }

        const { bundle } = await createBundleResult(projectData, files);
        const zip = new JSZip();
        zip.file("package.bin", bundle);
        if (staticFiles.indexHtml) zip.file("index.html", staticFiles.indexHtml);
        if (staticFiles.mainJs) zip.file("main.js", staticFiles.mainJs);

        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: {
            level: 6,
          },
        });

        await filePicker.saveFilePicker(zipBlob, `${zipName}.zip`);
        return `${zipName}.zip`;
      },
      promptDistributionZipPath: async () => {
        throw new Error("promptDistributionZipPath is not used in this test.");
      },
      createDistributionZipStreamedToPath: async () => {
        throw new Error(
          "createDistributionZipStreamedToPath is not used in this test.",
        );
      },
    },
    filePicker: {
      saveFilePicker: async (blob, filename) => {
        savedZipBlob = blob;
        savedZipName = filename;
        return filename;
      },
    },
    getCurrentReference: () => ({
      projectPath: "/tmp/test-project",
    }),
    getFileContent: async (fileId) => ({
      url: createDataUrl(fileBytesById[fileId], "image/png"),
      type: "image/png",
    }),
  });

  await service.createDistributionZipStreamed(
    bundlePayload,
    fileEntries,
    "test-export",
  );

  assert.equal(savedZipName, "test-export.zip");
  assert.ok(savedZipBlob instanceof Blob);

  const zip = await JSZip.loadAsync(await savedZipBlob.arrayBuffer());
  assert.ok(zip.file("package.bin"));
  assert.ok(zip.file("index.html"));
  assert.ok(zip.file("main.js"));
  const indexHtml = await zip.file("index.html").async("string");
  assert.ok(!indexHtml.includes("/@vite/client"));

  const packageBin = await zip.file("package.bin").async("arraybuffer");
  const parsed = await parseBundle(packageBin);

  assert.equal(
    parsed.instructions.bundleMetadata.project.namespace,
    "test-project",
  );
  assert.equal(
    parsed.instructions.bundleMetadata.bundler.appVersion,
    "test-export-pipeline",
  );

  assert.deepEqual(
    Object.keys(parsed.instructions.projectData.story.scenes).sort(),
    ["scene-1", "scene-2"],
  );
  assert.deepEqual(Object.keys(parsed.assets).sort(), [
    "file-live",
    "file-target",
  ]);
  assert.equal(parsed.assets["file-dead"], undefined);

  assert.deepEqual(
    Array.from(parsed.assets["file-live"].buffer),
    Array.from(fileBytesById["file-live"]),
  );
  assert.deepEqual(
    Array.from(parsed.assets["file-target"].buffer),
    Array.from(fileBytesById["file-target"]),
  );
  assert.deepEqual(
    parsed.manifest.assets["file-live"].chunks,
    parsed.manifest.assets["file-target"].chunks,
  );
  assert.equal(parsed.manifest.assets["file-live"].chunks.length, 1);
  const totalChunkReferences =
    Object.values(parsed.manifest.assets).reduce(
      (sum, asset) => sum + (asset?.chunks?.length ?? 0),
      0,
    ) + (parsed.manifest.instructions?.chunks?.length ?? 0);
  assert.ok(Object.keys(parsed.manifest.chunks).length < totalChunkReferences);

  expectEngineInitToSucceed(parsed.instructions.projectData);

  console.log("export bundle pipeline ok");
  console.log(
    JSON.stringify(
      {
        zipName: savedZipName,
        scenes: Object.keys(parsed.instructions.projectData.story.scenes),
        assets: Object.keys(parsed.assets),
      },
      null,
      2,
    ),
  );
} finally {
  globalThis.fetch = originalFetch;
}
