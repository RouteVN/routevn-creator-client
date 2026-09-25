import { describe, expect, it, vi } from "vitest";
import { getClient } from "@sentry/browser";
import { scrubErrorEvent } from "../../src/deps/clients/tauri/errorReporting.js";

vi.hoisted(() => {
  globalThis.__ROUTEVN_ERROR_REPORTING__ = Object.freeze({
    dsn: "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1",
    release: "routevn-creator@1.0.0",
    environment: "development",
    dist: "test-build",
  });
});

describe("desktop error reporting", () => {
  it("initializes the official SDK with the native build configuration", () => {
    expect(getClient().getOptions()).toMatchObject({
      ...globalThis.__ROUTEVN_ERROR_REPORTING__,
      sendDefaultPii: false,
      maxBreadcrumbs: 25,
      sendClientReports: false,
      enableLogs: false,
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
            stacktrace: {
              frames: [
                {
                  filename: "file:///Users/user@example.com/app/main.js?token=secret-token",
                  function: "loadProject",
                  lineno: 42,
                  colno: 2,
                  vars: { password: "secret-password" },
                  context_line: "password=secret-password",
                },
              ],
            },
          },
        ],
      },
    });

    expect(event.release).toBe("routevn-creator@1.0.0");
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
    const encoded = JSON.stringify(event);
    expect(encoded).not.toContain("user@example.com");
    expect(encoded).not.toContain("secret-token");
    expect(encoded).not.toContain("secret-password");
    expect(encoded).not.toContain("secret-cookie");
  });
});
