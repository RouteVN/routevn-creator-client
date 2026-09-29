import { describe, it, expect, vi } from "vitest";
import { filterImageUploadFiles } from "../../src/internal/ui/imageUploadValidation.js";
import { EN_I18N } from "../support/i18n.js";

const file = (name) => new File([], name, { type: "image/png" });

describe("image upload batch feedback", () => {
  it.each([1, 3])(
    "reports %i rejected files once and preserves accepted files",
    async (count) => {
      const valid = file("Image One.png");
      const rejected = Array.from({ length: count }, (_, i) => ({
        file: file(`Large ${i + 1}.png`),
        width: 100,
        height: 5000 + i,
      }));
      const deps = {
        i18n: EN_I18N,
        appService: { showAlert: vi.fn() },
        projectService: {
          validateImageUploadFiles: vi.fn(async () => ({
            files: [valid],
            rejected,
            limit: 4096,
          })),
        },
      };
      expect(
        await filterImageUploadFiles(deps, [
          valid,
          ...rejected.map((x) => x.file),
        ]),
      ).toEqual([valid]);
      expect(deps.appService.showAlert).toHaveBeenCalledOnce();
      const { message } = deps.appService.showAlert.mock.calls[0][0];
      for (const { file: rejectedFile, height } of rejected) {
        expect(message).toContain(`${rejectedFile.name} (100 × ${height})`);
      }
      expect(message).toContain("4096");
    },
  );

  it("returns no uploads and one warning when the entire selection is oversized", async () => {
    const selected = file("Large.png");
    const deps = {
      i18n: EN_I18N,
      appService: { showAlert: vi.fn() },
      projectService: {
        validateImageUploadFiles: vi.fn(async () => ({
          files: [],
          rejected: [{ file: selected, width: 4097, height: 1 }],
          limit: 4096,
        })),
      },
    };
    expect(await filterImageUploadFiles(deps, [selected])).toEqual([]);
    expect(deps.appService.showAlert).toHaveBeenCalledOnce();
  });
});
