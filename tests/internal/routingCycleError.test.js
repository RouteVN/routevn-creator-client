import { describe, expect, it } from "vitest";
import {
  formatRoutingCycleMessage,
  getRoutingCycleLines,
  isRoutingCycleError,
} from "../../src/internal/routingCycleError.js";

const createLoopError = (pointer) =>
  Object.assign(new Error("Routing cycle"), { code: "routing_cycle", pointer });

// Scene One has two sections and Scene Two has one.
const projectData = {
  story: {
    scenes: {
      "scene-1": {
        name: "Scene One",
        sections: {
          "section-1": {
            name: "Section One",
            lines: [
              { id: "line-1", actions: {} },
              { id: "line-2", actions: {} },
            ],
          },
          "section-2": {
            name: "Section Two",
            lines: [{ id: "line-1", actions: {} }],
          },
        },
      },
      "scene-2": {
        name: "Scene Two",
        sections: {
          "section-3": {
            name: "Section Three",
            lines: [
              { id: "line-1", actions: {} },
              { id: "line-2", actions: {} },
            ],
          },
        },
      },
    },
  },
};

const line = (sceneName, sectionName, lineNumber) => ({
  sceneName,
  sectionName,
  lineNumber,
});

describe("routing cycle error", () => {
  it("recognises the engine's loop error, also inside an AggregateError", () => {
    const error = createLoopError({});

    expect(isRoutingCycleError(error)).toBe(true);
    expect(isRoutingCycleError(new AggregateError([error], "Cleanup"))).toBe(
      true,
    );
    expect(isRoutingCycleError(new Error("Other"))).toBe(false);
  });

  it("names the lines the engine lists, in the engine's order", () => {
    const error = Object.assign(
      createLoopError({ sectionId: "section-2", lineId: "line-1" }),
      {
        cycle: [
          { sectionId: "section-2", lineId: "line-1" },
          { sectionId: "section-1", lineId: "line-1" },
        ],
      },
    );
    const expected = {
      isWholeLoop: true,
      lines: [
        line("Scene One", "Section Two", 1),
        line("Scene One", "Section One", 1),
      ],
    };

    expect(getRoutingCycleLines(error, projectData)).toEqual(expected);
    expect(
      getRoutingCycleLines(
        new AggregateError([new Error("Other"), error], "Cleanup"),
        projectData,
      ),
    ).toEqual(expected);
  });

  it("names lines in different scenes and a line listed alone", () => {
    const crossScene = Object.assign(
      createLoopError({ sectionId: "section-3", lineId: "line-2" }),
      {
        cycle: [
          { sectionId: "section-3", lineId: "line-2" },
          { sectionId: "section-1", lineId: "line-1" },
        ],
      },
    );
    const selfLoop = Object.assign(
      createLoopError({ sectionId: "section-3", lineId: "line-1" }),
      { cycle: [{ sectionId: "section-3", lineId: "line-1" }] },
    );

    expect(getRoutingCycleLines(crossScene, projectData)).toEqual({
      isWholeLoop: true,
      lines: [
        line("Scene Two", "Section Three", 2),
        line("Scene One", "Section One", 1),
      ],
    });
    expect(getRoutingCycleLines(selfLoop, projectData)).toEqual({
      isWholeLoop: true,
      lines: [line("Scene Two", "Section Three", 1)],
    });
  });

  it.each([
    ["the engine lists no lines", []],
    ["the error has no list", undefined],
    [
      "a listed line is not in the project data",
      [
        { sectionId: "section-3", lineId: "line-2" },
        { sectionId: "section-9", lineId: "line-1" },
      ],
    ],
  ])("names only the line the engine stopped on when %s", (_label, cycle) => {
    const error = Object.assign(
      createLoopError({ sectionId: "section-3", lineId: "line-2" }),
      { cycle },
    );

    expect(getRoutingCycleLines(error, projectData)).toEqual({
      isWholeLoop: false,
      lines: [line("Scene Two", "Section Three", 2)],
    });
  });

  it.each([
    ["the error names no line", {}],
    [
      "the section is not in the project data",
      { sectionId: "section-9", lineId: "line-1" },
    ],
    [
      "the line is not in the project data",
      { sectionId: "section-1", lineId: "line-9" },
    ],
  ])("names no lines when %s", (_label, pointer) => {
    expect(
      getRoutingCycleLines(createLoopError(pointer), projectData),
    ).toBeUndefined();
  });

  it("names no lines without project data", () => {
    expect(
      getRoutingCycleLines(
        createLoopError({ sectionId: "section-1", lineId: "line-1" }),
        undefined,
      ),
    ).toBeUndefined();
  });

  const copy = {
    transitionLoopLines: "Loop lines:",
    transitionLoopStoppedAt: "Stopped at:",
    transitionLoopLine: "{scene} / {section} / {line}",
  };

  it("lists the lines of a whole loop, keeping names as they are written", () => {
    expect(
      formatRoutingCycleMessage({
        message: "Loop message",
        copy,
        cycleLines: {
          isWholeLoop: true,
          lines: [line("{line} $&", "Section {scene}", 4), line("B", "C", 1)],
        },
      }),
    ).toBe(
      "Loop message\n\nLoop lines:\n• {line} $& / Section {scene} / 4\n• B / C / 1",
    );
  });

  it("says where the engine stopped when the whole loop is not known", () => {
    expect(
      formatRoutingCycleMessage({
        message: "Loop message",
        copy,
        cycleLines: { isWholeLoop: false, lines: [line("A", "B", 2)] },
      }),
    ).toBe("Loop message\n\nStopped at:\n• A / B / 2");
  });

  it("leaves the message alone when no lines are known", () => {
    expect(
      formatRoutingCycleMessage({
        message: "Loop message",
        copy,
        cycleLines: undefined,
      }),
    ).toBe("Loop message");
  });
});
