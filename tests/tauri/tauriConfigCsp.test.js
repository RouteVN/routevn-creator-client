import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tauri content security policy", () => {
  it("allows HTTPS asset-package manifests and previews", () => {
    const config = JSON.parse(
      readFileSync(
        new URL("../../src-tauri/tauri.conf.json", import.meta.url),
        "utf8",
      ),
    );
    const csp = config.app.security.csp;

    expect(csp["connect-src"]).toContain("https:");
    expect(csp["img-src"]).toContain("https:");
    expect(csp["media-src"]).toContain("https:");
  });
});
