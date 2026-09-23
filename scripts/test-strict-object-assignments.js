import assert from "node:assert/strict";
import { test } from "node:test";
import createRouteEngine from "route-engine-js";
import { SCHEMA_VERSION, validatePayload } from "@routevn/creator-model";
import { handleSubmitClick } from "../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";
import {
  decodeCommandEnvelope,
  encodeCommandEnvelope,
} from "../src/deps/services/shared/collab/commandCodec.js";

assert.equal(SCHEMA_VERSION, 16, "Run with the strict model package");

const execute = (actions) => {
  const engine = createRouteEngine({ handlePendingEffects: () => {} });
  try {
    engine.init({
      namespace: "project-one",
      initialState: {
        projectData: {
          resources: {
            variables: {
              source: { type: "string", scope: "context", default: "Alice" },
              sourceObject: {
                type: "object",
                scope: "context",
                default: { name: "Alice" },
              },
              objectOne: { type: "object", scope: "context", default: {} },
            },
          },
          story: {
            initialSceneId: "sceneOne",
            scenes: {
              sceneOne: {
                initialSectionId: "sectionOne",
                sections: {
                  sectionOne: {
                    lines: [
                      { id: "lineOne", actions: {} },
                      { id: "lineTwo", actions: {} },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    });
    engine.handleActions(actions);
    return engine.selectSystemState().contexts.at(-1).variables.objectOne;
  } finally {
    engine.dispose();
  }
};

for (const [label, value, expected] of [
  [
    "nested object templates",
    {
      greeting: "Hello ${variables.source}",
      nested: [{ name: "${variables.source}" }],
    },
    { greeting: "Hello Alice", nested: [{ name: "Alice" }] },
  ],
  ["array templates", ["${variables.source}", { n: 1 }], ["Alice", { n: 1 }]],
  ["whole object binding", "${variables.sourceObject}", { name: "Alice" }],
]) {
  test(`strict re-save preserves existing runtime behavior: ${label}`, () => {
    const original = {
      updateVariable: {
        id: "updateOne",
        operations: [{ variableId: "objectOne", op: "set", value }],
      },
    };
    let saved;
    handleSubmitClick(
      {
        i18n: { resourcePages: {}, sceneEditorPage: {}, commandLinePage: {} },
        store: {
          selectSubmitData: () => ({
            actionId: "updateOne",
            operations: structuredClone(original.updateVariable.operations),
            variablesData: { items: { objectOne: { variableType: "object" } } },
          }),
        },
        dispatchEvent: (event) => {
          saved = event.detail;
        },
        appService: {
          showAlert: (alert) => assert.fail(JSON.stringify(alert)),
        },
      },
      { _event: { stopPropagation() {} } },
    );
    assert.deepEqual(saved, original);
    const command = {
      id: "command-one",
      projectId: "project-one",
      partition: "scene:scene-one",
      schemaVersion: 2,
      modelSchemaVersion: 16,
      type: "line.update_actions",
      payload: { lineId: "line-one", data: saved },
    };
    assert.deepEqual(validatePayload(command), { valid: true });
    const replayed = decodeCommandEnvelope(
      JSON.parse(JSON.stringify(encodeCommandEnvelope(command))),
    );
    assert.deepEqual(replayed.payload.data, original);
    assert.deepEqual(execute(original), expected);
    assert.deepEqual(execute(replayed.payload.data), expected);
  });
}
