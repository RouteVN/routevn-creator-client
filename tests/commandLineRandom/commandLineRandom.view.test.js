import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import * as randomHandlers from "../../src/components/commandLineRandom/commandLineRandom.handlers.js";
import {
  createInitialState,
  moveOutcome,
  openOutcomeDraft,
  selectViewData,
  setDistributionUnsupported,
  setOutcomes,
  setTempOutcomeActions,
  setTempOutcomeWeight,
} from "../../src/components/commandLineRandom/commandLineRandom.store.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const VIEW_PATH =
  "src/components/commandLineRandom/commandLineRandom.view.yaml";

const createStateWithWeights = (...weights) => {
  const state = createInitialState();
  setOutcomes(
    { state },
    {
      outcomes: weights.map((weight, index) => ({
        id: `o${index + 1}`,
        weight,
        actions: {},
      })),
    },
  );
  return state;
};

const render = (state, { props = {}, i18n = EN_I18N } = {}) =>
  renderViewYaml(VIEW_PATH, selectViewData({ state, props, i18n }));

// The element ids in document order. renderedElementIds would also read the
// rows' data-outcome-id attributes as ids.
const renderedElementIds = (html) =>
  Array.from(html.matchAll(/\sid="([^"]+)"/g), ([, id]) => id);

// The opening tag of the element with this id.
const elementTag = (html, id) =>
  html.match(new RegExp(`<[^>]* id="${id}"[^>]*>`))?.[0];

// The editor's state after it mounts with this Random action.
const mountedState = (random) => {
  const state = createInitialState();
  randomHandlers.handleBeforeMount({
    props: { random },
    store: {
      setDistributionUnsupported: () => setDistributionUnsupported({ state }),
      setOutcomes: (payload) => setOutcomes({ state }, payload),
    },
  });
  return state;
};

