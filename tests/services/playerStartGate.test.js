import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { waitForPlayerStart } from "../../scripts/playerStartGate.js";

describe("player start gate", () => {
  it("waits for a click before starting the web player", async () => {
    const dom = new JSDOM('<div id="loading">Loading...</div>');
    const loadingElement = dom.window.document.querySelector("#loading");
    let didStart = false;

    const startPromise = waitForPlayerStart({
      loadingElement,
      startMode: "click",
    }).then(() => {
      didStart = true;
    });

    await Promise.resolve();
    expect(didStart).toBe(false);
    expect(loadingElement.textContent).toBe("Click to start");
    expect(loadingElement.classList.contains("ready")).toBe(true);

    loadingElement.click();
    await startPromise;

    expect(loadingElement.textContent).toBe("Click to start");
    expect(loadingElement.classList.contains("ready")).toBe(false);
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
