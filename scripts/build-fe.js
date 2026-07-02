import { readFileSync } from "node:fs";

import { build } from "@rettangoli/fe/cli";
import { load as loadYaml } from "js-yaml";

const config = loadYaml(readFileSync("rettangoli.config.yaml", "utf8")) ?? {};
const feConfig = config.fe ?? {};
const setup = process.argv[2] ?? feConfig.setup ?? "src/setup.web.js";

await build({
  dirs: feConfig.dirs ?? ["src/components", "src/pages"],
  outfile: feConfig.outfile ?? "_site/public/main.js",
  setup,
  i18n: feConfig.i18n ?? undefined,
});
