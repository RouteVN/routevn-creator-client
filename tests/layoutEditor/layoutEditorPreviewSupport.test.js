import { describe, expect, it } from "vitest";
import {
  collectLayoutPreviewVariableIds,
  createSaveLoadPreviewSlots,
} from "../../src/internal/ui/layoutEditor/preview/index.js";
import { setSaveLoadDefaultValue } from "../../src/pages/layoutEditor/layoutEditor.store.js";

describe("layoutEditorPreviewSupport", () => {
  it("collects preview variable ids from fragments and paginated save/load slots", () => {
    const variableIds = collectLayoutPreviewVariableIds({
      currentLayoutId: "layout-1",
      currentLayoutData: {
        items: {
          fragmentRef: {
            type: "fragment-ref",
            fragmentLayoutId: "fragment-1",
          },
        },
      },
      currentLayoutType: "normal",
      layoutsData: {
        items: {
          "fragment-1": {
            layoutType: "normal",
            elements: {
              items: {
                slotContainer: {
                  type: "container-ref-save-load-slot",
                  paginationMode: "paginated",
                  paginationVariableId: "_currentSaveLoadPagination",
                },
                text: {
                  type: "text",
                  $when: 'variables["score"] == 7',
                },
              },
            },
          },
        },
      },
      layoutId: "layout-1",
    });

    expect(variableIds).toContain("_currentSaveLoadPagination");
    expect(variableIds).toContain("score");
  });

  it("builds the visible save/load preview page from paginationVariableId", () => {
    const slots = createSaveLoadPreviewSlots({
      saveLoadDefaultValues: {
        slotsNum: 12,
        saveImageIds: [
          "image-1",
          "image-2",
          "image-3",
          "image-4",
          "image-5",
          "image-6",
          "image-7",
          "image-8",
          "image-9",
        ],
        saveDates: [
          "2026-03-01 12:00",
          "2026-03-02 12:00",
          "2026-03-03 12:00",
          "2026-03-04 12:00",
          "2026-03-05 12:00",
          "2026-03-06 12:00",
          "2026-03-07 12:00",
          "2026-03-08 12:00",
          "2026-03-09 12:00",
        ],
      },
      saveLoadPreviewSettings: {
        paginationMode: "paginated",
        paginationVariableId: "_currentSaveLoadPagination",
        paginationSize: 3,
      },
      previewVariableValues: {
        _currentSaveLoadPagination: 2,
      },
      variablesData: {
        items: {},
      },
    });

    expect(slots).toEqual([
      {
        slotId: 7,
        image: "image-7",
        date: "2026-03-07 12:00",
        isAvailable: true,
      },
      {
        slotId: 8,
        image: "image-8",
        date: "2026-03-08 12:00",
        isAvailable: true,
      },
      {
        slotId: 9,
        image: "image-9",
        date: "2026-03-09 12:00",
        isAvailable: true,
      },
    ]);
  });

  it("writes save/load form edits back to the paginated slot window", () => {
    const state = {
      layout: {
        id: "layout-1",
        layoutType: "save",
      },
      layoutData: {
        items: {
          slotContainer: {
            type: "container-ref-save-load-slot",
            paginationMode: "paginated",
            paginationVariableId: "_currentSaveLoadPagination",
            paginationSize: 3,
          },
        },
      },
      layoutsData: {
        items: {},
      },
      variablesData: {
        items: {},
      },
      previewVariableValues: {
        _currentSaveLoadPagination: 1,
      },
      saveLoadDefaultValues: {
        slotsNum: 6,
        saveImageIds: [],
        saveDates: [],
      },
    };

    setSaveLoadDefaultValue(
      { state },
      {
        name: "saveDate0",
        fieldValue: "2026-03-04 18:00",
      },
    );

    expect(state.saveLoadDefaultValues.saveDates[3]).toBe("2026-03-04 18:00");
  });
});
