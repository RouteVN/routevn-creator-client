import { describe, expect, it, vi } from "vitest";
import { getClient } from "@sentry/browser";
import { scrubErrorEvent } from "../../src/deps/clients/tauri/errorReporting.js";

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
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            debug_id: "12345678-1234-1234-1234-123456789abc",
            code_file:
              "file:///Users/user@example.com/app/main.js?token=secret-token",
            extra: "secret-password",
          },
          {
            type: "sourcemap",
            debug_id: "87654321-1234-1234-1234-123456789abc",
            code_file: "file:///Users/user@example.com/app/unrelated.js",
          },
          {
            type: "sourcemap",
            debug_id: "aaaaaaaa-1234-1234-1234-123456789abc",
            code_file: "file:///Another/App/main.js",
          },
          {
            type: "symbolic",
            debug_id: "12345678-1234-1234-1234-123456789abc",
            code_file: "main.js",
          },
        ],
      },
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
    expect(event.debug_meta).toEqual({
      images: [
        {
          type: "sourcemap",
          debug_id: "12345678-1234-1234-1234-123456789abc",
          code_file: "main.js",
        },
      ],
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
