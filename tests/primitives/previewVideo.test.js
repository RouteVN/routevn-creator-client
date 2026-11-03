// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  PREVIEW_VIDEO_LOOP_GAP_MS,
  PREVIEW_VIDEO_STALL_CHECK_MS,
  PREVIEW_VIDEO_STALL_MS,
  PREVIEW_VIDEO_TAG_NAME,
  PreviewVideoElement,
} from "../../src/primitives/previewVideo.js";

// jsdom has no IntersectionObserver and does not play media.
class TestIntersectionObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    TestIntersectionObserver.instances.push(this);
  }

  observe(target) {
    this.targets.push(target);
  }

  disconnect() {
    this.targets = [];
  }

  report(isIntersecting) {
    this.callback(this.targets.map(() => ({ isIntersecting })));
  }
}

const stubMedia = (video) => {
  const media = {
    paused: true,
    currentTime: 0,
    duration: 1,
    readyState: 4,
    seeking: false,
    showFrame: undefined,
  };
  Object.defineProperty(video, "paused", { get: () => media.paused });
  Object.defineProperty(video, "duration", { get: () => media.duration });
  Object.defineProperty(video, "seeking", { get: () => media.seeking });
  Object.defineProperty(video, "readyState", { get: () => media.readyState });
  Object.defineProperty(video, "currentTime", {
    get: () => media.currentTime,
    set: (value) => {
      media.currentTime = value;
    },
  });
  video.play = vi.fn(() => {
    media.paused = false;
    return Promise.resolve();
  });
  video.pause = vi.fn(() => {
    media.paused = true;
  });
  video.load = vi.fn();
  video.requestVideoFrameCallback = vi.fn((callback) => {
    media.showFrame = (mediaTime) => {
      media.currentTime = mediaTime;
      callback(0, { mediaTime });
    };
    return 1;
  });
  video.cancelVideoFrameCallback = vi.fn();
  return media;
};

const observerFor = (element) =>
  TestIntersectionObserver.instances.find((observer) =>
    observer.targets.includes(element),
  );

