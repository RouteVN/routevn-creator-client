import { describe, expect, it, vi } from "vitest";
import {
  createUserConfigService,
  USER_CONFIG_DB_KEY,
} from "../../src/deps/services/shared/userConfigService.js";
import {
  ASSET_PACKAGE_ENABLED_CONFIG_KEY,
  isAssetPackageEnabled,
} from "../../src/internal/ui/releasePreferences.js";
import { handleBeforeMount as mountDesktopMenu } from "../../src/pages/resourceTypes/resourceTypes.handlers.js";
import { handleBeforeMount as mountMobileMenu } from "../../src/components/mobileSidebar/mobileSidebar.handlers.js";

describe("global Release preferences", () => {
  it("defaults to disabled and survives service reloads in the app KV", async () => {
    const values = new Map();
    const db = {
      get: vi.fn(async (key) => values.get(key)),
      set: vi.fn(async (key, value) => values.set(key, structuredClone(value))),
    };
    const service = createUserConfigService({ db });
    await service.initUserConfig();
    expect(isAssetPackageEnabled(service)).toBe(false);

    for (const enabled of [true, false]) {
      service.setUserConfig(ASSET_PACKAGE_ENABLED_CONFIG_KEY, enabled);
      await service.flushUserConfig();
      expect(db.set).toHaveBeenLastCalledWith(
        USER_CONFIG_DB_KEY,
        expect.objectContaining({
          release: { assetPackageEnabled: enabled },
        }),
      );

      const reloaded = createUserConfigService({ db });
      await reloaded.initUserConfig();
      expect(isAssetPackageEnabled(reloaded)).toBe(enabled);
    }
    expect([...values.keys()]).toEqual(["userConfig"]);
  });

  it.each([undefined, false, true])(
    "loads preference %s into both menus for any project",
    (enabled) => {
      for (const projectId of ["project-1", "project-2"]) {
        const deps = {
          appService: {
            getUserConfig: vi.fn((key) =>
              key === ASSET_PACKAGE_ENABLED_CONFIG_KEY ? enabled : undefined,
            ),
            getCurrentProjectId: () => projectId,
          },
          store: {
            setAssetPackageEnabled: vi.fn(),
            setRecentSceneIds: vi.fn(),
          },
          projectService: { subscribeProjectState: vi.fn(() => vi.fn()) },
          render: vi.fn(),
        };
        mountDesktopMenu(deps);
        const cleanup = mountMobileMenu(deps);
        expect(deps.store.setAssetPackageEnabled).toHaveBeenNthCalledWith(1, {
          enabled: enabled === true,
        });
        expect(deps.store.setAssetPackageEnabled).toHaveBeenNthCalledWith(2, {
          enabled: enabled === true,
        });
        cleanup();
      }
    },
  );
});
