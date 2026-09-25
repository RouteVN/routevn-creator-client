import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Tauri updater configuration", () => {
  it("uses localhost for development and the API host for production", () => {
    const load = (name) =>
      JSON.parse(
        readFileSync(
          new URL(`../../src-tauri/${name}`, import.meta.url),
          "utf8",
        ),
      ).plugins.updater;
    const development = load("tauri.conf.json");
    const production = load("tauri.prod.conf.json");
    for (const config of [development, production]) {
      const url = new URL(config.endpoints[0]);
      expect(url.pathname).toBe("/system/updates/v1/routevn-creator/tauri");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        currentVersion: "{{current_version}}",
        target: "{{target}}",
        arch: "{{arch}}",
        distribution: "direct",
        channel: "stable",
        bundleType: "{{bundle_type}}",
      });
    }
    expect(new URL(development.endpoints[0]).hostname).toBe("127.0.0.1");
    expect(new URL(production.endpoints[0]).hostname).toBe("api1.routevn.com");
    expect(development.pubkey).not.toBe(production.pubkey);
    expect(production.dangerousInsecureTransportProtocol).toBe(false);
    expect(development.dangerousInsecureTransportProtocol).toBe(true);
    expect(load("tauri.steam.conf.json").endpoints).toEqual([]);
  });
});
