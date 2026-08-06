/**
 * Applies / reverts the hydration patch to the nested @rettangoli/fe copy that
 * `rtgl fe build` actually compiles from.
 *
 *   node ssr-poc/hydration/apply.js on
 *   node ssr-poc/hydration/apply.js off
 *
 * Backups live beside the originals as *.ssr-poc-backup so `off` is exact.
 * This exists only so the POC can prove hydration against the real runtime;
 * the real change would land in the framework repo.
 */

import { copyFileSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FE = path.join(ROOT, "node_modules/@rettangoli/fe");
const ORCHESTRATOR = path.join(FE, "src/core/runtime/componentOrchestrator.js");
const HYDRATION_TARGET = path.join(FE, "src/core/runtime/hydrationVNode.js");
const HYDRATION_SOURCE = path.join(import.meta.dirname, "hydrationVNode.js");
const BACKUP = `${ORCHESTRATOR}.ssr-poc-backup`;

const ORIGINAL = `    if (!instance._oldVNode) {
      instance._oldVNode = instance.patch(instance.renderTarget, vDom);
    } else {`;

const PATCHED = `    if (!instance._oldVNode) {
      // --- SSR POC: hydrating first patch -------------------------------
      // Only when the host is flagged by the server. Build an old vnode from
      // the server DOM so snabbdom diffs against it instead of appending.
      let hydrationSeed = null;
      if (
        instance.getAttribute &&
        instance.getAttribute("data-rtgl-hydrate") !== null &&
        !instance.__rtglHydrationDone
      ) {
        instance.__rtglHydrationDone = true;
        hydrationSeed = buildHydrationVNode({
          vDom,
          rootElm: instance.renderTarget,
        });
      }
      if (hydrationSeed) {
        instance._oldVNode = instance.patch(hydrationSeed, vDom);
      } else {
        // MISMATCH FALLBACK. snabbdom's emptyNodeAt() synthesises an old vnode
        // with children:[], so patching against a populated render target
        // APPENDS the client tree beside the server's instead of replacing it.
        // Without this clear, a mismatch produces a visibly duplicated tree --
        // i.e. it costs correctness, not just the SSR benefit.
        if (instance.__rtglHydrationDone && instance.renderTarget) {
          instance.renderTarget.textContent = "";
        }
        instance._oldVNode = instance.patch(instance.renderTarget, vDom);
      }
      // --- end SSR POC ---------------------------------------------------
    } else {`;

const IMPORT_ANCHOR = `import { parseView } from "../../parser.js";`;
const IMPORT_PATCHED = `import { parseView } from "../../parser.js";
import { buildHydrationVNode } from "./hydrationVNode.js";`;

const mode = process.argv[2];

if (mode === "on") {
  if (!existsSync(BACKUP)) copyFileSync(ORCHESTRATOR, BACKUP);
  copyFileSync(HYDRATION_SOURCE, HYDRATION_TARGET);

  let source = readFileSync(BACKUP, "utf8");
  if (!source.includes(ORIGINAL)) {
    console.error("[hydration] patch anchor not found -- fe version changed?");
    process.exit(1);
  }
  if (!source.includes(IMPORT_ANCHOR)) {
    console.error("[hydration] import anchor not found -- fe version changed?");
    process.exit(1);
  }
  source = source.replace(IMPORT_ANCHOR, IMPORT_PATCHED).replace(ORIGINAL, PATCHED);
  writeFileSync(ORCHESTRATOR, source);
  console.log("[hydration] patch APPLIED to", path.relative(ROOT, ORCHESTRATOR));
} else if (mode === "off") {
  if (existsSync(BACKUP)) {
    copyFileSync(BACKUP, ORCHESTRATOR);
    rmSync(BACKUP);
  }
  if (existsSync(HYDRATION_TARGET)) rmSync(HYDRATION_TARGET);
  console.log("[hydration] patch REVERTED");
} else {
  console.error("usage: apply.js on|off");
  process.exit(1);
}
