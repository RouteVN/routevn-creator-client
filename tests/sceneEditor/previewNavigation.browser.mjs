// Run against the existing web watch server. Uses generated media and an
// in-memory project so no saved projects or user assets are changed.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.SCENE_EDITOR_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const source = `/@fs/${process.cwd().replaceAll("\\", "/")}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.route(`${origin}/preview-navigation-test`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<div id="canvas" style="width:160px;height:90px"></div>',
    }),
  );
  await page.goto(`${origin}/preview-navigation-test`);
  await page.evaluate(async (source) => {
    const { createGraphicsService } = await import(
      `${source}/src/deps/services/graphicsService.js`
    );
    const { renderSceneEditorState } = await import(
      `${source}/src/internal/ui/sceneEditor/runtime.js`
    );
    const sampleRate = 8000;
    const sampleCount = sampleRate * 5;
    const wav = new ArrayBuffer(44 + sampleCount * 2);
    const bytes = new Uint8Array(wav);
    const view = new DataView(wav);
    const writeText = (offset, value) => {
      bytes.set(new TextEncoder().encode(value), offset);
    };
    writeText(0, "RIFF");
    view.setUint32(4, wav.byteLength - 8, true);
    writeText(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    const projectData = {
      screen: { width: 160, height: 90, backgroundColor: "#000000" },
      resources: {
        images: {},
        videos: {},
        sounds: {
          "sound-one": { fileId: "sound-file", fileType: "audio/wav" },
          "sound-two": { fileId: "replacement-file", fileType: "audio/wav" },
        },
        fonts: {},
        colors: {
          red: { hex: "#ff0000" },
          blue: { hex: "#0000ff" },
        },
        textStyles: {},
        controls: {
          "control-one": {
            elements: [
              {
                id: "advance",
                type: "rect",
                x: 0,
                y: 0,
                width: 160,
                height: 90,
                click: { payload: { actions: { nextLine: {} } } },
              },
            ],
          },
        },
        transforms: {},
        characters: {},
        animations: {},
        variables: {},
        audioEffects: {
          fade: {
            type: "transition",
            prev: { volume: { keyframes: [{ value: 0, duration: 1000 }] } },
            next: {
              volume: {
                initialValue: 0,
                keyframes: [{ value: 100, delay: 800, duration: 1000 }],
              },
            },
          },
        },
        layouts: {
          dialogue: {
            id: "dialogue",
            layoutType: "dialogue",
            elements: [
              {
                id: "dialogue-text",
                type: "text",
                content: "${dialogue.content[0].text}",
              },
            ],
          },
        },
      },
      story: {
        initialSceneId: "scene-one",
        scenes: {
          "scene-one": {
            initialSectionId: "section-one",
            sections: {
              "section-one": {
                initialLineId: "line-one",
                lines: [
                  {
                    id: "line-one",
                    actions: {
                      background: { colorId: "red" },
                      control: {
                        resourceId: "control-one",
                        resourceType: "control",
                      },
                      dialogue: {
                        mode: "adv",
                        ui: { resourceId: "dialogue" },
                        content: [{ text: "Line One" }],
                      },
                      bgm: {
                        loop: true,
                        interruption: "immediate",
                        sounds: [
                          {
                            id: "sound-one",
                            resourceId: "sound-one",
                            loop: false,
                            volume: 100,
                          },
                        ],
                        audioEffects: { resourceId: "fade" },
                      },
                    },
                  },
                  {
                    id: "line-two",
                    actions: {
                      background: { colorId: "blue" },
                      dialogue: { content: [{ text: "Line Two" }] },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };
    let selectedLineId = "line-one";
    let isMuted = false;
    let previewKey;
    let previousPresentationState = {};
    const subject = { dispatch() {} };
    const service = await createGraphicsService({ subject });
    const canvasRoot = document.querySelector("#canvas");
    await service.init({ canvas: canvasRoot, width: 160, height: 90 });
    const warnings = [];
    const deps = {
      graphicsService: service,
      subject,
      refs: { previewCanvasHost: { getCanvasRoot: () => canvasRoot } },
      render() {},
      appService: { showAlert: (warning) => warnings.push(warning) },
      projectService: {
        getRepositoryState: () => ({}),
        getFileContent: async () => ({ url, buffer: wav, type: "audio/wav" }),
      },
      store: {
        selectSceneId: () => "scene-one",
        selectSelectedSectionId: () => "section-one",
        selectSelectedLineId: () => selectedLineId,
        selectProjectData: () => projectData,
        selectTemporaryPresentationState: () => ({}),
        selectPreviousPresentationState: () => previousPresentationState,
        selectIsMuted: () => isMuted,
        selectCanvasAudioPreviewKey: () => previewKey,
        setCanvasAudioPreviewKey: ({ previewKey: value }) => {
          previewKey = value;
        },
        setPresentationState() {},
        selectWarnedAssetFileIds: () => [],
        markAssetWarningsShown() {},
      },
    };
    window.selectLine = async (lineId) => {
      selectedLineId = lineId;
      await renderSceneEditorState(deps, {
        skipAnimations: true,
        preserveAnimationPlayback: true,
      });
    };
    window.setMuted = (value) => {
      isMuted = value;
      return window.selectLine(selectedLineId);
    };
    window.replaceSound = () => {
      projectData.story.scenes["scene-one"].sections[
        "section-one"
      ].lines[0].actions.bgm.sounds[0].resourceId = "sound-two";
      return window.selectLine("line-one");
    };
    window.setPreviousMusic = (id = "sound-one") => {
      previousPresentationState = {
        bgm: {
          loop: true,
          sounds: [{ id, resourceId: "sound-one", volume: 100 }],
        },
      };
      return window.selectLine("line-one");
    };
    window.readAudioSource = () =>
      service.engineSelectRenderState().audio[0].children[0].src;
    window.readPixel = async () => {
      const image = new Image();
      image.src = await service.extractBase64();
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [...context.getImageData(150, 80, 1, 1).data];
    };
    window.readDialogue = () =>
      service.engineSelectPresentationState().dialogue.content[0].text;
    window.readWarnings = () => warnings;
    window.cleanup = async () => {
      await service.destroy();
      URL.revokeObjectURL(url);
    };
  }, source);

  const expectPixel = async (pixel) => {
    await page.waitForFunction(
      async (expected) => JSON.stringify(await window.readPixel()) === expected,
      JSON.stringify(pixel),
    );
  };
  await page.evaluate(() => window.selectLine("line-one"));
  await expectPixel([255, 0, 0, 255]);
  const expectReturnAndAdvance = async () => {
    await page.evaluate(() => window.selectLine("line-two"));
    await expectPixel([0, 0, 255, 255]);
    await page.evaluate(() => window.selectLine("line-one"));
    await expectPixel([255, 0, 0, 255]);
    assert.equal(await page.evaluate(() => window.readDialogue()), "Line One");
    await page.locator("canvas").click({ position: { x: 150, y: 80 } });
    await page.waitForFunction(() => window.readDialogue() === "Line Two");
    await expectPixel([0, 0, 255, 255]);
  };
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await expectReturnAndAdvance();
  }
  await page.evaluate(() => window.setMuted(true));
  await expectReturnAndAdvance();
  await page.evaluate(() => window.setMuted(false));
  await expectReturnAndAdvance();
  await page.evaluate(() => window.replaceSound());
  await expectPixel([255, 0, 0, 255]);
  assert.equal(
    await page.evaluate(() => window.readAudioSource()),
    "replacement-file",
  );
  await expectReturnAndAdvance();
  await page.evaluate(() => window.setPreviousMusic());
  await expectReturnAndAdvance();
  await page.evaluate(() => window.setMuted(true));
  await expectReturnAndAdvance();
  await page.evaluate(() => window.setMuted(false));
  await expectReturnAndAdvance();
  await page.evaluate(() => window.setPreviousMusic("previous-sound"));
  await expectReturnAndAdvance();
  assert.deepEqual(await page.evaluate(() => window.readWarnings()), []);
  await page.evaluate(() => window.cleanup());
  assert.deepEqual(errors, []);
  console.log(
    "Scene preview: repeated BGM fade returns, crossfades, mute/unmute and source replacement repaint and advance.",
  );
} finally {
  await browser.close();
}
