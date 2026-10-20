import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  showContextMenu,
  selectViewData,
  setProgressiveRenderedItemCount,
  toggleGroupCollapse,
} from "../../src/components/catalogResourcesView/catalogResourcesView.store.js";

describe("catalogResourcesView.store", () => {
  it("keeps the selected item visible inside a collapsed group", () => {
    const state = createInitialState();
    toggleGroupCollapse(
      { state },
      {
        groupId: "folder-1",
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        selectedItemId: "animation-1",
        groups: [
          {
            id: "folder-1",
            name: "Folder",
            fullLabel: "Folder",
            children: [
              {
                id: "animation-1",
                name: "Imported Animation",
              },
            ],
          },
        ],
      },
    });

    expect(viewData.groups[0].isCollapsed).toBe(false);
    expect(viewData.groups[0].children).toEqual([
      expect.objectContaining({
        id: "animation-1",
        name: "Imported Animation",
        transitionOutgoingLabel: "Outgoing",
        transitionIncomingLabel: "Incoming",
      }),
    ]);
  });

  it("uses a two-column mobile default with a six-column maximum", () => {
    const props = {
      mobileLayout: true,
      showZoomControls: true,
      zoomControlMode: "columns",
      groups: [
        {
          id: "folder-1",
          children: [{ id: "color-1", cardKind: "color" }],
        },
      ],
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({ state, props });

    expect(viewData.showZoomControls).toBe(true);
    expect(viewData.itemsPerRow).toBe(2);
    expect(viewData.cardGridColumns).toBe("2");
    expect(viewData.zoomControlMax).toBe(6);
    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        itemContainerStyle: "width: 100%; box-sizing: border-box;",
        itemWidth: "f",
      }),
    );
  });

  it("clamps saved mobile catalog columns to six", () => {
    const props = {
      mobileLayout: true,
      showZoomControls: true,
      zoomControlMode: "columns",
      defaultItemsPerRow: 12,
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({ state, props });

    expect(state.itemsPerRow).toBe(6);
    expect(viewData.itemsPerRow).toBe(6);
    expect(viewData.cardGridColumns).toBe("6");
    expect(viewData.zoomControlMax).toBe(6);
  });

  it("reserves catalog placeholders before progressive hydration", () => {
    const state = createInitialState();
    const props = {
      progressiveRender: true,
      groups: [
        {
          id: "folder-1",
          hasChildren: true,
          children: [
            { id: "color-1", cardKind: "color" },
            { id: "color-2", cardKind: "color" },
          ],
        },
      ],
    };

    setProgressiveRenderedItemCount({ state }, { itemCount: 0 });
    const viewData = selectViewData({ state, props });

    expect(viewData.groups[0].children).toEqual([
      expect.objectContaining({
        isPlaceholder: true,
        domItemId: "",
        cursor: "default",
      }),
      expect.objectContaining({ isPlaceholder: true }),
    ]);
    expect(viewData.groups[0].hasChildren).toBe(true);
  });

  it("does not show the empty add card for groups with child folders", () => {
    const state = createInitialState();
    const props = {
      groups: [
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
    };

    const viewData = selectViewData({ state, props });

    expect(viewData.groups[0]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
        showEmptyAdd: false,
      }),
    );
    expect(viewData.groups[1]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
        showEmptyAdd: true,
      }),
    );
  });
});

it("uses the clicked item's context menu rather than the selected item's menu", () => {
  const state = createInitialState();
  const customMenu = [
    {
      type: "item",
      label: "Clear Default",
      value: "clear-default-dialogue-avatar",
    },
  ];
  const props = {
    selectedItemId: "one",
    groups: [{ children: [{ id: "two", contextMenuItems: customMenu }] }],
    itemContextMenuItems: [
      { type: "item", label: "Delete", value: "delete-item" },
    ],
  };
  showContextMenu({ state, props }, { itemId: "two", x: 1, y: 2 });
  expect(state.dropdownMenu.items).toEqual(customMenu);
  showContextMenu({ state, props }, { itemId: "one", x: 1, y: 2 });
  expect(state.dropdownMenu.items).toEqual(props.itemContextMenuItems);
});

describe("catalogResourcesView.store localized copy", () => {
  const animationGroups = [
    {
      id: "folder-1",
      children: [
        {
          id: "animation-1",
          name: "Animation One",
          cardKind: "animation",
          animationType: "transition",
          animationTypeLabel: "Transição",
        },
        { id: "color-1", name: "Color One", cardKind: "color" },
      ],
    },
  ];

  it("builds the animation type line from the catalog template", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: { groups: animationGroups },
      i18n: {
        resourcePages: { typeSummaryTemplate: "Tipo: {type}" },
        animationEditorPage: {
          outTimelineLabel: "Saída",
          inTimelineLabel: "Entrada",
        },
      },
    });

    const [animationCard, colorCard] = viewData.groups[0].children;
    expect(animationCard).toMatchObject({
      animationTypeSummary: "Tipo: Transição",
      transitionOutgoingLabel: "Saída",
      transitionIncomingLabel: "Entrada",
    });
    expect(colorCard.animationTypeSummary).toBeUndefined();
  });

  it("keeps the side labels a page passes on an animation card", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        groups: [
          {
            id: "folder-1",
            children: [
              {
                id: "audio-effect-1",
                cardKind: "animation",
                transitionOutgoingLabel: "Page outgoing",
                transitionIncomingLabel: "Page incoming",
              },
            ],
          },
        ],
      },
      i18n: {
        animationEditorPage: {
          outTimelineLabel: "Saída",
          inTimelineLabel: "Entrada",
        },
      },
    });

    expect(viewData.groups[0].children[0]).toMatchObject({
      transitionOutgoingLabel: "Page outgoing",
      transitionIncomingLabel: "Page incoming",
    });
  });

  it("renders the type line without a hardcoded prefix", () => {
    const view = readFileSync(
      "src/components/catalogResourcesView/catalogResourcesView.view.yaml",
      "utf8",
    );

    expect(view).toContain(
      "- rtgl-text s=xs c=mu-fg mb=md: ${item.animationTypeSummary}",
    );
    expect(view).not.toContain("Type: ");
  });

  it("falls back to a localized Delete item and add label", () => {
    const state = createInitialState();
    const props = { groups: animationGroups };
    const i18n = {
      resourcePages: { deleteMenuItem: "Apagar", addText: "Adicionar" },
    };

    showContextMenu({ state, props }, { itemId: "animation-1", x: 1, y: 2 });
    const viewData = selectViewData({ state, props, i18n });

    expect(viewData.dropdownMenu).toMatchObject({
      isOpen: true,
      targetItemId: "animation-1",
      items: [{ label: "Apagar", type: "item", value: "delete-item" }],
    });
    expect(viewData.addText).toBe("Adicionar");
  });
});
