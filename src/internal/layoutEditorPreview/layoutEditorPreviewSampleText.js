// The sample text the layout editor's Preview shows until it is edited. The
// layout editor passes it in the app's language. A layout's thumbnail is
// saved with the project and drawn again only when what it shows changes, so
// until the Preview is edited it draws this English text, the same in every
// language. Editing the Preview saves its values, sample text included, in
// the language it was shown in, and the thumbnail then draws those.
export const DEFAULT_PREVIEW_SAMPLE_TEXT = Object.freeze({
  characterName: "Character",
  narratorName: "Narrator",
  dialogueContent: "This is a sample dialogue content.",
  nvlLines: Object.freeze([
    "This is the first sample NVL line.",
    "This is the second sample NVL line.",
    "This is the third sample NVL line.",
  ]),
  nvlLine: "This is sample NVL line {index}.",
  choice: "Choice {index}",
  historyLines: Object.freeze([
    "The first history line.",
    "The second history line.",
    "The third history line.",
  ]),
  historyLine: "History line {index}",
});

// The sample text of the line or choice at `index`, counted from 0, from a
// template such as "Choice {index}".
export const formatSampleLine = (template, index) =>
  template.replaceAll("{index}", String(index + 1));
