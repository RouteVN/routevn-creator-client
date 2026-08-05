import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ROUTEVN_CONTACT_URL } from "../../src/internal/routevnUrls.js";
import { handleClickContactButton } from "../../src/pages/about/about.handlers.js";

const defaultCapability = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../src-tauri/capabilities/default.json", import.meta.url),
    ),
    "utf8",
  ),
);

describe("about handlers", () => {
  it("opens the RouteVN contact page", () => {
    const appService = {
      openUrl: vi.fn(),
    };

    handleClickContactButton({ appService });

    expect(appService.openUrl).toHaveBeenCalledWith(ROUTEVN_CONTACT_URL);
  });

  it("allows RouteVN pages through the Tauri opener", () => {
    const openerPermission = defaultCapability.permissions.find(
      (permission) => permission.identifier === "opener:allow-open-url",
    );

    expect(openerPermission.allow).toContainEqual({
      url: "https://routevn.com/*",
    });
  });
});