describe("preview video", () => {
  let element;
  let media;

  beforeAll(() => {
    globalThis.IntersectionObserver = TestIntersectionObserver;
    customElements.define(PREVIEW_VIDEO_TAG_NAME, PreviewVideoElement);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    TestIntersectionObserver.instances = [];
    element = document.createElement(PREVIEW_VIDEO_TAG_NAME);
    media = stubMedia(element.video);
    element.setAttribute("src", "blob:preview");
    element.setAttribute("label", "Crossfade");
    document.body.append(element);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("plays a muted video only while it is on screen", () => {
    const { video } = element;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(false);
    expect(video.getAttribute("src")).toBe("blob:preview");
    expect(video.getAttribute("aria-label")).toBe("Crossfade");
    expect(video.play).not.toHaveBeenCalled();

    observerFor(element).report(true);
    expect(video.play).toHaveBeenCalledTimes(1);

    observerFor(element).report(false);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it("pauses while it has the paused attribute", () => {
    observerFor(element).report(true);
    element.setAttribute("paused", "");
    expect(element.video.pause).toHaveBeenCalledTimes(1);

    element.removeAttribute("paused");
    expect(element.video.play).toHaveBeenCalledTimes(2);
  });

  it("holds its last frame for the loop gap, then plays from the start", () => {
    observerFor(element).report(true);
    media.currentTime = 1;
    media.paused = true;
    element.video.dispatchEvent(new Event("ended"));

    vi.advanceTimersByTime(PREVIEW_VIDEO_LOOP_GAP_MS - 1);
    expect(media.currentTime).toBe(1);
    expect(element.video.play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(media.currentTime).toBe(0);
    expect(element.video.play).toHaveBeenCalledTimes(2);
  });

  it("ends a video held on its last frame for one frame", () => {
    observerFor(element).report(true);
    for (const mediaTime of [0.9, 0.92, 0.94, 0.96, 0.98]) {
      media.showFrame(mediaTime);
    }
    vi.advanceTimersByTime(19);
    expect(element.video.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(element.video.pause).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(0.98);

    vi.advanceTimersByTime(PREVIEW_VIDEO_LOOP_GAP_MS);
    expect(media.currentTime).toBe(0);
    expect(element.video.play).toHaveBeenCalledTimes(2);
  });

  it("ends a video whose time stops moving", () => {
    observerFor(element).report(true);
    media.currentTime = 2.64;

    vi.advanceTimersByTime(PREVIEW_VIDEO_STALL_CHECK_MS);
    vi.advanceTimersByTime(PREVIEW_VIDEO_STALL_MS);
    expect(element.video.pause).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(PREVIEW_VIDEO_LOOP_GAP_MS);
    expect(media.currentTime).toBe(0);
    expect(element.video.play).toHaveBeenCalledTimes(2);
  });

  it("does not end a video that keeps showing frames", () => {
    observerFor(element).report(true);
    for (const mediaTime of [0.94, 0.96, 0.98]) {
      media.showFrame(mediaTime);
      vi.advanceTimersByTime(10);
    }
    expect(element.video.pause).not.toHaveBeenCalled();
  });

  it("leaves a video alone while its time moves", () => {
    observerFor(element).report(true);
    for (let step = 1; step <= 10; step += 1) {
      media.currentTime = step * 0.05;
      vi.advanceTimersByTime(PREVIEW_VIDEO_STALL_CHECK_MS);
    }
    expect(media.currentTime).toBe(0.5);
    expect(element.video.play).toHaveBeenCalledTimes(1);
  });

  it("does not restart a paused video", () => {
    observerFor(element).report(true);
    media.paused = true;
    media.currentTime = 1;
    vi.advanceTimersByTime(PREVIEW_VIDEO_STALL_MS * 4);
    expect(media.currentTime).toBe(1);
  });

  it("stops and releases the video when removed", () => {
    observerFor(element).report(true);
    element.remove();

    expect(element.video.pause).toHaveBeenCalledTimes(1);
    expect(element.video.hasAttribute("src")).toBe(false);
    expect(element.video.load).toHaveBeenCalledTimes(1);
    expect(element.video.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe("with the hover attribute", () => {
    let card;
    let hoverElement;
    let hoverMedia;

    const pointer = (type, pointerType) =>
      card.dispatchEvent(Object.assign(new Event(type), { pointerType }));

    beforeEach(() => {
      // The card is outside the shadow root that holds the video, as in a
      // component's view.
      card = document.createElement("div");
      card.dataset.previewHover = "true";
      card.tabIndex = 0;
      const holder = document.createElement("div");
      card.append(holder);
      hoverElement = document.createElement(PREVIEW_VIDEO_TAG_NAME);
      hoverMedia = stubMedia(hoverElement.video);
      hoverMedia.duration = 3;
      hoverElement.setAttribute("hover", "");
      hoverElement.setAttribute("src", "blob:thumbnail");
      holder.attachShadow({ mode: "open" }).append(hoverElement);
      document.body.append(card);
      observerFor(hoverElement).report(true);
    });

    it("rests a third of the way in and plays from the start under a mouse", () => {
      const { video } = hoverElement;
      video.dispatchEvent(new Event("durationchange"));
      expect(hoverMedia.currentTime).toBe(1);
      expect(video.play).not.toHaveBeenCalled();

      pointer("pointerenter", "mouse");
      expect(hoverMedia.currentTime).toBe(0);
      expect(video.play).toHaveBeenCalledTimes(1);

      hoverMedia.currentTime = 0.4;
      pointer("pointerleave", "mouse");
      expect(video.pause).toHaveBeenCalledTimes(1);
      expect(hoverMedia.currentTime).toBe(1);
    });

    it("rests and stays still when the mouse leaves between loops", () => {
      const { video } = hoverElement;
      pointer("pointerenter", "mouse");
      hoverMedia.currentTime = 3;
      hoverMedia.paused = true;
      video.dispatchEvent(new Event("ended"));

      pointer("pointerleave", "mouse");
      expect(hoverMedia.currentTime).toBe(1);
      vi.advanceTimersByTime(PREVIEW_VIDEO_LOOP_GAP_MS);
      expect(hoverMedia.currentTime).toBe(1);
      expect(video.play).toHaveBeenCalledTimes(1);
    });

    it("does not play for a touch", () => {
      pointer("pointerenter", "touch");
      expect(hoverElement.video.play).not.toHaveBeenCalled();
    });

    it("plays while its card has keyboard focus", () => {
      vi.spyOn(card, "matches").mockReturnValue(true);
      card.focus();
      expect(card.matches).toHaveBeenCalledWith(":focus-visible");
      expect(hoverElement.video.play).toHaveBeenCalledTimes(1);

      card.blur();
      expect(hoverElement.video.pause).toHaveBeenCalledTimes(1);
    });

    it("finds the length of a video that does not state it", () => {
      hoverMedia.duration = Infinity;
      hoverElement.video.dispatchEvent(new Event("durationchange"));
      expect(hoverMedia.currentTime).toBe(Number.MAX_SAFE_INTEGER);

      hoverMedia.duration = 6;
      hoverElement.video.dispatchEvent(new Event("durationchange"));
      expect(hoverMedia.currentTime).toBe(2);
    });

    it("stops listening to its card when removed", () => {
      card.remove();
      pointer("pointerenter", "mouse");
      expect(hoverElement.video.play).not.toHaveBeenCalled();
    });
  });
});
