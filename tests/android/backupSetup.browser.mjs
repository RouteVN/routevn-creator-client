// Run after build:android against a static _site server. Native calls are fixtures;
// real component rendering, routing, locale copy and picker callbacks are exercised.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = process.env.ANDROID_TEST_ORIGIN ?? "http://127.0.0.1:3017";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Page error:", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.addInitScript(() => {
    window.backupTrial = { selection: "cancel", calls: [] };
    const folder = {
      uri: "content://com.android.externalstorage.documents/tree/primary%3ABackups",
      displayPath: "Backups",
    };
    const state = () =>
      JSON.parse(
        localStorage.getItem("backupStatus") ??
          '{"configured":false,"projects":[]}',
      );
    const save = (value) => {
      localStorage.setItem("backupStatus", JSON.stringify(value));
      return value;
    };
    window.RouteVNAndroid = {
      postMessage(raw) {
        const { id, method, payload } = JSON.parse(raw);
        window.backupTrial.calls.push(method);
        let value = true;
        let error;
        switch (method) {
          case "isDebugBuild":
            value = true;
            break;
          case "getAppUpdateSupport":
            value = { status: "unsupported" };
            break;
          case "getWindowMetrics":
            value = { width: 390, height: 844 };
            break;
          case "appDbGet":
            value = localStorage.getItem("db:" + payload.key);
            break;
          case "appDbSet":
            localStorage.setItem("db:" + payload.key, payload.valueJson);
            break;
          case "appDbRemove":
            localStorage.removeItem("db:" + payload.key);
            break;
          case "listProjectFolders":
            value = [];
            break;
          case "getBackupStatus":
            value = state();
            break;
          case "disableBackup":
            value = save({ configured: false, projects: [] });
            break;
          case "openFolderPicker":
            queueMicrotask(() =>
              window.__routeVNAndroidFolderPickerResult({
                requestId: payload.requestId,
                folder:
                  window.backupTrial.selection === "cancel"
                    ? undefined
                    : folder,
              }),
            );
            break;
          case "configureBackup":
            value = save({
              configured: true,
              folder,
              projects: Array.from({ length: 50 }, (_, index) => ({
                id: `project-${index}`,
                name: `Project ${index + 1}`,
                pending: true,
                error: "lowSpace",
              })),
            });
            break;
          case "beginBackupPass":
            value = { due: true };
            break;
          case "getPendingBackupProjects":
            value = { projectIds: [] };
            break;
          case "appDbInit":
          case "updateBackState":
          case "markSplashReady":
            break;
          default:
            error = {
              code: "unsupported",
              message: "Unexpected fixture method " + method,
            };
        }
        queueMicrotask(() =>
          window.RouteVNAndroid.onmessage({
            data: JSON.stringify({ version: 1, id, ok: !error, value, error }),
          }),
        );
      },
    };
  });
  await page.goto(origin + "/android/index.html");
  // Startup goes straight to Projects; the footer card owns setup entry now.
  await page
    .locator("rvn-android-backup-status")
    .getByText("Set up backup folder", { exact: true })
    .waitFor({ timeout: 10000 })
    .catch(async (error) => {
      console.error(await page.locator("body").innerText());
      console.error(await page.evaluate(() => window.backupTrial));
      throw error;
    });
  await page
    .locator("rvn-android-backup-status")
    .getByText("Set up backup folder", { exact: true })
    .click();
  await page.getByText("Setup backup folder", { exact: true }).waitFor();
  await page.locator("#setupFolderButton").click();
  assert.equal(await page.locator("#continueFolderButton").count(), 0);
  await page.locator("#skipBackupButton").click();
  await page.getByText("Continue without backups?", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByText("Setup backup folder", { exact: true }).waitFor();
  await page.locator("#skipBackupButton").click();
  await page.getByText("Continue without backups", { exact: true }).click();
  await page
    .locator("rvn-android-backup-status")
    .getByText("Set up backup folder", { exact: true })
    .waitFor();
  await page.reload();
  await page
    .locator("rvn-android-backup-status")
    .getByText("Set up backup folder", { exact: true })
    .click();
  await page.evaluate(() => {
    window.backupTrial.selection = "valid";
  });
  await page.locator("#setupFolderButton").click();
  await page.getByText("Backup folder is set", { exact: true }).waitFor();
  await page.locator("#continueFolderButton").click();
  await page
    .getByText(
      "Backup paused. Free up space on your device or backup storage. At least 1 GB must remain free after the backup.",
      { exact: true },
    )
    .first()
    .waitFor();
  await page.screenshot({ path: "/tmp/routevn-android-backup-card.png" });
  const scrollBox = await page.locator("#projectsScroll").boundingBox();
  const changeFolderBox = await page.locator("#setupBackup").boundingBox();
  assert.ok(
    scrollBox.height > 200,
    "Backup errors must leave room for the project browser",
  );
  assert.ok(
    changeFolderBox.y + changeFolderBox.height <= 844,
    "Folder action must remain on screen",
  );
  assert.equal(await page.getByText("Project 50", { exact: true }).count(), 0);
  await page.locator("#setupBackup").click();
  await page.locator("#stopBackupButton").click();
  await page.getByText("Stop local backups?", { exact: true }).waitFor();
  await page.getByText(/Existing backups will remain/).waitFor();
  await page.keyboard.press("Escape");
  assert.ok(
    !(await page.evaluate(() => window.backupTrial.calls)).includes(
      "disableBackup",
    ),
  );
  await page.locator("#stopBackupButton").click();
  await page.locator("#confirmStopBackup").click();
  await page.getByText("No backup set up", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("No backup set up", { exact: true }).waitFor();
  await page.locator("#setupBackup").click();
  assert.equal(await page.locator("#stopBackupButton").count(), 0);
  await page.evaluate(() => {
    window.backupTrial.selection = "valid";
  });
  await page.locator("#setupFolderButton").click();
  await page.getByText("Backup folder is set", { exact: true }).waitFor();
  await page.locator("#continueFolderButton").click();
  // Settings normally sits inside a project route. Mount the actual page here
  // so this empty-library fixture does not need to invent an editable database.
  await page.evaluate(() => {
    document.querySelector("rvn-app").remove();
    document.body.append(document.createElement("rvn-config"));
  });
  await page
    .getByText("Android local backups", { exact: true })
    .waitFor({ timeout: 10000 })
    .catch(async (error) => {
      console.error(await page.locator("body").innerText());
      throw error;
    });
  assert.deepEqual(errors, []);
  console.log(
    "Android backup setup, cancellation, skip, low-space card and settings passed.",
  );
} finally {
  await browser.close();
}
