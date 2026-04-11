import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

describe("commandLineRuntimeAction schema", () => {
  it("declares mode and action under an object props schema", () => {
    const schemaUrl = new URL(
      "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.schema.yaml",
      import.meta.url,
    );
    const schemaSource = readFileSync(schemaUrl, "utf8");
    const schema = yaml.load(schemaSource);

    expect(schema).toMatchObject({
      componentName: "rvn-command-line-runtime-action",
      propsSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
          },
          action: {
            type: "object",
          },
        },
      },
    });
  });
});
