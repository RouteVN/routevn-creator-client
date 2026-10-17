import { afterEach, describe, expect, it, vi } from "vitest";
import { getClient } from "@sentry/browser";
import { createErrorReporter } from "../../src/deps/clients/errorReporting.js";

const TEST_DSN =
  "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1";

const INTERRUPTED_PLAY_MESSAGES = [
  "The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22",
  "The play() request was interrupted by a call to pause().",
  "The play() request was interrupted by a new load request. https://goo.gl/LdLk22",
  "The play() request was interrupted because the media was removed from the document.",
  "The play() request was interrupted because the containing page was frozen.",
];

// The browser rejects `play()` asynchronously with a DOMException that has no
// stack, which the SDK reports as `Error: AbortError: <message>`.
const createStacklessAbortError = (message) => {
  const error = new DOMException(message, "AbortError");
  delete error.stack;
  expect("stack" in error).toBe(false);
  return error;
};

const createSentEvents = () => {
  const events = [];
  vi.spyOn(getClient().getTransport(), "send").mockImplementation(
    async (envelope) => {
      for (const [header, payload] of envelope[1]) {
        if (header.type === "event") {
          events.push(payload);
        }
      }
      return {};
    },
  );
  return events;
};

const rejectUnhandled = async (reporter, reason) => {
  globalThis.onunhandledrejection({ reason });
  await reporter.flush();
};

const createReporter = () =>
  createErrorReporter({
    dsn: TEST_DSN,
    runtime: "tauri",
    captureGlobal: true,
  });

describe("interrupted media playback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(INTERRUPTED_PLAY_MESSAGES)(
    "does not report an interrupted play() rejection with a stack: %s",
    async (message) => {
      const reporter = createReporter();
      const events = createSentEvents();

      await rejectUnhandled(reporter, new DOMException(message, "AbortError"));

      expect(events).toEqual([]);
    },
  );

  it.each(INTERRUPTED_PLAY_MESSAGES)(
    "does not report an interrupted play() rejection without a stack: %s",
    async (message) => {
      const reporter = createReporter();
      const events = createSentEvents();

      await rejectUnhandled(reporter, createStacklessAbortError(message));

      expect(events).toEqual([]);
    },
  );

  it("keeps other unhandled rejections visible", async () => {
    const reporter = createReporter();
    const events = createSentEvents();

    const aborted = [
      new DOMException("This operation was aborted", "AbortError"),
      new DOMException("The user aborted a request.", "AbortError"),
      createStacklessAbortError("The operation was aborted."),
    ];
    // A refused start needs a gesture; it is not an interruption.
    const refused = [
      new DOMException(
        "The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.",
        "NotAllowedError",
      ),
    ];
    const lookalikes = [
      new TypeError("The play() request was interrupted by a call to pause()."),
      new DOMException(
        "The play() request was interrupted by a call to pause().",
        "InvalidStateError",
      ),
      new Error("Failed to start video playback"),
    ];
    const reasons = [...aborted, ...refused, ...lookalikes];

    for (const reason of reasons) {
      globalThis.onunhandledrejection({ reason });
    }
    await reporter.flush();

    expect(events).toHaveLength(reasons.length);
    expect(events.map((event) => event.exception.values[0].type)).toEqual([
      "AbortError",
      "AbortError",
      "Error",
      "NotAllowedError",
      "TypeError",
      "InvalidStateError",
      "Error",
    ]);
  });

  it("reports an uncaught error that only repeats the message", async () => {
    const reporter = createReporter();
    const events = createSentEvents();

    globalThis.onerror(
      "AbortError: The play() request was interrupted by a call to pause().",
      "main.js",
      1,
      1,
      new Error(
        "AbortError: The play() request was interrupted by a call to pause().",
      ),
    );
    await reporter.flush();

    expect(events).toHaveLength(1);
    expect(events[0].exception.values[0].mechanism).toEqual({
      type: "auto.browser.global_handlers.onerror",
      handled: false,
    });
  });

  it("does not spend the session limit on interrupted playback", async () => {
    const reporter = createReporter();
    const events = createSentEvents();

    // Alternate messages: deduplication only drops back-to-back repeats.
    for (let index = 0; index < 12; index += 1) {
      globalThis.onunhandledrejection({
        reason: createStacklessAbortError(INTERRUPTED_PLAY_MESSAGES[index % 2]),
      });
    }
    globalThis.onunhandledrejection({ reason: new TypeError("crash") });
    await reporter.flush();

    expect(events).toHaveLength(1);
    expect(events[0].exception.values[0].type).toBe("TypeError");
  });
});
