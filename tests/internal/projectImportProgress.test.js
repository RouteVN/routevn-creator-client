import { describe, expect, it } from "vitest";
import { createProjectImportProgressView } from "../../src/internal/projectImportProgress.js";

const COPY = {
  importDownloadingStatus: "Downloading… {received} of {total} ({percent}%)",
  importDownloadingUnknownStatus: "Downloading… {received}",
  importExtractingStatus: "Extracting files… {percent}%",
  importFinishingStatus: "Finishing up…",
};

const MB = 1024 * 1024;

describe("createProjectImportProgressView", () => {
  it("shows download size and percent against the content length", () => {
    expect(
      createProjectImportProgressView({
        copy: COPY,
        event: { stage: "downloading", current: 50 * MB, total: 200 * MB },
      }),
    ).toEqual({
      status: "Downloading… 50 MB of 200 MB (25%)",
      progress: { current: 50 * MB, total: 200 * MB },
    });
  });

  it("falls back to an indeterminate bar when the length is unknown", () => {
    expect(
      createProjectImportProgressView({
        copy: COPY,
        event: { stage: "downloading", current: 3 * MB, total: 0 },
      }),
    ).toEqual({ status: "Downloading… 3 MB", progress: {} });
  });

  it("rounds the percent down and never exceeds 100", () => {
    const almost = createProjectImportProgressView({
      copy: COPY,
      event: { stage: "downloading", current: 999, total: 1000 },
    });
    const over = createProjectImportProgressView({
      copy: COPY,
      event: { stage: "downloading", current: 2000, total: 1000 },
    });

    expect(almost.status).toContain("(99%)");
    expect(over.status).toContain("(100%)");
    expect(over.progress).toEqual({ current: 1000, total: 1000 });
  });

  it("shows extraction progress as a percent", () => {
    expect(
      createProjectImportProgressView({
        copy: COPY,
        event: { stage: "extracting", current: 30, total: 120 },
      }),
    ).toEqual({
      status: "Extracting files… 25%",
      progress: { current: 30, total: 120 },
    });
  });

  it.each([
    ["finishing", { stage: "finishing", current: 0, total: 0 }],
    [
      "an extraction without a total",
      { stage: "extracting", current: 1, total: 0 },
    ],
    ["an unknown stage", { stage: "other", current: 1, total: 2 }],
    ["no event", undefined],
  ])("uses the finishing view for %s", (_label, event) => {
    expect(createProjectImportProgressView({ copy: COPY, event })).toEqual({
      status: "Finishing up…",
      progress: {},
    });
  });

  it("treats malformed numbers as zero", () => {
    expect(
      createProjectImportProgressView({
        copy: COPY,
        event: { stage: "downloading", current: "x", total: -5 },
      }),
    ).toEqual({ status: "Downloading… 0 B", progress: {} });
  });
});
