// Scene editor BGM audio effects against the real Route Engine and Route
// Graphics, with decoded audio in Chromium. Self-contained: no app server or
// user projects.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const source = process.cwd();
const fixtureEntry = `
import { renderSceneEditorState } from "${source}/src/internal/ui/sceneEditor/runtime.js";
import { createGraphicsService } from "${source}/src/deps/services/graphicsService.js";
window.renderSceneEditorState = renderSceneEditorState;
window.createGraphicsService = createGraphicsService;
`;

// Each step selects a line and renders it the way the scene editor does.
const runSteps = async () => {
  const createWav = (frequency) => {
    const sampleRate = 8000;
    const samples = sampleRate / 2;
    const view = new DataView(new ArrayBuffer(44 + samples * 2));
    const writeText = (offset, text) =>
      [...text].forEach((char, index) =>
        view.setUint8(offset + index, char.charCodeAt(0)),
      );
    writeText(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    writeText(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index += 1) {
      const value = Math.sin((2 * Math.PI * frequency * index) / sampleRate);
      view.setInt16(44 + index * 2, value * 8000, true);
    }
    return URL.createObjectURL(new Blob([view.buffer], { type: "audio/wav" }));
  };
  const fileUrls = {
    "old-file": createWav(330),
    "song-file": createWav(440),
  };
  const bgm = (resourceId, audioEffects) => ({
    bgm: { sounds: [{ id: "main", resourceId }], audioEffects },
  });
  const projectData = {
    screen: { width: 320, height: 180, backgroundColor: "#000000" },
    resources: {
      sounds: {
        old: { fileId: "old-file", fileType: "audio/wav" },
        song: { fileId: "song-file", fileType: "audio/wav" },
      },
      audioEffects: {
        fadeIn: {
          type: "transition",
          next: {
            volume: {
              initialValue: 0,
              keyframes: [{ value: 100, duration: 900 }],
            },
          },
        },
        crossfade: {
          type: "transition",
          prev: { volume: { keyframes: [{ value: 0, duration: 600 }] } },
          next: {
            volume: {
              initialValue: 0,
              keyframes: [{ value: 100, duration: 900 }],
            },
          },
        },
      },
    },
    story: {
      initialSceneId: "scene-1",
      scenes: {
        "scene-1": {
          initialSectionId: "fade",
          sections: {
            fade: {
              lines: [
                {
                  id: "fade-start",
                  actions: bgm("song", { resourceId: "fadeIn" }),
                },
                { id: "fade-after", actions: {} },
              ],
            },
            crossfade: {
              lines: [
                { id: "crossfade-before", actions: bgm("old") },
                {
                  id: "crossfade-start",
                  actions: bgm("song", { resourceId: "crossfade" }),
                },
                { id: "crossfade-after", actions: {} },
              ],
            },
          },
        },
      },
    },
  };
  // What the editor computes for the line before each selected line.
  const previousPresentationStates = {
    "fade-start": {},
    "fade-after": bgm("song"),
    "crossfade-start": bgm("old"),
    "crossfade-after": bgm("song"),
  };

  const canvas = document.querySelector("#canvas");
  const graphicsService = await window.createGraphicsService({
    subject: { dispatch() {} },
  });
  await graphicsService.init({ canvas, width: 320, height: 180 });
  let selection;
  let isMuted = false;
  let canvasAudioPreviewKey;
  let warnedAssetFileIds = [];
  const deps = {
    graphicsService,
    subject: { dispatch() {} },
    refs: {},
    render() {},
    appService: { showAlert() {}, showToast() {} },
    projectService: {
      getFileContent: async (fileId) => ({
        url: fileUrls[fileId],
        type: "audio/wav",
      }),
    },
    store: {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => selection.sectionId,
      selectSelectedLineId: () => selection.lineId,
      selectPreviousPresentationState: () =>
        previousPresentationStates[selection.lineId],
      selectProjectData: () => projectData,
      selectIsMuted: () => isMuted,
      selectCanvasAudioPreviewKey: () => canvasAudioPreviewKey,
      setCanvasAudioPreviewKey: ({ previewKey }) => {
        canvasAudioPreviewKey = previewKey;
      },
      setPresentationState() {},
      selectWarnedAssetFileIds: () => warnedAssetFileIds,
      markAssetWarningsShown: ({ fileIds }) => {
        warnedAssetFileIds = [...warnedAssetFileIds, ...fileIds];
      },
    },
  };

  const steps = [
    ["preview a fade-in from silence", "fade", "fade-start"],
    ["render the same line again", "fade", "fade-start"],
    ["move to the next line", "fade", "fade-after"],
    ["preview the fade-in while its BGM plays", "fade", "fade-start"],
    ["show a line after a crossfade", "crossfade", "crossfade-after"],
    ["preview the crossfade", "crossfade", "crossfade-start"],
    ["render the crossfade line again", "crossfade", "crossfade-start"],
    ["mute and select the fade-in line", "fade", "fade-start", true],
    ["render the muted line again", "fade", "fade-start", true],
  ];
  const results = [];
  for (const [name, sectionId, lineId, muted = false] of steps) {
    selection = { sectionId, lineId };
    isMuted = muted;
    try {
      await window.renderSceneEditorState(deps);
      results.push({ name, error: undefined });
    } catch (error) {
      results.push({ name, error: error.message });
    }
  }
  await graphicsService.destroy();
  return results;
};

const directory = await mkdtemp(join(tmpdir(), "rvn-audio-effect-preview-"));
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "fixture.js");
  await writeFile(entry, fixtureEntry);
  execFileSync("bun", [
    "build",
    entry,
    "--target",
    "browser",
    "--outfile",
    bundle,
  ]);
  const fixture = await readFile(bundle, "utf8");
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://fixture.test/**", (route) =>
    route.fulfill(
      new URL(route.request().url()).pathname === "/fixture.js"
        ? { contentType: "text/javascript", body: fixture }
        : {
            contentType: "text/html",
            body: '<div id="canvas"></div><script type="module" src="/fixture.js"></script>',
          },
    ),
  );
  await page.goto("https://fixture.test/");
  await page.waitForFunction(() => window.renderSceneEditorState);

  const results = await page.evaluate(runSteps);
  for (const { name, error } of results) {
    console.log(`${error ? "FAIL" : "ok  "} ${name}${error ? `: ${error}` : ""}`);
  }
  assert.deepEqual(
    results.filter(({ error }) => error),
    [],
    "every scene editor render should accept its audio effects",
  );
  assert.deepEqual(pageErrors, []);
  console.log("Scene editor audio effect previews: PASS");
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
