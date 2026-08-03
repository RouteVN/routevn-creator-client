import { describe, expect, it } from "vitest";
import {
  collectComputedInputReferences,
  toExecutableComputed,
} from "../../src/internal/computedExamples.js";
import {
  buildComputedExampleInput,
  createComputedExampleDefaultValues,
  createComputedExampleInputItems,
  evaluateComputedExample,
} from "../../src/components/groupVariablesView/support/computedExamples.js";

const flatGroups = [
  {
    id: "group",
    children: [
      {
        id: "score",
        type: "variable",
        name: "Score",
        variableType: "number",
        scope: "context",
        default: 5,
        value: 8,
      },
      {
        id: "bonus.value",
        type: "variable",
        name: "Bonus",
        variableType: "number",
        scope: "context",
        default: 2,
      },
      {
        id: "subtotal",
        type: "variable",
        name: "Subtotal",
        variableType: "number",
        computed: {
          expr: {
            add: [
              { var: "variables.score" },
              { var: 'variables["bonus.value"]' },
            ],
          },
        },
      },
    ],
  },
];

describe("computed examples", () => {
  it("collects variable and runtime roots while ignoring literal objects", () => {
    expect(
      collectComputedInputReferences({
        branches: [
          {
            when: { eq: [{ var: 'variables["player.state"]' }, "ready"] },
            expr: { var: "runtime.menuPage" },
          },
        ],
        default: {
          expr: { literal: { var: "variables.notAnInput" } },
        },
        examples: [
          {
            id: "ignored",
            name: "Ignored",
            input: { variables: { notAnInput: true } },
          },
        ],
      }),
    ).toEqual({
      variables: ["player.state"],
      runtime: ["menuPage"],
    });
  });

  it("expands computed dependencies into editable leaf inputs", () => {
    expect(
      createComputedExampleInputItems({
        computed: {
          expr: {
            add: [
              { var: "variables.subtotal" },
              { var: "runtime.saveLoadPagination" },
            ],
          },
        },
        flatGroups,
      }),
    ).toEqual([
      expect.objectContaining({
        source: "variables",
        id: "score",
        name: "Score",
        type: "number",
        defaultValue: 8,
        formName: "input0",
      }),
      expect.objectContaining({
        source: "variables",
        id: "bonus.value",
        name: "Bonus",
        type: "number",
        defaultValue: 2,
        formName: "input1",
      }),
      expect.objectContaining({
        source: "runtime",
        id: "saveLoadPagination",
        type: "number",
        defaultValue: 1,
        formName: "input2",
      }),
    ]);
  });

  it("maps form values to the persisted input namespaces", () => {
    const inputItems = [
      {
        source: "variables",
        id: "score",
        type: "number",
        formName: "input0",
        defaultValue: 1,
      },
      {
        source: "variables",
        id: "player",
        type: "object",
        formName: "input1",
        defaultValue: { status: "ready" },
      },
    ];
    const defaultValues = createComputedExampleDefaultValues({
      inputItems,
      example: {
        name: "Waiting player",
        input: {
          variables: { score: 10, player: { status: "waiting" } },
        },
      },
    });

    expect(defaultValues).toEqual({
      name: "Waiting player",
      input0: 10,
      input1: '{\n  "status": "waiting"\n}',
    });
    expect(
      buildComputedExampleInput({
        inputItems,
        values: {
          input0: "12",
          input1: '{"status":"ready"}',
        },
      }),
    ).toEqual({
      variables: {
        score: 12,
        player: { status: "ready" },
      },
    });
  });

  it("derives a result without passing examples to route-engine", () => {
    const computed = {
      expr: {
        add: [{ var: "variables.score" }, 10],
      },
      examples: [
        {
          id: "example",
          name: "Score with bonus",
          input: { variables: { score: 15 } },
        },
      ],
    };

    expect(
      evaluateComputedExample({
        computed,
        variableType: "number",
        flatGroups,
        input: computed.examples[0].input,
      }),
    ).toEqual({ valid: true, value: 25 });
    expect(toExecutableComputed(computed)).toEqual({
      expr: computed.expr,
    });
    expect(computed).toHaveProperty("examples");
  });
});