describe("commandLineRandom view", () => {
  it("keys the outcome rows and their menu buttons by outcome id", () => {
    const state = createStateWithWeights(1, 2, 3);

    expect(renderedElementIds(render(state))).toEqual([
      "breadcrumb",
      "randomOutcomeo1",
      "outcomeMenuButtono1",
      "randomOutcomeo2",
      "outcomeMenuButtono2",
      "randomOutcomeo3",
      "outcomeMenuButtono3",
      "addOutcomeButton",
      "submitButton",
      "dropdownMenu",
    ]);

    moveOutcome({ state }, { outcomeId: "o3", direction: "up" });

    expect(
      renderedElementIds(render(state)).filter((id) =>
        id.startsWith("outcomeMenuButton"),
      ),
    ).toEqual([
      "outcomeMenuButtono1",
      "outcomeMenuButtono3",
      "outcomeMenuButtono2",
    ]);
  });

  it("shows each outcome's weight, chance and actions", () => {
    const html = render(createStateWithWeights(70, 30));

    expect(html).toContain(">Outcomes<");
    expect(html).toContain(">Weight 70 (70%)<");
    expect(html).toContain(">Weight 30 (30%)<");
    expect(html).toContain(">No actions<");
    expect(elementTag(html, "randomOutcomeo1")).toMatch(
      /^<rtgl-view [^>]*data-outcome-id="o1"/,
    );
    expect(elementTag(html, "randomOutcomeo2")).toMatch(
      /^<rtgl-view [^>]*data-outcome-id="o2"/,
    );
  });

  it.each([
    ["o1", "ArrowDown Delete"],
    ["o2", "ArrowUp ArrowDown Delete"],
    ["o3", "ArrowUp Delete"],
  ])(
    "labels the menu button of %s with its shortcuts",
    (outcomeId, shortcuts) => {
      const button = elementTag(
        render(createStateWithWeights(1, 2, 3)),
        `outcomeMenuButton${outcomeId}`,
      );

      expect(button).toContain('pre="ellipsis"');
      expect(button).toContain('title="Outcome Menu"');
      expect(button).toContain('aria-label="Outcome Menu"');
      expect(button).toContain('aria-haspopup="menu"');
      expect(button).toContain(`aria-keyshortcuts="${shortcuts}"`);
      expect(button).toContain(`data-outcome-id="${outcomeId}"`);
    },
  );

  // Pressing Submit or Add Outcome says what is wrong instead.
  it.each([
    ["no outcomes", []],
    ["every weight 0", [0, 0]],
    ["a weight that is not valid", [70, -1]],
    ["more than the largest number of outcomes", Array(101).fill(1)],
    ["valid weights", [70, 30]],
  ])("keeps Submit and Add Outcome enabled with %s", (_label, weights) => {
    const html = render(createStateWithWeights(...weights));

    expect(elementTag(html, "submitButton")).not.toContain("disabled");
    expect(elementTag(html, "addOutcomeButton")).not.toContain("disabled");
  });

  it("keeps Add Outcome enabled at 100 outcomes", () => {
    const html = render(createStateWithWeights(...Array(100).fill(1)));

    expect(elementTag(html, "addOutcomeButton")).toMatch(
      /^<rtgl-button [^>]*id="addOutcomeButton"/,
    );
    expect(elementTag(html, "addOutcomeButton")).not.toContain("disabled");
  });

  it("shows a notice and no Submit button for a form it cannot edit", () => {
    const state = createStateWithWeights(70, 30);
    setDistributionUnsupported({ state });
    const html = render(state);

    expect(renderedElementIds(html)).toEqual([
      "breadcrumb",
      "unsupportedDistributionNotice",
      "dropdownMenu",
    ]);
    expect(html).toContain(
      ">This random action is saved in a format that RouteVN Creator can&#39;t edit.<",
    );
    expect(html).not.toContain(">Outcomes<");
    expect(html).not.toContain(">Submit<");
    // The outcomes stay as they were.
    expect(state.outcomes.map((outcome) => outcome.weight)).toEqual([70, 30]);
  });

  it.each([
    [
      "an integer distribution",
      {
        distribution: { type: "integer", min: 1, max: 6 },
        variableId: "variable-1",
      },
    ],
    [
      "another type with a valid outcomes list",
      {
        distribution: { type: "other", outcomes: [{ weight: 1, actions: {} }] },
      },
    ],
    [
      "a null outcome",
      {
        distribution: {
          type: "weighted",
          outcomes: [{ weight: 1, actions: {} }, null],
        },
      },
    ],
    [
      "outcome actions as a list",
      {
        distribution: {
          type: "weighted",
          outcomes: [
            { weight: 1, actions: {} },
            { weight: 1, actions: [] },
          ],
        },
      },
    ],
    [
      "outcome actions as text",
      {
        distribution: {
          type: "weighted",
          outcomes: [
            { weight: 1, actions: {} },
            { weight: 1, actions: "abc" },
          ],
        },
      },
    ],
  ])("renders no Submit button for %s", (_label, random) => {
    const html = render(mountedState(random));

    expect(renderedElementIds(html)).toEqual([
      "breadcrumb",
      "unsupportedDistributionNotice",
      "dropdownMenu",
    ]);
  });

  it("renders the Submit button for a weighted random it can edit", () => {
    const html = render(
      mountedState({
        distribution: {
          type: "weighted",
          outcomes: [{ weight: 1 }, { weight: 2, actions: {} }],
        },
      }),
    );

    expect(renderedElementIds(html)).toContain("submitButton");
    expect(renderedElementIds(html)).not.toContain(
      "unsupportedDistributionNotice",
    );
  });

  it("edits an outcome's weight with the number input and its actions with the system actions editor", () => {
    const state = createStateWithWeights(70, 30);
    openOutcomeDraft({ state }, { outcomeId: "o2" });
    setTempOutcomeActions(
      { state },
      {
        actions: {
          sectionTransition: { sceneId: "scene-1", sectionId: "section-2" },
        },
      },
    );
    const html = render(state, {
      props: { hiddenModes: ["showConfirmDialog", "hideConfirmDialog"] },
    });

    expect(renderedElementIds(html)).toEqual([
      "breadcrumb",
      "weightInput",
      "outcomeChance",
      "outcomeActionsEditor",
      "saveOutcomeButton",
      "dropdownMenu",
    ]);
    const weightInput = elementTag(html, "weightInput");
    expect(weightInput).toMatch(/^<rtgl-input-number /);
    expect(weightInput).toContain('min="0"');
    expect(weightInput).toContain('value="30"');
    expect(weightInput).toContain('aria-label="Weight"');
    expect(html).toContain(">Weight<");
    expect(html).toContain(">Chance<");
    expect(html).toContain(">30%<");
    expect(html).toContain(">Actions<");

    const actionsEditor = elementTag(html, "outcomeActionsEditor");
    expect(actionsEditor).toMatch(/^<rvn-system-actions /);
    expect(actionsEditor).toContain('actiontype="system"');
    expect(actionsEditor).toContain('showselected="true"');
    expect(actionsEditor).toContain('showembeddedclose="false"');
    expect(actionsEditor).toContain(
      'hiddenmodes="showConfirmDialog,hideConfirmDialog"',
    );
    expect(actionsEditor).toContain(
      'allowedmodes="sectionTransition,updateVariable"',
    );
    expect(elementTag(html, "saveOutcomeButton")).not.toContain("disabled");
  });

  it("keeps Save Outcome enabled while the weight field is empty", () => {
    const state = createStateWithWeights(1);
    openOutcomeDraft({ state }, { outcomeId: "o1" });
    setTempOutcomeWeight({ state }, { weight: undefined });
    const html = render(state);

    expect(elementTag(html, "saveOutcomeButton")).toMatch(
      /^<rtgl-button [^>]*id="saveOutcomeButton"/,
    );
    expect(elementTag(html, "saveOutcomeButton")).not.toContain("disabled");
    expect(elementTag(html, "weightInput")).not.toContain("value=");
    expect(html).toContain(">0%<");
  });

  it("renders in Japanese", () => {
    const state = createStateWithWeights(70, 30);
    const html = render(state, { i18n: JA_I18N });

    expect(html).toContain(">結果<");
    expect(html).toContain(">重み70（70%）<");
    expect(html).toContain(">+ 結果を追加<");
    expect(html).toContain(">確定<");
    expect(elementTag(html, "outcomeMenuButtono1")).toContain(
      'aria-label="結果メニュー"',
    );

    openOutcomeDraft({ state }, { outcomeId: "o1" });
    const editHtml = render(state, { i18n: JA_I18N });
    expect(editHtml).toContain(">重み<");
    expect(editHtml).toContain(">確率<");
    expect(editHtml).toContain(">結果を保存<");
  });

  it("wires every event to an exported handler", () => {
    const { refs } = yaml.load(
      readFileSync(new URL(`../../${VIEW_PATH}`, import.meta.url), "utf8"),
    );
    const handlersByRef = Object.fromEntries(
      Object.entries(refs).map(([ref, { eventListeners }]) => [
        ref,
        Object.fromEntries(
          Object.entries(eventListeners).map(([eventName, { handler }]) => [
            eventName,
            handler,
          ]),
        ),
      ]),
    );

    expect(handlersByRef).toEqual({
      breadcrumb: { "item-click": "handleBreadcrumbClick" },
      addOutcomeButton: { click: "handleAddOutcomeClick" },
      "randomOutcome*": {
        click: "handleOutcomeClick",
        contextmenu: "handleOutcomeContextMenu",
      },
      "outcomeMenuButton*": {
        click: "handleOutcomeMenuButtonClick",
        keydown: "handleOutcomeMenuButtonKeyDown",
      },
      weightInput: {
        "value-input": "handleWeightInputChange",
        "value-change": "handleWeightInputChange",
      },
      outcomeActionsEditor: {
        "actions-change": "handleOutcomeActionsChange",
        "action-delete": "handleOutcomeActionsDelete",
        close: "handleNestedActionsClose",
      },
      saveOutcomeButton: { click: "handleSaveOutcomeClick" },
      submitButton: { click: "handleSubmitClick" },
      dropdownMenu: {
        close: "handleDropdownMenuClose",
        "item-click": "handleDropdownMenuClickItem",
      },
    });
    const wiredHandlerNames = new Set(
      Object.values(handlersByRef).flatMap((events) => Object.values(events)),
    );
    for (const handlerName of wiredHandlerNames) {
      expect(randomHandlers[handlerName], handlerName).toEqual(
        expect.any(Function),
      );
    }
    // Every exported event handler is wired; handleBeforeMount runs on mount.
    expect(
      Object.keys(randomHandlers)
        .filter((name) => name !== "handleBeforeMount")
        .sort(),
    ).toEqual([...wiredHandlerNames].sort());
  });

  it("has a random icon in the house style", () => {
    const svg = readFileSync(
      new URL("../../svg/random.svg", import.meta.url),
      "utf8",
    );

    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg.match(/<circle [^>]*fill="currentColor"/g)).toHaveLength(5);
  });
});
