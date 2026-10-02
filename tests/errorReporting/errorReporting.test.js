import { afterEach, describe, expect, it, vi } from "vitest";
import { getClient } from "@sentry/browser";
import { scrubErrorEvent } from "../../src/deps/clients/tauri/errorReporting.js";
import { createErrorReporter } from "../../src/deps/clients/errorReporting.js";
import { createWebErrorReporter } from "../../src/deps/clients/web/errorReporting.js";

const TEST_DSN =
  "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1";

// Collect the events the current SDK client would send, instead of sending
// them, so tests exercise the SDK's full event pipeline including beforeSend.
const collectSentEvents = () => {
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

vi.hoisted(() => {
  globalThis.__ROUTEVN_ERROR_REPORTING__ = Object.freeze({
    dsn: "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1",
    release: "app-one@1.0.0",
    environment: "development",
    dist: "test-build",
  });
});

describe("desktop error reporting", () => {
  it("initializes the official SDK with the native build configuration", () => {
    expect(getClient().getOptions()).toMatchObject({
      ...globalThis.__ROUTEVN_ERROR_REPORTING__,
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      sendClientReports: false,
      enableLogs: false,
      enableMetrics: false,
    });
  });

  it("keeps useful error locations without sending private event data", () => {
    const event = scrubErrorEvent({
      event_id: "event-one",
      release: "user@example.com",
      environment: "Bearer secret-token",
      dist: "secret-password",
      message: "Bearer secret-token for user@example.com",
      request: {
        headers: { Authorization: "Bearer secret-token" },
        data: { password: "secret-password" },
      },
      user: { email: "user@example.com" },
      extra: { response: { access_token: "secret-token" } },
      breadcrumbs: [{ data: { cookie: "secret-cookie" } }],
      exception: {
        values: [
          {
            type: "TypeError",
            value: '{"email":"user@example.com"}',
            mechanism: {
              type: "auto.browser.global_handlers.onerror",
              handled: false,
              data: { url: "file:///Users/user@example.com/app/main.js" },
            },
            stacktrace: {
              frames: [
                {
                  filename:
                    "file:///Users/user@example.com/app/main.js?token=secret-token",
                  function: "loadProject",
                  lineno: 42,
                  colno: 2,
                  vars: { password: "secret-password" },
                  context_line: "password=secret-password",
                },
                { filename: "main.js", function: "?", lineno: 7, colno: 1 },
              ],
            },
          },
        ],
      },
    });

    expect(event.release).toBe("app-one@1.0.0");
    expect(event.environment).toBe("development");
    expect(event.dist).toBe("test-build");
    expect(event.exception.values[0].type).toBe("TypeError");
    expect(event.exception.values[0].stacktrace.frames[0]).toEqual({
      filename: "main.js",
      function: "loadProject",
      lineno: 42,
      colno: 2,
      in_app: undefined,
    });
    expect(event.exception.values[0].stacktrace.frames[1].function).toBe(
      undefined,
    );
    expect(event.exception.values[0].mechanism).toEqual({
      type: "auto.browser.global_handlers.onerror",
      handled: false,
    });
    const encoded = JSON.stringify(event);
    expect(encoded).not.toContain("user@example.com");
    expect(encoded).not.toContain("secret-token");
    expect(encoded).not.toContain("secret-password");
    expect(encoded).not.toContain("secret-cookie");
  });

  it("stops sending after the per-session event limit", () => {
    const { beforeSend } = getClient().getOptions();
    const sent = Array.from({ length: 12 }, () =>
      beforeSend({ exception: { values: [{ type: "TypeError" }] } }),
    );

    expect(sent.filter(Boolean)).toHaveLength(10);
    expect(sent.at(-1)).toBe(null);
  });
});

describe("explicit error reporting", () => {
  // No DSN, so this reporter never replaces the SDK client initialized above.
  const webReporter = createErrorReporter({
    runtime: "web",
    captureGlobal: false,
  });

  it("keeps only stable identifiers from explicit reports", () => {
    const event = webReporter.scrubErrorEvent({
      event_id: "event-one",
      tags: {
        runtime: "web",
        operation: "project.open",
        code: "Bearer secret-token for user@example.com",
      },
      exception: {
        values: [
          {
            type: "ProjectError",
            value: "user@example.com",
            mechanism: { type: "routevn.capture", handled: true },
          },
        ],
      },
    });

    expect(event.tags).toEqual({ runtime: "web", operation: "project.open" });
    expect(event.message).toBe("<email>");
    expect(event.exception.values[0].mechanism.handled).toBe(true);
    expect(JSON.stringify(event)).not.toContain("user@example.com");
    expect(JSON.stringify(event)).not.toContain("secret-token");
  });

  it("ignores explicit reports when no DSN is configured", () => {
    expect(() => webReporter.capture(new Error("secret"))).not.toThrow();
  });
});

// Each test initializes its own SDK client, replacing the desktop one above.
describe("explicit error reporting through the SDK", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("caps explicit reports separately from uncaught errors", async () => {
    const reporter = createErrorReporter({
      dsn: TEST_DSN,
      runtime: "tauri",
      captureGlobal: true,
    });
    const events = collectSentEvents();

    for (let index = 0; index < 12; index += 1) {
      reporter.capture(new Error(`save failed ${index}`), {
        operation: "resourcePage.mutation",
      });
    }
    globalThis.onerror("Uncaught Error: crash", "main.js", 1, 1, new Error());
    await reporter.flush();

    const explicit = events.filter((event) => event.tags.operation);
    const uncaught = events.filter((event) => !event.tags.operation);
    expect(explicit).toHaveLength(10);
    expect(uncaught).toHaveLength(1);
    expect(uncaught[0].exception.values[0].mechanism).toEqual({
      type: "auto.browser.global_handlers.onerror",
      handled: false,
    });
  });

  it("reports non-Error values by kind without contents or a stack", async () => {
    const reporter = createErrorReporter({
      dsn: TEST_DSN,
      runtime: "tauri",
      captureGlobal: false,
    });
    const events = collectSentEvents();
    class CommandFailure {
      path = "/Users/user@example.com/Project One";
    }

    reporter.capture("unable to open /Users/user@example.com/project.db", {
      operation: "route.projectOpen",
    });
    reporter.capture(
      { code: "ENOENT", message: "missing /Users/user@example.com" },
      { operation: "route.projectOpen" },
    );
    reporter.capture(new CommandFailure(), { operation: "route.projectOpen" });
    await reporter.flush();

    expect(events.map((event) => event.tags)).toEqual([
      { runtime: "tauri", operation: "route.projectOpen", valueKind: "string" },
      {
        runtime: "tauri",
        operation: "route.projectOpen",
        code: "ENOENT",
        valueKind: "object",
      },
      {
        runtime: "tauri",
        operation: "route.projectOpen",
        valueKind: "CommandFailure",
      },
    ]);
    const kinds = ["string", "object", "CommandFailure"];
    for (const [index, event] of events.entries()) {
      expect(event.message).toBe(`Non-error ${kinds[index]}`);
      expect(event.exception.values).toEqual([
        {
          type: "NonErrorValue",
          value: `Non-error ${kinds[index]}`,
          mechanism: { type: "routevn.capture", handled: true },
          stacktrace: undefined,
        },
      ]);
    }
    expect(JSON.stringify(events)).not.toContain("user@example.com");
  });

  it("tags web reports with the web build's dist", async () => {
    vi.stubEnv("VITE_ROUTEVN_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("VITE_ROUTEVN_SENTRY_ENVIRONMENT", "production");
    vi.stubEnv("VITE_ROUTEVN_SENTRY_DIST", "0123456789ab-web");
    const reporter = createWebErrorReporter({ release: "app-one@1.0.0" });
    const events = collectSentEvents();

    reporter.capture(new Error("secret"), { operation: "route.projectOpen" });
    await reporter.flush();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      release: "app-one@1.0.0",
      environment: "production",
      dist: "0123456789ab-web",
      tags: { runtime: "web", operation: "route.projectOpen" },
    });
    expect(getClient().getOptions().dist).toBe("0123456789ab-web");
  });

  it("keeps source map debug IDs only for files in the sent stack", async () => {
    const mainDebugId = "0F6B1C3E-2A4D-4C8B-9E7F-1A2B3C4D5E6F";
    // Registered the way the injected build snippet does: stack -> debug ID.
    globalThis._sentryDebugIds = {
      "Error\n    at https://app.test/public/main.js?v=1:1:10": mainDebugId,
      "Error\n    at https://app.test/public/chunks/other-abc.js:1:10":
        "11111111-2222-4333-8444-555555555555",
    };
    try {
      const reporter = createErrorReporter({
        dsn: TEST_DSN,
        runtime: "web",
        captureGlobal: false,
      });
      const events = collectSentEvents();
      const error = new Error("secret");
      error.stack =
        "Error: secret\n    at openProject (https://app.test/public/main.js?v=1:1:2048)";

      reporter.capture(error, { operation: "route.projectOpen" });
      await reporter.flush();

      expect(events).toHaveLength(1);
      expect(events[0].exception.values[0].stacktrace.frames).toMatchObject([
        {
          filename: "main.js",
          function: "openProject",
          lineno: 1,
          colno: 2048,
        },
      ]);
      expect(events[0].debug_meta).toEqual({
        images: [
          {
            type: "sourcemap",
            code_file: "main.js",
            debug_id: mainDebugId.toLowerCase(),
          },
        ],
      });
      expect(JSON.stringify(events)).not.toContain("app.test");
    } finally {
      delete globalThis._sentryDebugIds;
    }
  });
});
