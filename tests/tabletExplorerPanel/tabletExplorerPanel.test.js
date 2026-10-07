import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as panelStore from "../../src/components/tabletExplorerPanel/tabletExplorerPanel.store.js";
import {
  TABLET_EXPLORER_COLLAPSED_CONFIG_KEY,
  handleBeforeMount,
  handleToggleClick,
} from "../../src/components/tabletExplorerPanel/tabletExplorerPanel.handlers.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const TEMPLATE =
  "src/components/tabletExplorerPanel/tabletExplorerPanel.view.yaml";

const createPanel = ({ storedCollapsed, props = {} } = {}) => {
  let state = panelStore.createInitialState();
  const userConfig = {
    [TABLET_EXPLORER_COLLAPSED_CONFIG_KEY]: storedCollapsed,
  };
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return panelStore[name]({ state }, payload);
        }
        state = produce(state, (draft) => {
          panelStore[name]({ state: draft }, payload);
        });
      },
    },
  );
  const deps = {
    store,
    render: vi.fn(),
    appService: {
      getUserConfig: vi.fn((key) => userConfig[key]),
      setUserConfig: vi.fn((key, value) => {
        userConfig[key] = value;
      }),
    },
  };
  handleBeforeMount(deps);
  return {
    deps,
    view: () =>
      panelStore.selectViewData({
        state,
        props: { label: "Files", w: 300, ...props },
        i18n: EN_I18N,
      }),
  };
};

describe("rvn-tablet-explorer-panel", () => {
  it("shows the explorer under its title, with a button to hide it", () => {
    const panel = createPanel();

    expect(panel.view()).toMatchObject({
      collapsed: false,
      panelWidth: 300,
      label: "Files",
      labelSize: "md",
      toggleLabel: "Hide panel",
      contentStyle: "",
    });
    const html = renderViewYaml(TEMPLATE, panel.view());
    expect(html).toContain("Files");
    expect(html).toContain('pre="panelLeft"');
    expect(html).toContain('aria-label="Hide panel"');
  });

  it("shrinks to the button that shows it again, and remembers that", () => {
    const panel = createPanel();

    handleToggleClick(panel.deps);

    expect(panel.deps.appService.setUserConfig).toHaveBeenCalledWith(
      TABLET_EXPLORER_COLLAPSED_CONFIG_KEY,
      true,
    );
    expect(panel.deps.render).toHaveBeenCalledOnce();
    // The explorer stays mounted, only hidden.
    expect(panel.view()).toMatchObject({
      collapsed: true,
      panelWidth: 48,
      toggleLabel: "Show panel",
      contentStyle: "display: none;",
    });
    const html = renderViewYaml(TEMPLATE, panel.view());
    expect(html).not.toContain("Files");
    expect(html).toContain('aria-label="Show panel"');
    expect(html).toContain('name="content"');

    handleToggleClick(panel.deps);
    expect(panel.view().collapsed).toBe(false);
    expect(panel.deps.appService.setUserConfig).toHaveBeenLastCalledWith(
      TABLET_EXPLORER_COLLAPSED_CONFIG_KEY,
      false,
    );
  });

  it("opens hidden on another page after it was hidden", () => {
    expect(createPanel({ storedCollapsed: true }).view()).toMatchObject({
      collapsed: true,
      panelWidth: 48,
    });
    expect(createPanel({ storedCollapsed: undefined }).view().collapsed).toBe(
      false,
    );
  });

  it("takes the layout editor's larger title", () => {
    expect(
      createPanel({ props: { label: "Elements", labelSize: "lg" } }).view(),
    ).toMatchObject({ label: "Elements", labelSize: "lg" });
  });
});
