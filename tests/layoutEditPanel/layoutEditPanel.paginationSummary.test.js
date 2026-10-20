import { describe, expect, it } from "vitest";
import { selectLayoutEditPanelCopy } from "../../src/components/layoutEditPanel/support/layoutEditPanelCopy.js";
import { getSaveLoadPaginationSummary } from "../../src/components/layoutEditPanel/support/layoutEditPanelPagination.js";
import { EN_I18N, FR_I18N } from "../support/i18n.js";

const values = { paginationMode: "paginated", paginationSize: 6 };

describe("layoutEditPanel pagination summary", () => {
  it("joins the mode and its details with the catalog's label template", () => {
    expect(
      getSaveLoadPaginationSummary({
        values,
        copy: selectLayoutEditPanelCopy(EN_I18N),
      }),
    ).toBe("Paginated: Save/Load Pagination • 6 per page");

    const copy = selectLayoutEditPanelCopy(FR_I18N);
    expect(getSaveLoadPaginationSummary({ values, copy })).toBe(
      `${copy.paginatedOption} : ${copy.runtimeSaveLoadPaginationLabel} • ${copy.perPageCountLabel.replace("{count}", "6")}`,
    );
  });
});
