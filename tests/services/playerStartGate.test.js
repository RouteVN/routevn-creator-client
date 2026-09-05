import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { waitForPlayerStart } from "../../scripts/playerStartGate.js";
import { BUNDLE_PLAYER_INDEX_HTML } from "../../src/deps/services/shared/projectExportService.js";

const createWebPlayer = (touch = false) => {
  const dom = new JSDOM(BUNDLE_PLAYER_INDEX_HTML);
  dom.window.matchMedia = vi.fn(() => ({ matches: touch }));
  return dom;
};

describe("player start gate", () => {
  it("waits for a click before starting the web player", async () => {
    const dom = createWebPlayer();
    const loadingElement = dom.window.document.querySelector("#loading");
    const startButton = loadingElement.querySelector("#loading-start");
    const progress = loadingElement.querySelector(".loading-progress");
    let didStart = false;

    const startPromise = waitForPlayerStart({
      loadingElement,
      startMode: "click",
    }).then(() => {
      didStart = true;
    });

    await Promise.resolve();
    expect(didStart).toBe(false);
    expect(startButton.textContent).toBe("Click to start");
    expect(startButton.disabled).toBe(false);
    expect(progress.inert).toBe(true);
    expect(progress.getAttribute("aria-hidden")).toBe("true");
    expect(loadingElement.classList.contains("ready")).toBe(true);

    startButton.click();
    await startPromise;

    expect(startButton.disabled).toBe(true);
    expect(didStart).toBe(true);
    expect(loadingElement.querySelector("#loading-label").textContent).toBe(
      "Loading…",
    );
    expect(loadingElement.querySelector("#loading-progress").value).toBe(0);
    expect(loadingElement.classList.contains("ready")).toBe(true);
    dom.window.close();
  });

  it("uses the touch prompt and accepts a click anywhere on the ready surface", async () => {
    const dom = createWebPlayer(true);
    const loadingElement = dom.window.document.querySelector("#loading");
    const startPromise = waitForPlayerStart({
      loadingElement,
      startMode: "click",
    });

    expect(loadingElement.querySelector("#loading-start").textContent).toBe(
      "Tap to start",
    );
    loadingElement.click();
    await startPromise;

    expect(loadingElement.classList.contains("ready")).toBe(true);
    dom.window.close();
  });

  it("starts native players without showing or waiting on the gate", async () => {
    const dom = new JSDOM('<div id="loading"></div>');
    const loadingElement = dom.window.document.querySelector("#loading");

    await waitForPlayerStart({
      loadingElement,
      startMode: "automatic",
    });

    expect(loadingElement.textContent).toBe("");
    expect(loadingElement.classList.contains("ready")).toBe(false);
    dom.window.close();
  });
});
