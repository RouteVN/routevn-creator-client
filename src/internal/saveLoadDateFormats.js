export const DEFAULT_SAVE_LOAD_DATE_FORMAT = "DD/MM/YYYY";

export const SAVE_LOAD_DATE_FORMAT_PRESETS = [
  { label: "31/12/2026", value: "DD/MM/YYYY" },
  { label: "12/31/2026", value: "MM/DD/YYYY" },
  { label: "2026-12-31", value: "YYYY-MM-DD" },
  { label: "31 Dec 2026", value: "DD MMM YYYY" },
  { label: "2026年12月31日", value: "YYYY年MM月DD日" },
];

const SAVE_LOAD_DATE_FORMATS = new Set(
  SAVE_LOAD_DATE_FORMAT_PRESETS.map(({ value }) => value),
);

export const normalizeSaveLoadDateFormat = (value) =>
  SAVE_LOAD_DATE_FORMATS.has(value) ? value : DEFAULT_SAVE_LOAD_DATE_FORMAT;
