import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setSearchQuery,
} from "../../src/components/groupVariablesView/groupVariablesView.store.js";

const TEST_I18N = {
  resourcePages: {},
  variablesPage: {
    booleanTrueLabel: "はい",
    scopeContextLabel: "コンテキスト",
    variableTypeBooleanLabel: "真偽値",
  },
};

const createProps = () => ({
  flatGroups: [
    {
      id: "folder-1",
      name: "Progress",
      children: [
        {
          id: "variable-1",
          name: "Can Continue",
          scope: "context",
          variableType: "boolean",
          default: true,
        },
      ],
    },
  ],
});

describe("groupVariablesView.store", () => {
  it("searches localized variable type labels", () => {
    const state = createInitialState();

    setSearchQuery({ state }, { query: "真偽値" });

    const viewData = selectViewData({
      state,
      props: createProps(),
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups).toHaveLength(1);
    expect(viewData.flatGroups[0].children).toMatchObject([
      {
        id: "variable-1",
        variableType: "真偽値",
      },
    ]);
  });

  it("searches localized boolean default labels", () => {
    const state = createInitialState();

    setSearchQuery({ state }, { query: "はい" });

    const viewData = selectViewData({
      state,
      props: createProps(),
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups).toHaveLength(1);
    expect(viewData.flatGroups[0].children).toMatchObject([
      {
        id: "variable-1",
        default: "はい",
      },
    ]);
  });

  it("does not show the empty add row for groups with child folders", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        flatGroups: [
          {
            id: "parent-folder",
            children: [],
            hasChildFolders: true,
          },
          {
            id: "empty-folder",
            children: [],
          },
        ],
      },
      i18n: TEST_I18N,
    });

    expect(viewData.flatGroups[0]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
        showEmptyAdd: false,
      }),
    );
    expect(viewData.flatGroups[1]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
        showEmptyAdd: true,
      }),
    );
  });
});
