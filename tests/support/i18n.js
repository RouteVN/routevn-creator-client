import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const EN_I18N_URL = new URL("../../src/i18n/en.yaml", import.meta.url);

export const EN_I18N = yaml.load(readFileSync(EN_I18N_URL, "utf8"));
