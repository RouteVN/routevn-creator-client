import { describe, expect, it } from "vitest";
import {
  createInitialState,
  hydratePreviewState,
  selectPreviewData,
  setLayoutState,
  setRepositoryState,
  setSaveLoadDefaultValue,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";
import { createPersistedPreviewState } from "../../src/internal/layoutEditorPreview/layoutEditorPreviewPersistence.js";
import {
  MAX_SAVE_LOAD_PREVIEW_SLOTS,
  MAX_SAVE_LOAD_PREVIEW_SLOTS_PER_PAGE,
  createSaveLoadPreviewSlots,
  createSaveLoadPreviewViewData,
  getSaveLoadPreviewWindow,
} from "../../src/internal/layoutEditorPreview/layoutEditorPreviewSaveLoad.js";
import { createLayoutThumbnailSource } from "../../src/internal/layoutPreview.js";
import { EN_I18N } from "../support/i18n.js";

const PAGE_TARGET = "runtime.saveLoadPagination";

const createPaginatedLayoutElements = (paginationSize) => ({
  items: {
    slots: {
      id: "slots",
      type: "container-ref-save-load-slot",
      paginationMode: "paginated",
      paginationSize,
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    },
  },
  tree: [{ id: "slots" }],
});

const createPreviewState = ({ elements, repositoryState }) => {
  const state = createInitialState();
  setLayoutState(
    { state },
    {
      layoutState: {
        id: "layout-1",
        layoutType: "save-load",
        elements,
      },
    },
  );
  setRepositoryState({ state }, { repositoryState });
  return state;
};

const EMPTY_COLLECTION = { items: {}, tree: [] };
const REPOSITORY_STATE = {
  layouts: EMPTY_COLLECTION,
  images: EMPTY_COLLECTION,
  variables: EMPTY_COLLECTION,
};

describe("a saved Preview with a very high save slot", () => {
  it("leaves out a save slot past the last one the Preview shows", () => {
    const persisted = createPersistedPreviewState({
      saveSlots: [{ slotId: 200000000, date: "2026-03-10 18:00" }],
    });

    // No slot is left, so the Preview shows its sample slots.
    expect(persisted.saveLoadDefaultValues).toBeUndefined();
  });

  it("keeps the slots in range next to one past it", () => {
    const persisted = createPersistedPreviewState({
      saveSlots: [
        { slotId: 2, image: "image-2", date: "2026-03-02 12:00" },
        { slotId: 200000000, image: "image-x", date: "2026-03-10 18:00" },
        { slotId: 2 ** 32 + 5, date: "2026-03-11 18:00" },
        { slotId: 1e300, date: "2026-03-12 18:00" },
      ],
    });

    expect(persisted.saveLoadDefaultValues).toEqual({
      slotsNum: 2,
      saveImageIds: [undefined, "image-2"],
      saveDates: ["", "2026-03-02 12:00"],
    });
  });

  it("keeps the last slot the Preview shows and leaves out the next", () => {
    const last = createPersistedPreviewState({
      saveSlots: [
        { slotId: MAX_SAVE_LOAD_PREVIEW_SLOTS, date: "2026-03-02 12:00" },
      ],
    });
    const past = createPersistedPreviewState({
      saveSlots: [
        { slotId: MAX_SAVE_LOAD_PREVIEW_SLOTS + 1, date: "2026-03-02 12:00" },
      ],
    });

    expect(last.saveLoadDefaultValues.slotsNum).toBe(
      MAX_SAVE_LOAD_PREVIEW_SLOTS,
    );
    expect(last.saveLoadDefaultValues.saveDates.at(-1)).toBe(
      "2026-03-02 12:00",
    );
    expect(past.saveLoadDefaultValues).toBeUndefined();
  });

  it("still fills the slots between the ones that were saved", () => {
    const persisted = createPersistedPreviewState({
      saveSlots: [
        { slotId: 1, date: "2026-03-01 12:00" },
        { slotId: 3, image: "image-3", date: "2026-03-03 12:00" },
      ],
    });

    expect(persisted.saveLoadDefaultValues).toEqual({
      slotsNum: 3,
      saveImageIds: [undefined, undefined, "image-3"],
      saveDates: ["2026-03-01 12:00", "", "2026-03-03 12:00"],
    });
  });

  it("opens a paginated Save/Load layout whose Preview saved a page of 200 million", () => {
    const state = createPreviewState({
      elements: createPaginatedLayoutElements(6),
      repositoryState: REPOSITORY_STATE,
    });
    const previewData = {
      runtime: { saveLoadPagination: 200000000 },
      saveSlots: [1, 2, 3, 4, 5, 6].map((index) => ({
        slotId: 199999999 * 6 + index,
        savedAt: Date.parse("2026-03-10T18:00:00Z"),
        isAvailable: true,
      })),
    };

    hydratePreviewState({ state, i18n: EN_I18N }, { previewData });

    const shown = selectPreviewData({ state, i18n: EN_I18N });
    expect(state.previewVariableValues[PAGE_TARGET]).toBe(200000000);
    expect(shown.saveSlots).toHaveLength(6);
    for (const slot of shown.saveSlots) {
      expect(slot.slotId).toBeLessThanOrEqual(MAX_SAVE_LOAD_PREVIEW_SLOTS);
    }
  });

  it("keeps editing the slots of a page typed with too many digits", () => {
    const state = createPreviewState({
      elements: createPaginatedLayoutElements(6),
      repositoryState: REPOSITORY_STATE,
    });
    state.previewVariableValues[PAGE_TARGET] = 200000000;

    setSaveLoadDefaultValue(
      { state },
      { name: "saveDate0", fieldValue: "2026-03-04 18:00" },
    );

    // The date is kept by slot number, so the arrays stay as short as the
    // slot numbers the Preview shows, and the form can be keyed by them.
    expect(state.saveLoadDefaultValues.saveDates.length).toBeLessThanOrEqual(
      MAX_SAVE_LOAD_PREVIEW_SLOTS,
    );
    const viewData = createSaveLoadPreviewViewData({
      currentLayoutId: "layout-1",
      currentLayoutData: state.layoutState.elements,
      currentLayoutType: "save-load",
      layoutsData: REPOSITORY_STATE.layouts,
      saveLoadDefaultValues: state.saveLoadDefaultValues,
      previewVariableValues: state.previewVariableValues,
      images: REPOSITORY_STATE.images,
    });
    expect(viewData.visibleSaveLoadSlots).toHaveLength(6);
    expect(viewData.visibleSaveLoadSlots[0].date).toBe("2026-03-04 18:00");
    expect(typeof viewData.saveLoadFormKey).toBe("string");
  });

  it("draws the thumbnail of a layout whose Preview saved a very high save slot", () => {
    const repositoryState = {
      project: { resolution: { width: 1280, height: 720 } },
      images: EMPTY_COLLECTION,
      fonts: EMPTY_COLLECTION,
      colors: EMPTY_COLLECTION,
      textStyles: EMPTY_COLLECTION,
      sounds: EMPTY_COLLECTION,
      particles: EMPTY_COLLECTION,
      layouts: EMPTY_COLLECTION,
    };
    const item = {
      id: "layout-1",
      type: "layout",
      layoutType: "save-load",
      elements: createPaginatedLayoutElements(6),
      preview: {
        runtime: { saveLoadPagination: 200000000 },
        saveSlots: [{ slotId: 1200000000, isAvailable: false }],
      },
    };

    const source = createLayoutThumbnailSource({ item, repositoryState });

    expect(source.width).toBe(1280);
    expect(source.height).toBe(720);
  });
});

describe("the save slots the Preview shows", () => {
  const paginated = (paginationSize) => ({
    paginationMode: "paginated",
    paginationSize,
  });
  const windowAt = ({ page, size }) =>
    getSaveLoadPreviewWindow({
      saveLoadPreviewSettings: paginated(size),
      previewVariableValues: { [PAGE_TARGET]: page },
    });

  it("shows the page that was asked for", () => {
    expect(windowAt({ page: 3, size: 3 })).toEqual({
      startIndex: 6,
      slotCount: 3,
      pageIndex: 3,
      slotsPerPage: 3,
    });
  });

  it("keeps a page typed with too many digits to the last page it shows", () => {
    const page = windowAt({ page: 200000000, size: 6 });

    expect(page.pageIndex).toBe(100);
    expect(page.startIndex).toBe(594);
    expect(page.slotCount).toBe(6);
  });

  it("keeps a page size typed with too many digits to the most slots it shows", () => {
    const page = windowAt({ page: 1, size: 1000000000 });

    expect(page.slotCount).toBe(MAX_SAVE_LOAD_PREVIEW_SLOTS_PER_PAGE);
    expect(
      windowAt({ page: 200000000, size: 1000000000 }).startIndex +
        MAX_SAVE_LOAD_PREVIEW_SLOTS_PER_PAGE,
    ).toBe(MAX_SAVE_LOAD_PREVIEW_SLOTS);
  });

  it("rounds a page and a page size down to whole numbers", () => {
    expect(windowAt({ page: 2.9, size: 4 }).pageIndex).toBe(2);
    expect(windowAt({ page: 2, size: 2.5 })).toMatchObject({
      startIndex: 2,
      slotCount: 2,
    });
    expect(windowAt({ page: 1, size: 0.4 }).slotCount).toBe(1);
  });

  it("shows page 1 for a page that is not a positive number", () => {
    for (const page of [0, -5, "abc", undefined, Infinity, NaN]) {
      expect(windowAt({ page, size: 3 }).pageIndex).toBe(1);
    }
  });

  it("shows no slots for a page size that is not a positive number", () => {
    for (const size of [0, -3, "abc", undefined, Infinity, NaN]) {
      expect(windowAt({ page: 2, size }).slotCount).toBe(0);
    }
  });

  it("keeps the number of slots of a continuous layout to the most it shows", () => {
    const shown = (slotsNum) =>
      getSaveLoadPreviewWindow({ saveLoadDefaultValues: { slotsNum } });

    expect(shown(4)).toEqual({
      startIndex: 0,
      slotCount: 4,
      pageIndex: 0,
      slotsPerPage: 4,
    });
    expect(shown(1000000000).slotCount).toBe(
      MAX_SAVE_LOAD_PREVIEW_SLOTS_PER_PAGE,
    );
  });

  it("builds a bounded list of slots for a page and a size typed with too many digits", () => {
    const slots = createSaveLoadPreviewSlots({
      saveLoadDefaultValues: { slotsNum: 3, saveImageIds: [], saveDates: [] },
      saveLoadPreviewSettings: paginated(1000000000),
      previewVariableValues: { [PAGE_TARGET]: 200000000 },
    });

    expect(slots).toHaveLength(MAX_SAVE_LOAD_PREVIEW_SLOTS_PER_PAGE);
    expect(slots.at(-1).slotId).toBe(MAX_SAVE_LOAD_PREVIEW_SLOTS);
  });
});
