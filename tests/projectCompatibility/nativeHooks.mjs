import { registerHooks } from "node:module";
const sql = new URL("./sqliteBridge.mjs", import.meta.url).href;
const path =
  "data:text/javascript," +
  encodeURIComponent(
    'import path from "node:path"; export const join = async (...parts) => path.join(...parts);',
  );
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tauri-apps/plugin-sql")
      return { url: sql, shortCircuit: true };
    if (specifier === "@tauri-apps/api/path")
      return { url: path, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
