export const DEFAULT_SAVE_LOAD_DATE_FORMAT = "YYYY-MM-DD";

export const SAVE_LOAD_DATE_FORMAT_PRESETS = [
  {
    label: "YYYY-MM-DD",
    value: "YYYY-MM-DD",
    suffixText: "2026-12-31",
  },
  {
    label: "DD/MM/YYYY",
    value: "DD/MM/YYYY",
    suffixText: "31/12/2026",
  },
  {
    label: "MM/DD/YYYY",
    value: "MM/DD/YYYY",
    suffixText: "12/31/2026",
  },
  {
    label: "DD MMM YYYY",
    value: "DD MMM YYYY",
    suffixText: "31 Dec 2026",
  },
  {
    label: "YYYY年MM月DD日",
    value: "YYYY年MM月DD日",
    suffixText: "2026年12月31日",
  },
];

const SAVE_LOAD_DATE_FORMATS = new Set(
  SAVE_LOAD_DATE_FORMAT_PRESETS.map(({ value }) => value),
);

export const normalizeSaveLoadDateFormat = (value) =>
  SAVE_LOAD_DATE_FORMATS.has(value) ? value : DEFAULT_SAVE_LOAD_DATE_FORMAT;
