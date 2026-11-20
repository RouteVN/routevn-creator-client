import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import * as handlers from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";
import { selectViewData } from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.store.js";
import { EN_I18N, FR_I18N, JA_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";
import {
  clickEvent,
  mountEditor,
  operationEvent,
  randomValueIds,
  rowEvent,
  startRandomOperation,
  valueEvent,
} from "../support/updateVariableEditor.js";

const VIEW_PATH =
  "src/components/commandLineUpdateVariable/commandLineUpdateVariable.view.yaml";

const JA_COPY = JA_I18N.commandLinePage;

const render = (state, i18n = EN_I18N) =>
  renderViewYaml(VIEW_PATH, selectViewData({ state, i18n }));

// The element ids in document order, without the data-*-id attributes.
const renderedElementIds = (html) =>
  Array.from(html.matchAll(/\sid="([^"]+)"/g), ([, id]) => id);

// The opening tag of the element with this id.
const elementTag = (html, id) =>
  html.match(new RegExp(`<[^>]* id="${id}"[^>]*>`))?.[0];

const range = (min, max) => ({ type: "integer", min, max });
const list = (...entries) => ({
  type: "weighted",
  values: entries.map(([value, weight]) => ({ weight, value })),
});

const mountWith = (...operations) =>
  mountEditor({ id: "updateDice", operations });

// The ids of the random fields, with each row's id replaced by its position.
const randomFieldIds = (html, state) => {
  const rowIds = state.tempOperation.random?.values.map((entry) => entry.id);
  return renderedElementIds(html)
    .filter((id) => /^(random|removeRandom|addRandom)/.test(id))
    .map((id) =>
      (rowIds ?? []).reduce(
        (result, rowId, index) => result.replace(rowId, `#${index + 1}`),
        id,
      ),
    );
};

describe("commandLineUpdateVariable view", () => {
  it("offers Set to random last for number, boolean and text variables only", async () => {
    const { deps, state } = await mountEditor();
    const operationValues = (variableId) => {
      handlers.handleVariableSelectChange(deps, valueEvent(variableId));
      return selectViewData({ state, i18n: EN_I18N }).operationOptions.map(
        (option) => option.value,
      );
    };
    handlers.handleAddOperationClick(deps, clickEvent());

    expect(operationValues("dice")).toEqual([
      "set",
      "increment",
      "decrement",
      "multiply",
      "divide",
      "random",
    ]);
    expect(operationValues("lucky")).toEqual(["set", "toggle", "random"]);
    expect(operationValues("weather")).toEqual(["set", "random"]);
    expect(operationValues("mood")).toEqual(["set", "random"]);
    expect(operationValues("data")).toEqual(["set"]);
    expect(
      selectViewData({ state, i18n: EN_I18N }).operationOptions,
    ).toContainEqual({ value: "set", label: "Set to" });
    handlers.handleVariableSelectChange(deps, valueEvent("weather"));
    expect(
      selectViewData({ state, i18n: EN_I18N }).operationOptions.at(-1),
    ).toEqual({ value: "random", label: "Set to random" });
  });

  it("shows Range and List for a number variable, with Minimum and Maximum from 1 to 6", async () => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "dice");
    const html = render(state);

    expect(randomFieldIds(html, state)).toEqual([
      "randomTypeControl",
      "randomMinInput",
      "randomMaxInput",
    ]);
    const typeControl = elementTag(html, "randomTypeControl");
    expect(typeControl).toMatch(/^<rtgl-segmented-control /);
    expect(typeControl).toContain('noclear="true"');
    expect(typeControl).toContain('selectedvalue="integer"');
    expect(selectViewData({ state, i18n: EN_I18N }).randomTypeOptions).toEqual([
      { value: "integer", label: "Range" },
      { value: "weighted", label: "List" },
    ]);
    expect(html).toContain(">Values<");
    expect(html).toContain(">Minimum<");
    expect(html).toContain(">Maximum<");
    const minInput = elementTag(html, "randomMinInput");
    expect(minInput).toMatch(/^<rtgl-input-number /);
    expect(minInput).toContain('value="1"');
    expect(minInput).toContain('step="1"');
    expect(minInput).toContain('aria-label="Minimum"');
    expect(elementTag(html, "randomMaxInput")).toContain('value="6"');
    // The other operations' fields are hidden.
    expect(renderedElementIds(html)).not.toContain("valueInput");
    expect(elementTag(html, "saveOperationButton")).not.toContain("disabled");
  });

  it("shows a number list with a value, weight, chance and remove button per row", async () => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "dice");
    handlers.handleRandomTypeChange(deps, valueEvent("weighted"));
    handlers.handleAddRandomValueClick(deps, clickEvent());
    const [firstId, secondId] = randomValueIds(state);
    handlers.handleRandomNumberValueChange(deps, rowEvent(firstId, 2));
    handlers.handleRandomWeightInputChange(deps, rowEvent(secondId, 3));
    const html = render(state);

    expect(randomFieldIds(html, state)).toEqual([
      "randomTypeControl",
      "randomValue#1",
      "randomNumberInput#1",
      "randomWeightInput#1",
      "randomChance#1",
      "removeRandomValueButton#1",
      "randomValue#2",
      "randomNumberInput#2",
      "randomWeightInput#2",
      "randomChance#2",
      "removeRandomValueButton#2",
      "addRandomValueButton",
    ]);
    expect(html).toContain(">Value<");
    expect(html).toContain(">Weight<");
    expect(html).toContain(">Chance<");
    const firstValue = elementTag(html, `randomNumberInput${firstId}`);
    expect(firstValue).toMatch(/^<rtgl-input-number /);
    expect(firstValue).toContain('value="2"');
    expect(firstValue).toContain(`data-value-id="${firstId}"`);
    expect(firstValue).toContain('aria-label="Value"');
    expect(elementTag(html, `randomNumberInput${secondId}`)).not.toContain(
      "value=",
    );
    const weightInput = elementTag(html, `randomWeightInput${secondId}`);
    expect(weightInput).toMatch(/^<rtgl-input-number /);
    expect(weightInput).toContain('min="0"');
    expect(weightInput).toContain('value="3"');
    expect(weightInput).toContain('aria-label="Weight"');
    expect(weightInput).toContain(`data-value-id="${secondId}"`);
    expect(html).toMatch(new RegExp(`id="randomChance${firstId}"[^>]*>25%<`));
    expect(html).toMatch(new RegExp(`id="randomChance${secondId}"[^>]*>75%<`));
    const removeButton = elementTag(html, `removeRandomValueButton${firstId}`);
    expect(removeButton).toMatch(/^<rtgl-button /);
    expect(removeButton).toContain('pre="x"');
    expect(removeButton).toContain('aria-label="Remove Value"');
    expect(removeButton).toContain('title="Remove Value"');
    expect(removeButton).toContain(`data-value-id="${firstId}"`);
    expect(html).toContain(">+ Add Value<");
  });

  it("shows chances with the Random action's rounding", async () => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "lucky");
    handlers.handleAddRandomValueClick(deps, clickEvent());
    const ids = randomValueIds(state);
    handlers.handleRandomWeightInputChange(deps, rowEvent(ids[2], 1998));
    const html = render(state);

    expect(html).toMatch(new RegExp(`id="randomChance${ids[0]}"[^>]*>0.05%<`));
    expect(html).toMatch(new RegExp(`id="randomChance${ids[2]}"[^>]*>99.9%<`));
  });

  it("shows chances in the locale's percent format", async () => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "lucky");
    handlers.handleAddRandomValueClick(deps, clickEvent());
    const ids = randomValueIds(state);
    const html = render(state, FR_I18N);

    expect(html).toMatch(
      new RegExp(`id="randomChance${ids[0]}"[^>]*>33,3\u00a0%<`),
    );
  });

  it("uses a True/False select for a boolean variable, with no Range or List", async () => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "lucky");
    const html = render(state);
    const [trueId, falseId] = randomValueIds(state);

    expect(randomFieldIds(html, state)).toEqual([
      "randomValue#1",
      "randomBooleanSelect#1",
      "randomWeightInput#1",
      "randomChance#1",
      "removeRandomValueButton#1",
      "randomValue#2",
      "randomBooleanSelect#2",
      "randomWeightInput#2",
      "randomChance#2",
      "removeRandomValueButton#2",
      "addRandomValueButton",
    ]);
    expect(elementTag(html, `randomBooleanSelect${trueId}`)).toMatch(
      /^<rtgl-select /,
    );
    expect(elementTag(html, `randomBooleanSelect${trueId}`)).toContain(
      'selectedvalue="true"',
    );
    expect(elementTag(html, `randomBooleanSelect${falseId}`)).toContain(
      'selectedvalue="false"',
    );
    for (const id of [trueId, falseId]) {
      const select = elementTag(html, `randomBooleanSelect${id}`);
      // A cleared True/False select would read as False.
      expect(select).toContain('noclear="true"');
      expect(select).toContain(`data-value-id="${id}"`);
      expect(select).toContain('arialabel="Value"');
    }
    expect(html).toContain(">50%<");
    expect(html).toContain(">Values<");
  });

  it("uses the enum values for an enum variable and a text field for others", async () => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "mood");
    let html = render(state);
    const [enumId] = randomValueIds(state);

    expect(elementTag(html, `randomEnumSelect${enumId}`)).toMatch(
      /^<rtgl-select /,
    );
    expect(elementTag(html, `randomEnumSelect${enumId}`)).toContain(
      'selectedvalue="happy"',
    );
    expect(elementTag(html, `randomEnumSelect${enumId}`)).toContain(
      `data-value-id="${enumId}"`,
    );
    expect(
      selectViewData({ state, i18n: EN_I18N }).enumValueOptions.map(
        (option) => option.value,
      ),
    ).toEqual(["happy", "sad", "calm"]);

    startRandomOperation(deps, "weather");
    handlers.handleRandomTextValueChange(
      deps,
      rowEvent(randomValueIds(state)[0], "sunny"),
    );
    html = render(state);
    const textInput = elementTag(
      html,
      `randomTextInput${randomValueIds(state)[0]}`,
    );

    expect(textInput).toMatch(/^<rtgl-input /);
    expect(textInput).toContain('value="sunny"');
    expect(textInput).toContain('placeholder="Enter text..."');
    expect(textInput).toContain(`data-value-id="${randomValueIds(state)[0]}"`);
    expect(renderedElementIds(html)).not.toContain("randomTypeControl");
  });

  it.each([
    [
      "a minimum above the maximum",
      (deps) => handlers.handleRandomMinInputChange(deps, valueEvent(9)),
    ],
    [
      "an empty minimum",
      (deps) => handlers.handleRandomMinInputChange(deps, valueEvent(null)),
    ],
    [
      "an empty list",
      (deps, state) => {
        handlers.handleRandomTypeChange(deps, valueEvent("weighted"));
        handlers.handleRemoveRandomValueClick(
          deps,
          rowEvent(randomValueIds(state)[0]),
        );
      },
    ],
  ])("keeps Save Operation enabled with %s", async (_label, change) => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "dice");
    change(deps, state);
    const html = render(state);

    expect(elementTag(html, "saveOperationButton")).toMatch(
      /^<rtgl-button [^>]*id="saveOperationButton"/,
    );
    expect(elementTag(html, "saveOperationButton")).not.toContain("disabled");
  });

  it("keeps + Add Value enabled at 100 values", async () => {
    const { deps, state } = await mountEditor();
    startRandomOperation(deps, "weather");
    for (let count = 1; count < 100; count += 1) {
      handlers.handleAddRandomValueClick(deps, clickEvent());
    }
    const html = render(state);

    expect(elementTag(html, "addRandomValueButton")).not.toContain("disabled");
  });

  it("shows a notice and no fields or Save Operation for a random operation it cannot edit", async () => {
    const { deps, state } = await mountWith({
      variableId: "lucky",
      op: "random",
      distribution: range(0, 1),
    });
    handlers.handleOperationClick(deps, operationEvent(state.operations[0].id));
    const html = render(state);

    expect(renderedElementIds(html)).toEqual([
      "breadcrumb",
      "unsupportedRandomNotice",
      "dropdownMenu",
    ]);
    expect(html).toContain(
      ">This random operation is saved in a format that RouteVN Creator can&#39;t edit.<",
    );
  });

  it("shows the fields of an operation it can edit next to one it cannot", async () => {
    const { deps, state } = await mountWith(
      { variableId: "lucky", op: "random", distribution: range(0, 1) },
      { variableId: "dice", op: "random", distribution: range(2, 12) },
    );
    handlers.handleOperationClick(deps, operationEvent(state.operations[1].id));
    const html = render(state);

    expect(renderedElementIds(html)).not.toContain("unsupportedRandomNotice");
    expect(elementTag(html, "randomMinInput")).toContain('value="2"');
    expect(elementTag(html, "randomMaxInput")).toContain('value="12"');
    expect(renderedElementIds(html)).toContain("saveOperationButton");
  });

  it("shows each random operation's variable, Set to random and what it draws from", async () => {
    const { state } = await mountWith(
      { variableId: "dice", op: "random", distribution: range(1, 6) },
      {
        variableId: "weather",
        op: "random",
        distribution: list(["sunny", 2], ["rain", 1]),
      },
      {
        variableId: "lucky",
        op: "random",
        distribution: list([true, 1], [false, 1]),
      },
      {
        variableId: "dice",
        op: "random",
        distribution: list([1.5, 1], [-2, 1]),
      },
      { variableId: "lucky", op: "random", distribution: range(0, 1) },
      { variableId: "data", op: "random", distribution: range(1, 6) },
    );
    const { operations } = selectViewData({ state, i18n: EN_I18N });

    expect(
      operations.map(({ variableLabel, opLabel, displayValue }) => [
        variableLabel,
        opLabel,
        displayValue,
      ]),
    ).toEqual([
      ["Dice:", "Set to random", "1 to 6"],
      ["Weather:", "Set to random", "sunny, rain"],
      ["Lucky:", "Set to random", "True, False"],
      ["Dice:", "Set to random", "1.5, -2"],
      ["Lucky:", "Set to random", ""],
      ["Data:", "Set to random", ""],
    ]);
    const html = render(state);
    expect(html).toContain(">1 to 6<");
    expect(html).toContain(">sunny, rain<");
  });

  it("shows what a random operation draws from in Japanese", async () => {
    const { state } = await mountWith(
      { variableId: "dice", op: "random", distribution: range(1, 6) },
      {
        variableId: "lucky",
        op: "random",
        distribution: list([true, 1], [false, 1]),
      },
    );
    const { operations } = selectViewData({ state, i18n: JA_I18N });

    expect(operations[1].displayValue).toBe("真、偽");
    expect(operations[1].opLabel).toBe("ランダムに代入");
    expect(JA_COPY["{min} to {max}"]).toEqual(expect.any(String));
    expect(operations[0].displayValue).toBe(
      JA_COPY["{min} to {max}"].replace("{min}", "1").replace("{max}", "6"),
    );
  });

  it("renders the random fields in Japanese", async () => {
    const { deps, state } = await mountEditor(undefined, { i18n: JA_I18N });
    startRandomOperation(deps, "dice");
    const rangeHtml = render(state, JA_I18N);
    handlers.handleRandomTypeChange(deps, valueEvent("weighted"));
    const listHtml = render(state, JA_I18N);
    const viewData = selectViewData({ state, i18n: JA_I18N });

    for (const key of ["Values", "Minimum", "Maximum", "+ Add Value"]) {
      expect(JA_COPY[key], key).toEqual(expect.any(String));
    }
    expect(rangeHtml).toContain(`>${JA_COPY.Values}<`);
    expect(rangeHtml).toContain(`>${JA_COPY.Minimum}<`);
    expect(rangeHtml).toContain(`>${JA_COPY.Maximum}<`);
    expect(listHtml).toContain(`>${JA_COPY["+ Add Value"]}<`);
    expect(listHtml).toContain(`>${JA_COPY.Weight}<`);
    expect(listHtml).toContain(`>${JA_COPY.Chance}<`);
    expect(listHtml).toContain(`aria-label="${JA_COPY["Remove Value"]}"`);
    expect(viewData.randomTypeOptions).toEqual([
      { value: "integer", label: JA_COPY.Range },
      { value: "weighted", label: JA_COPY.List },
    ]);
    expect(viewData.unsupportedRandomLabel).toBe(
      JA_COPY.unsupportedRandomOperation,
    );
    expect(JA_COPY.unsupportedRandomOperation).toEqual(expect.any(String));
  });

  it("wires every event to an exported handler", () => {
    const { refs } = yaml.load(
      readFileSync(new URL(`../../${VIEW_PATH}`, import.meta.url), "utf8"),
    );
    const handlerNames = new Set(
      Object.values(refs).flatMap(({ eventListeners }) =>
        Object.values(eventListeners).map(({ handler }) => handler),
      ),
    );

    for (const handlerName of handlerNames) {
      expect(handlers[handlerName], handlerName).toEqual(expect.any(Function));
    }
    expect(
      Object.keys(handlers)
        .filter((name) => name !== "handleAfterMount")
        .sort(),
    ).toEqual([...handlerNames].sort());
    expect(refs).toMatchObject({
      randomTypeControl: {
        eventListeners: {
          "value-change": { handler: "handleRandomTypeChange" },
        },
      },
      "randomNumberInput*": {
        eventListeners: {
          "value-input": { handler: "handleRandomNumberValueChange" },
          "value-change": { handler: "handleRandomNumberValueChange" },
        },
      },
      "randomWeightInput*": {
        eventListeners: {
          "value-input": { handler: "handleRandomWeightInputChange" },
          "value-change": { handler: "handleRandomWeightInputChange" },
        },
      },
      "randomTextInput*": {
        eventListeners: {
          "value-input": { handler: "handleRandomTextValueChange" },
        },
      },
      "randomBooleanSelect*": {
        eventListeners: {
          "value-change": { handler: "handleRandomBooleanValueChange" },
        },
      },
      "randomEnumSelect*": {
        eventListeners: {
          "value-change": { handler: "handleRandomEnumValueChange" },
        },
      },
      "removeRandomValueButton*": {
        eventListeners: { click: { handler: "handleRemoveRandomValueClick" } },
      },
      addRandomValueButton: {
        eventListeners: { click: { handler: "handleAddRandomValueClick" } },
      },
    });
  });
});
