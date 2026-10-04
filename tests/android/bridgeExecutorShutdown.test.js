import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readRepoFile = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

// onDestroy shuts the bridge executor down, but the main looper can still
// deliver a WebView message posted just before. An unguarded execute then
// throws RejectedExecutionException on the main thread and crashes the app
// (seen on a Galaxy Tab running Android 16).
describe("Android bridge executor after the activity is destroyed", () => {
  it("only hands bridge work to the executor through the guard, except onDestroy's own cleanup", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );

    expect(activity).toContain("ExecutorGuard.submit(bridgeExecutor, () -> {");

    // The only direct call left runs in onDestroy, before the shutdown.
    const direct = [...activity.matchAll(/bridgeExecutor\.execute\(/g)];
    expect(direct).toHaveLength(1);
    const onDestroy = activity.slice(
      activity.indexOf("protected void onDestroy()"),
    );
    expect(onDestroy.indexOf("bridgeExecutor.execute(")).toBeLessThan(
      onDestroy.indexOf("bridgeExecutor.shutdown()"),
    );
    expect(onDestroy.indexOf("bridgeExecutor.execute(")).toBeGreaterThan(-1);

    // Both message paths that can run after onDestroy use the guard.
    const listener = activity.slice(
      activity.indexOf("WebViewCompat.addWebMessageListener("),
      activity.indexOf("private void showUnsupportedWebViewError()"),
    );
    expect(listener).toContain("ExecutorGuard.submit(bridgeExecutor,");
    const reset = activity.slice(
      activity.indexOf("private void resetDeadPageState()"),
    );
    expect(reset.slice(0, reset.indexOf("\n    }\n"))).toContain(
      "ExecutorGuard.submit(bridgeExecutor,",
    );
  });
});
