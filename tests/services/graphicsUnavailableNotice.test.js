import { describe, expect, it, vi } from "vitest";
import { createGraphicsUnavailableNotifier } from "../../src/deps/services/shared/graphicsUnavailableNotice.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const webGlError = new Error(
  "This browser does not support WebGL. Try using the canvas renderer",
);

const createAppService = (copy = EN_I18N.appPage) => {
  const alerts = [];
  return {
    alerts,
    getAppCopy: () => copy,
    showAlertWhenIdle: vi.fn((options) => {
      let close;
      const closed = new Promise((resolve) => {
        close = resolve;
      });
      alerts.push({ options, close });
      return closed;
    }),
  };
};

describe("createGraphicsUnavailableNotifier", () => {
  it("tells the user the device cannot show graphics, with the technical details", () => {
    const appService = createAppService();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    createGraphicsUnavailableNotifier({ appService })(webGlError);
    log.mockRestore();

    expect(appService.showAlertWhenIdle).toHaveBeenCalledWith({
      title: EN_I18N.appPage.errorTitle,
      message: `${EN_I18N.appPage.graphicsUnavailableMessage}\n\n${EN_I18N.appPage.errorDetailsLabel}\nThis browser does not support WebGL. Try using the canvas renderer`,
    });
  });

  it("uses the app language", () => {
    const appService = createAppService(JA_I18N.appPage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    createGraphicsUnavailableNotifier({ appService })(webGlError);
    log.mockRestore();

    expect(appService.alerts[0].options.message).toContain(
      JA_I18N.appPage.graphicsUnavailableMessage,
    );
    expect(JA_I18N.appPage.graphicsUnavailableMessage).not.toBe(
      EN_I18N.appPage.graphicsUnavailableMessage,
    );
  });

  it("shows one alert at a time, and again once the user has closed it", async () => {
    const appService = createAppService();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const notify = createGraphicsUnavailableNotifier({ appService });

    notify(webGlError);
    notify(webGlError);
    expect(appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);

    appService.alerts[0].close();
    await Promise.resolve();
    await Promise.resolve();
    notify(webGlError);
    log.mockRestore();

    expect(appService.showAlertWhenIdle).toHaveBeenCalledTimes(2);
  });

  it("can still tell the user when the alert cannot be shown", async () => {
    const appService = createAppService();
    appService.showAlertWhenIdle.mockRejectedValueOnce(new Error("No dialog"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const notify = createGraphicsUnavailableNotifier({ appService });

    notify(webGlError);
    await new Promise((resolve) => setTimeout(resolve, 0));
    notify(webGlError);
    log.mockRestore();

    expect(appService.showAlertWhenIdle).toHaveBeenCalledTimes(2);
  });
});
