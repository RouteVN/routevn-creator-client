// Run with watch:ios: node tests/ios/graphicsAudioOutput.browser.mjs
// Uses real Web Audio and the published RouteGraphics package; no app DB/files.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const base = "/@fs" + fileURLToPath(new URL("../../src/", import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/ios-audio-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><div id="canvas"></div></body></html>',
    }),
  );
  await page.goto(origin + "/ios-audio-test");
  const result = await page.evaluate(async (base) => {
    const source = await (
      await fetch(base + "deps/services/graphicsService.js")
    ).text();
    const graphicsURL = source.match(
      /from\s+["']([^"']*\/route-graphics\.js[^"']*)["']/,
    )[1];
    const { configureAudioRuntime } = await import(graphicsURL);
    const { createMobileAudioRuntime } = await import(
      base + "deps/clients/mobileAudioRuntime.js"
    );
    const { createIOSGraphicsAudioOutput } = await import(
      base + "deps/clients/ios/graphicsAudioOutput.js"
    );
    const { createGraphicsService } = await import(
      base + "deps/services/graphicsService.js"
    );
    const runtime = createMobileAudioRuntime();
    const output = createIOSGraphicsAudioOutput({ runtime });
    configureAudioRuntime(output.graphicsRuntime);
    const graphics = await createGraphicsService({ audioOutput: output });
    const probe = new AudioContext();
    let assetURL;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      await graphics.init({
        width: 320,
        height: 180,
        canvas: document.querySelector("#canvas"),
      });
      const media = document.querySelector("audio");
      const track = media.srcObject.getAudioTracks()[0];
      const source = probe.createMediaStreamSource(media.srcObject);
      const analyser = probe.createAnalyser();
      const mute = probe.createGain();
      mute.gain.value = 0;
      source.connect(analyser);
      analyser.connect(mute);
      mute.connect(probe.destination);
      await probe.resume();
      const peak = () => {
        const values = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(values);
        return values.reduce(
          (peak, value) => Math.max(peak, Math.abs(value)),
          0,
        );
      };
      const sampleRate = 44100;
      const frames = sampleRate / 2;
      const wav = new ArrayBuffer(44 + frames * 2);
      const data = new DataView(wav);
      const text = (offset, value) =>
        [...value].forEach((c, i) =>
          data.setUint8(offset + i, c.charCodeAt(0)),
        );
      text(0, "RIFF");
      data.setUint32(4, wav.byteLength - 8, true);
      text(8, "WAVE");
      text(12, "fmt ");
      data.setUint32(16, 16, true);
      data.setUint16(20, 1, true);
      data.setUint16(22, 1, true);
      data.setUint32(24, sampleRate, true);
      data.setUint32(28, sampleRate * 2, true);
      data.setUint16(32, 2, true);
      data.setUint16(34, 16, true);
      text(36, "data");
      data.setUint32(40, frames * 2, true);
      for (let i = 0; i < frames; i++)
        data.setInt16(
          44 + i * 2,
          Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 8192,
          true,
        );
      assetURL = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      await graphics.loadAssets({ tone: { url: assetURL, type: "audio/wav" } });
      await graphics.ensureAudioAssetsLoaded(["tone"]);
      const render = (loop, id) =>
        graphics.render({
          elements: [],
          audio: [{ id, type: "sound", src: "tone", volume: 100, loop }],
        });
      render(true, "looping");
      await wait(300);
      const playingPeak = peak();
      graphics.render({ elements: [], audio: [] });
      await wait(250);
      const stoppedPeak = peak();
      render(false, "one-shot");
      await wait(250);
      const oneShotPeak = peak();
      await wait(650);
      const endedPeak = peak();
      window.routeVNSetAppActive(false);
      const backgroundPaused = media.paused;
      window.routeVNSetAppActive(true);
      await wait(100);
      const foregroundPlaying = !media.paused;
      await graphics.destroy();
      const removed =
        !media.isConnected && media.paused && track.readyState === "ended";
      await graphics.init({
        width: 320,
        height: 180,
        canvas: document.querySelector("#canvas"),
      });
      const reopened = document.querySelector("audio");
      source.disconnect();
      probe.createMediaStreamSource(reopened.srcObject).connect(analyser);
      // Destroy releases asset object URLs, just as it does for project files.
      assetURL = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      await graphics.loadAssets({ tone: { url: assetURL, type: "audio/wav" } });
      await graphics.ensureAudioAssetsLoaded(["tone"]);
      render(true, "reopened-loop");
      await wait(300);
      const reopenedPeak = peak();
      return {
        playingPeak,
        stoppedPeak,
        oneShotPeak,
        endedPeak,
        reopenedPeak,
        backgroundPaused,
        foregroundPlaying,
        removed,
        reopened: reopened !== media && !reopened.paused,
        nativeDestination:
          runtime.graphicsRuntime.context.destination.constructor.name,
      };
    } finally {
      await graphics.destroy();
      await runtime.dispose();
      await probe.close();
      if (assetURL) URL.revokeObjectURL(assetURL);
    }
  }, base);
  assert.ok(result.playingPeak > 0.05, JSON.stringify(result));
  assert.ok(result.oneShotPeak > 0.05, JSON.stringify(result));
  assert.ok(result.reopenedPeak > 0.05, JSON.stringify(result));
  assert.ok(result.stoppedPeak < 0.0001, JSON.stringify(result));
  assert.ok(result.endedPeak < 0.0001, JSON.stringify(result));
  for (const key of [
    "backgroundPaused",
    "foregroundPlaying",
    "removed",
    "reopened",
  ])
    assert.equal(result[key], true, key);
  assert.equal(result.nativeDestination, "AudioDestinationNode");
  console.log(
    "PASS: published scene engine plays through iOS media output, stops and ends silently, pauses in background, and releases/recreates its output.",
    result,
  );
} finally {
  await browser.close();
}
