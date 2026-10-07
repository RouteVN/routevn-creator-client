// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOLD_REPEAT_DELAY_MS,
  HOLD_REPEAT_INTERVAL_MS,
  installHoldRepeat,
} from "../../src/primitives/holdRepeat.js";

// jsdom has no PointerEvent.
class TestPointerEvent extends MouseEvent {}

const pointer = (target, type, init = {}) =>
  target.dispatchEvent(
    new TestPointerEvent(type, { bubbles: true, button: 0, ...init }),
  );

describe("hold repeat", () => {
  let uninstall;
  let button;
  let presses;

  beforeEach(() => {
    vi.useFakeTimers();
    uninstall = installHoldRepeat(document);
    button = document.createElement("button");
    button.dataset.holdRepeat = "true";
    document.body.append(button);
    presses = 0;
    button.addEventListener("hold-repeat", () => {
      presses += 1;
    });
  });

  afterEach(() => {
    uninstall();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("presses at once, then keeps pressing after a pause while held", () => {
    pointer(button, "pointerdown");
    expect(presses).toBe(1);

    vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS);
    expect(presses).toBe(1);
    vi.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 3);
    expect(presses).toBe(4);

    pointer(button, "pointerup");
    vi.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 5);
    expect(presses).toBe(4);
  });

  it("stops when the press leaves the button or is cancelled", () => {
    pointer(button, "pointerdown");
    vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS);
    pointer(button, "pointerleave", { bubbles: false });
    vi.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 5);
    expect(presses).toBe(2);

    pointer(button, "pointerdown");
    pointer(button, "pointercancel");
    vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 5);
    expect(presses).toBe(3);
  });

  it("stops when a re-render removes the held button", () => {
    pointer(button, "pointerdown");
    button.remove();
    vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 5);
    expect(presses).toBe(1);
  });

  it("presses once for a keyboard click, but not again for a pointer's click", () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(presses).toBe(1);

    pointer(button, "pointerdown");
    pointer(button, "pointerup");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(presses).toBe(2);
  });

  it("ignores disabled buttons, other mouse buttons, and buttons not opted in", () => {
    button.setAttribute("disabled", "");
    pointer(button, "pointerdown");
    button.removeAttribute("disabled");
    pointer(button, "pointerdown", { button: 2 });
    const plain = document.createElement("button");
    document.body.append(plain);
    plain.addEventListener("hold-repeat", () => {
      presses += 1;
    });
    pointer(plain, "pointerdown");

    vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 3);
    expect(presses).toBe(0);
  });
});
