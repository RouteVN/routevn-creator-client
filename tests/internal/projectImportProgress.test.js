import { describe, expect, it } from "vitest";
import { createProjectImportProgressView } from "../../src/internal/projectImportProgress.js";

const COPY = {
  importDownloadingStatus: "Downloading… {received} of {total} ({percent}%)",
  importDownloadingUnknownStatus: "Downloading… {received}",
  importExtractingStatus: "Extracting files… {percent}%",
  importFinishingStatus: "Finishing up…",
};

const MB = 1024 * 1024;
const FINISHING = { status: "Finishing up…", progress: {} };

describe("createProjectImportProgressView", () => {
  it.each([
    // An unknown length leaves the bar indeterminate.
    [
      { stage: "downloading", current: 3 * MB, total: 0 },
      { status: "Downloading… 3 MB", progress: {} },
    ],
    // The percent rounds down and never passes 100.
    [
      { stage: "downloading", current: 999, total: 1000 },
      {
        status: expect.stringContaining("(99%)"),
        progress: { current: 999, total: 1000 },
      },
    ],
    [
      { stage: "downloading", current: 2000, total: 1000 },
      {
        status: expect.stringContaining("(100%)"),
        progress: { current: 1000, total: 1000 },
      },
    ],
    [{ stage: "extracting", current: 1, total: 0 }, FINISHING],
    [undefined, FINISHING],
    [
      { stage: "downloading", current: "x", total: -5 },
      { status: "Downloading… 0 B", progress: {} },
    ],
  ])("shows the view for %j", (event, expected) => {
    expect(createProjectImportProgressView({ copy: COPY, event })).toEqual(
      expected,
    );
  });
});
