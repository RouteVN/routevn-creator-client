import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setLayouts,
} from "../../src/components/commandLinePushOverlay/commandLinePushOverlay.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("commandLinePushOverlay.store", () => {
  it("splits the layout options into a section for each folder", () => {
    const state = createInitialState();
    setLayouts(
      { state },
      {
        layouts: {
          items: {
            title: { type: "layout", name: "Title" },
            menus: { type: "folder", name: "Menus" },
            options: { type: "layout", name: "Options" },
            save: { type: "layout", name: "Save" },
            dialogs: { type: "folder", name: "Dialogs" },
            confirm: { type: "layout", name: "Confirm" },
            empty: { type: "folder", name: "Empty" },
            credits: { type: "layout", name: "Credits" },
          },
          tree: [
            { id: "title" },
            {
              id: "menus",
              children: [
                { id: "options" },
                { id: "dialogs", children: [{ id: "confirm" }] },
                { id: "save" },
              ],
            },
            { id: "empty", children: [] },
            { id: "credits" },
          ],
        },
      },
    );

    expect(
      selectViewData({ state, i18n: EN_I18N }).context.layoutOptions,
    ).toEqual([
      { value: "title", label: "Title" },
      { value: "credits", label: "Credits" },
      { type: "section", label: "Menus" },
      { value: "options", label: "Options" },
      { value: "save", label: "Save" },
      { type: "section", label: "Menus > Dialogs" },
      { value: "confirm", label: "Confirm" },
    ]);
  });
});
