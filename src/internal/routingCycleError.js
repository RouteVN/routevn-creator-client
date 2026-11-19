// route-engine-js stops an immediate routing cycle with this code. When the
// engine's own cleanup also fails, the error arrives inside an AggregateError.
export const isRoutingCycleError = (error) =>
  error?.code === "routing_cycle" ||
  (error?.errors ?? []).some(isRoutingCycleError);

// The engine's own loop error, which may sit inside an AggregateError.
const findRoutingCycleError = (error) =>
  error?.code === "routing_cycle"
    ? error
    : (error?.errors ?? []).map(findRoutingCycleError).find(Boolean);

// A line as the scene editor names it: scene and section names and the
// line's number within its section.
const describeLine = (projectData, { sectionId, lineId }) => {
  const found = findSection(projectData, sectionId);
  const lineIndex = (found?.section.lines ?? []).findIndex(
    (line) => line.id === lineId,
  );
  if (lineIndex === -1) return undefined;
  return {
    sceneName: found.scene.name,
    sectionName: found.section.name,
    lineNumber: lineIndex + 1,
  };
};

const findSection = (projectData, sectionId) => {
  for (const scene of Object.values(projectData?.story?.scenes ?? {})) {
    const section = scene.sections?.[sectionId];
    if (section) return { scene, section };
  }
  return undefined;
};

// The lines of the loop the engine stopped in, as the scene editor names
// them. `projectData` is the project data the engine was playing.
//
// route-engine-js lists the loop's lines on its error as `cycle`, starting
// with the line it stopped on. When that list is empty, or one of its lines
// is not in the project data, only the line the engine stopped on is
// returned (`isWholeLoop` is false). Nothing is returned when that line
// cannot be found either.
export const getRoutingCycleLines = (error, projectData) => {
  const cycleError = findRoutingCycleError(error);
  const cycle = cycleError?.cycle ?? [];
  const cycleLines = cycle.map((linePointer) =>
    describeLine(projectData, linePointer),
  );
  if (cycleLines.length > 0 && cycleLines.every(Boolean)) {
    return { lines: cycleLines, isWholeLoop: true };
  }

  const pointer = cycleError?.pointer;
  if (!pointer?.sectionId || !pointer.lineId) return undefined;
  const stoppedLine = describeLine(projectData, pointer);
  if (!stoppedLine) return undefined;
  return { lines: [stoppedLine], isWholeLoop: false };
};

// The loop message, followed by the lines of the loop when they are known.
// `copy.transitionLoopLine` has {scene}, {section} and {line} placeholders.
export const formatRoutingCycleMessage = ({ message, copy, cycleLines }) => {
  if (!cycleLines) return message;
  const heading = cycleLines.isWholeLoop
    ? copy.transitionLoopLines
    : copy.transitionLoopStoppedAt;
  const lineTexts = cycleLines.lines.map((line) => {
    const values = {
      "{scene}": line.sceneName,
      "{section}": line.sectionName,
      "{line}": String(line.lineNumber),
    };
    const text = copy.transitionLoopLine.replaceAll(
      /\{scene\}|\{section\}|\{line\}/g,
      (placeholder) => values[placeholder],
    );
    return `• ${text}`;
  });
  return `${message}\n\n${heading}\n${lineTexts.join("\n")}`;
};

// The loop strings, for a caller whose catalog may not be loaded.
export const ROUTING_CYCLE_FALLBACK_COPY = Object.freeze({
  transitionLoop:
    "Transitions kept repeating without waiting for the player. Make sure your transitions don't cause an infinite loop.",
  transitionLoopLines: "Lines in the loop:",
  transitionLoopStoppedAt: "It stopped at:",
  transitionLoopLine: "{scene} → {section} → line {line}",
});
