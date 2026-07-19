import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  handleSectionTooltipMouseEnter,
  handleSectionTooltipMouseLeave,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import {
  createInitialState,
  selectViewData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { EN_I18N } from "../support/i18n.js";

const EMPTY_TREE = { items: {}, tree: [] };
const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("layoutEditPanel child interaction tooltip", () => {
  it("adds help text to the Child Interaction section", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "container",
          name: "Container",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        itemType: "container",
        layoutType: "general",
        resourceType: "layouts",
        layoutsData: EMPTY_TREE,
        charactersData: EMPTY_TREE,
        isInsideSaveLoadSlot: false,
        isInsideDirectedContainer: false,
      },
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      i18n: EN_I18N,
    });
    const section = viewData.config.sections.find(
      (item) => item.id === "childInteraction",
    );

    expect(section).toMatchObject({
      label: "Child Interaction",
      tooltip: "Inherit child event from parent",
    });
  });

  it("renders a circular question-mark trigger and tooltip", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "button#sectionTooltip${i}.layoutEditPanelSectionTooltipTrigger",
    );
    expect(view).toContain('data-tooltip="${section.tooltip}"\': "?"');
    expect(view).toContain("handler: handleSectionTooltipMouseEnter");
    expect(view).toContain("handler: handleSectionTooltipMouseLeave");
    expect(view).toContain("rtgl-tooltip ?open=${sectionTooltip.open}");
  });

  it("shows the tooltip above the help trigger and hides it on leave", () => {
    const store = {
      showSectionTooltip: vi.fn(),
      hideSectionTooltip: vi.fn(),
    };
    const render = vi.fn();

    handleSectionTooltipMouseEnter(
      { store, render },
      {
        _event: {
          currentTarget: {
            dataset: { tooltip: "Inherit child event from parent" },
            getBoundingClientRect: () => ({ left: 20, top: 40, width: 16 }),
          },
        },
      },
    );

    expect(store.showSectionTooltip).toHaveBeenCalledWith({
      x: 28,
      y: 32,
      content: "Inherit child event from parent",
    });

    handleSectionTooltipMouseLeave({ store, render });

    expect(store.hideSectionTooltip).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledTimes(2);
  });
});
