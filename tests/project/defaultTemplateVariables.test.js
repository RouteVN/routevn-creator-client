import { readFileSync } from "node:fs";
import { validateState } from "@routevn/creator-model";
import { describe, expect, it } from "vitest";

const defaultRepositoryTemplate = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);

describe("default template variables", () => {
  it("has a Player Name folder holding the Player Name variable", () => {
    const { items, tree } = defaultRepositoryTemplate.variables;
    const folderNode = tree.find(
      (node) =>
        items[node.id].type === "folder" &&
        items[node.id].name === "Player Name",
    );

    expect(folderNode.children).toHaveLength(1);
    const [variableNode] = folderNode.children;
    expect(items[variableNode.id]).toEqual({
      id: variableNode.id,
      type: "variable",
      name: "Player Name",
      description: "",
      variableType: "string",
      scope: "context",
      default: "Player Name",
      value: "Player Name",
      isEnum: false,
      enumValues: [],
    });
  });

  it("has one Player Name variable", () => {
    const playerNameVariables = Object.values(
      defaultRepositoryTemplate.variables.items,
    ).filter((item) => item.type === "variable" && item.name === "Player Name");

    expect(playerNameVariables).toHaveLength(1);
  });

  it("is a valid project state", () => {
    expect(validateState({ state: defaultRepositoryTemplate })).toEqual({
      valid: true,
    });
  });
});
