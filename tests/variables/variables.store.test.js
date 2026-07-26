import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
  setSelectedItemId,
} from "../../src/pages/variables/variables.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("variables.store", () => {
  it("keeps variable resource type separate from value type", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        variablesData: {
          items: {
            folder1: {
              id: "folder1",
              type: "folder",
              name: "Progress",
            },
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
              scope: "context",
            },
          },
          tree: [
            {
              id: "folder1",
              children: [{ id: "score" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const folder = viewData.flatItems.find((item) => item.id === "folder1");
    const variable = viewData.flatItems.find((item) => item.id === "score");

    expect(folder.svg).toBeUndefined();
    expect(variable).toMatchObject({
      type: "variable",
      variableType: "number",
    });
  });

  it("marks groups that contain child folders", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        variablesData: {
          items: {
            parentFolder: {
              id: "parentFolder",
              type: "folder",
              name: "Parent",
            },
            childFolder: {
              id: "childFolder",
              type: "folder",
              name: "Child",
            },
          },
          tree: [
            {
              id: "parentFolder",
              children: [{ id: "childFolder" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const parentGroup = viewData.flatGroups.find(
      (group) => group.id === "parentFolder",
    );
    const childGroup = viewData.flatGroups.find(
      (group) => group.id === "childFolder",
    );

    expect(parentGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
      }),
    );
    expect(childGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
      }),
    );
  });

  it("describes computed operations and dependencies without evaluating them", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        variablesData: {
          items: {
            folder1: { id: "folder1", type: "folder", name: "Progress" },
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
              scope: "context",
              default: 0,
            },
            label: {
              id: "label",
              type: "variable",
              variableType: "string",
              name: "Label",
              computed: {
                branches: [
                  {
                    when: { gte: [{ var: "variables.score" }, 10] },
                    expr: "High",
                  },
                ],
                default: { expr: "Low" },
              },
            },
          },
          tree: [
            {
              id: "folder1",
              children: [{ id: "score" }, { id: "label" }],
            },
          ],
        },
      },
    );
    setSelectedItemId({ state }, { itemId: "label" });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.detailFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Operation",
          value: "If",
        }),
        expect.objectContaining({ label: "Dependencies", value: "Score" }),
      ]),
    );
    expect(viewData.detailFields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Scope" })]),
    );
  });
});
