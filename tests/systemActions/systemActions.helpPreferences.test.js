import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import * as storeModule from "../../src/components/systemActions/systemActions.store.js";
import { handleBeforeMount } from "../../src/components/systemActions/systemActions.handlers.js";
import { HELP_BUTTON_VISIBLE_CONFIG_KEY } from "../../src/internal/ui/helpPreferences.js";
import { EN_I18N } from "../support/i18n.js";

const template = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/systemActions/systemActions.view.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
).template;

const mount = (initialPreference) => {
  let preference = initialPreference;
  const state = storeModule.createInitialState();
  state.isActionsDialogOpen = true;
  const props = { actionType: "presentation", actions: {} };
  const subject = new Subject();
  const render = vi.fn();
  const store = Object.fromEntries(
    [
      "setUiConfig",
      "setHelpButtonVisible",
      "setAuthoredDialogueWasCleared",
      "updateActions",
      "setRepositoryState",
    ].map((name) => [name, (payload) => storeModule[name]({ state }, payload)]),
  );
  const appService = { getUserConfig: vi.fn(() => preference) };
  const cleanup = handleBeforeMount({
    store,
    props,
    subject,
    render,
    appService,
    uiConfig: { inputMode: "touch" },
    projectService: { getRepositoryState: () => ({}) },
  });
  return {
    cleanup,
    subject,
    render,
    appService,
    changePreference(value, key = HELP_BUTTON_VISIBLE_CONFIG_KEY) {
      preference = value;
      subject.next({ action: "app.userConfig.changed", payload: { key } });
    },
    hasHelpButton() {
      const data = storeModule.selectViewData({ state, props, i18n: EN_I18N });
      return JSON.stringify(parseAndRender(template, data)).includes(
        "#helpFloatingButton",
      );
    },
  };
};

describe("systemActions help preference", () => {
  it.each([undefined, true, false])(
    "respects the saved preference %s when mounted",
    (preference) => {
      const fixture = mount(preference);
      try {
        expect(fixture.hasHelpButton()).toBe(preference !== false);
        expect(fixture.appService.getUserConfig).toHaveBeenCalledWith(
          HELP_BUTTON_VISIBLE_CONFIG_KEY,
        );
      } finally {
        fixture.cleanup();
      }
    },
  );

  it("updates an open dialog and removes its listener on unmount", () => {
    const fixture = mount(true);
    try {
      fixture.changePreference(false);
      expect(fixture.hasHelpButton()).toBe(false);
      fixture.changePreference(true);
      expect(fixture.hasHelpButton()).toBe(true);
      const renders = fixture.render.mock.calls.length;
      fixture.subject.next({
        action: "app.userConfig.changed",
        payload: { key: "unrelated" },
      });
      expect(fixture.render).toHaveBeenCalledTimes(renders);
      fixture.cleanup();
      fixture.changePreference(false);
      expect(fixture.render).toHaveBeenCalledTimes(renders);
      expect(fixture.hasHelpButton()).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});
