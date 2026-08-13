import { describe, expect, it, vi } from "vitest";
import {
  forwardFormSubmitOnEnter,
  shouldSubmitFormOnEnter,
} from "../../src/internal/ui/resourcePages/formSubmitKeyDown.js";

const createEvent = ({
  key = "Enter",
  shiftKey = false,
  path = [{ tagName: "RTGL-INPUT" }],
} = {}) => ({
  key,
  shiftKey,
  composedPath: () => path,
  preventDefault: vi.fn(),
});

describe("resource dialog form Enter submission", () => {
  it("forwards Enter to the external submit handler", async () => {
    const deps = {};
    const event = createEvent();
    const submit = vi.fn(async () => {});

    await expect(
      forwardFormSubmitOnEnter({
        deps,
        payload: { _event: event },
        submit,
      }),
    ).resolves.toBe(true);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(deps);
  });

  it("keeps Enter available to textareas and section actions", () => {
    expect(
      shouldSubmitFormOnEnter(
        createEvent({ path: [{ tagName: "RTGL-TEXTAREA" }] }),
      ),
    ).toBe(false);
    expect(
      shouldSubmitFormOnEnter(
        createEvent({ path: [{ dataset: { sectionActionId: "add" } }] }),
      ),
    ).toBe(false);
  });

  it("ignores shifted Enter and unrelated keys", () => {
    expect(shouldSubmitFormOnEnter(createEvent({ shiftKey: true }))).toBe(
      false,
    );
    expect(shouldSubmitFormOnEnter(createEvent({ key: "Escape" }))).toBe(false);
  });
});
