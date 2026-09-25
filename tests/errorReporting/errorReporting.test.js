import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { scrubErrorEvent } from "../../src/deps/clients/tauri/errorReporting.js";

const validateDsn = (environment, dsn) =>
  spawnSync(
    process.execPath,
    ["scripts/validate-desktop-sentry-dsn.js", environment, dsn],
    { encoding: "utf8" },
  ).status;

describe("desktop error reporting", () => {
  it("keeps development and production collectors separate", () => {
    const productionDsn =
      "https://4a1f0f2f77f130fd8366487119b90a7d@api1.routevn.com/system/sentry/1";
    const developmentDsn =
      "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1";

    expect(validateDsn("production", productionDsn)).toBe(0);
    expect(validateDsn("development", developmentDsn)).toBe(0);
    expect(validateDsn("development", productionDsn)).not.toBe(0);
    expect(validateDsn("production", developmentDsn)).not.toBe(0);
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

    expect(event.release).toBe("routevn-creator@1.16.2");
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
