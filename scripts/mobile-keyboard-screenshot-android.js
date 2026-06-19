import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { _android as android } from "playwright";

const usage = [
  "Usage:",
  "  ROUTEVN_KEYBOARD_TEST_URL='http://127.0.0.1:3001/project/scene-editor?p=...' bun run test:mobile-keyboard:android",
  "  bun run test:mobile-keyboard:android -- 'http://127.0.0.1:3001/project/scene-editor?p=...'",
  "",
  "Optional env:",
  "  ANDROID_SERIAL=<adb device serial>",
  "  ROUTEVN_KEYBOARD_TEST_OUT_DIR=.artifacts/mobile-keyboard",
  "  ROUTEVN_KEYBOARD_TEST_FOCUS_SELECTOR='rvn-lexical-scene-document-editor #editor'",
  "  ROUTEVN_KEYBOARD_TEST_WAIT_MS=1600",
].join("\n");

const testUrl = process.argv[2] || process.env.ROUTEVN_KEYBOARD_TEST_URL;
const outDir =
  process.env.ROUTEVN_KEYBOARD_TEST_OUT_DIR || ".artifacts/mobile-keyboard";
const focusSelector =
  process.env.ROUTEVN_KEYBOARD_TEST_FOCUS_SELECTOR ||
  "rvn-lexical-scene-document-editor #editor";
const waitMs = Number(process.env.ROUTEVN_KEYBOARD_TEST_WAIT_MS || 1600);
const requestedSerial = process.env.ANDROID_SERIAL;

if (!testUrl) {
  console.error(usage);
  process.exit(1);
}

const screenshotPaths = {
  pageBefore: path.join(outDir, "page-before.png"),
  pageAfter: path.join(outDir, "page-after-keyboard.png"),
  deviceBefore: path.join(outDir, "device-before.png"),
  deviceAfter: path.join(outDir, "device-after-keyboard.png"),
  metrics: path.join(outDir, "metrics.json"),
};

const getLocalhostReversePort = (url) => {
  const parsedUrl = new URL(url);
  const isLocalhost =
    parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";

  if (!isLocalhost || !parsedUrl.port) {
    return undefined;
  }

  return parsedUrl.port;
};

const runAdb = ({ serial, args }) => {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  const result = spawnSync("adb", adbArgs, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(stderr || stdout || `adb ${adbArgs.join(" ")} failed`);
  }

  return result.stdout.trim();
};

const selectDevice = (devices) => {
  if (devices.length === 0) {
    throw new Error(
      [
        "No Android device or emulator found.",
        "Run `adb devices` and make sure a real phone is authorized or an emulator is booted.",
      ].join(" "),
    );
  }

  if (!requestedSerial) {
    return devices[0];
  }

  const device = devices.find(
    (candidateDevice) => candidateDevice.serial() === requestedSerial,
  );

  if (!device) {
    const availableSerials = devices
      .map((candidateDevice) => candidateDevice.serial())
      .join(", ");
    throw new Error(
      `ANDROID_SERIAL=${requestedSerial} was not found. Available devices: ${availableSerials}`,
    );
  }

  return device;
};

const bestEffortShell = async (device, command) => {
  try {
    await device.shell(command);
  } catch (error) {
    console.warn(`Skipped Android shell command: ${command}`);
    console.warn(error.message);
  }
};

const focusEditor = async (page) => {
  const editor = page.locator(focusSelector).first();
  await editor.waitFor({ state: "visible", timeout: 15000 });

  try {
    const tapPoint = await page.evaluate((selector) => {
      const queryDeep = (root) => {
        const directMatch = root.querySelector?.(selector);
        if (directMatch) {
          return directMatch;
        }

        const allElements = root.querySelectorAll?.("*") || [];
        for (const element of allElements) {
          if (element.shadowRoot) {
            const match = queryDeep(element.shadowRoot);
            if (match) {
              return match;
            }
          }
        }

        return undefined;
      };

      const editorElement = queryDeep(document);
      if (!editorElement) {
        return undefined;
      }

      const rect = editorElement.getBoundingClientRect();
      const left = Math.max(rect.left, 0);
      const right = Math.min(rect.right, window.innerWidth);
      const top = Math.max(rect.top, 0);
      const bottom = Math.min(rect.bottom, window.innerHeight);
      const width = right - left;
      const height = bottom - top;

      if (width < 8 || height < 8) {
        return undefined;
      }

      return {
        x: Math.round(left + width / 2),
        y: Math.round(top + Math.min(32, height / 2)),
      };
    }, focusSelector);

    if (!tapPoint) {
      throw new Error(`${focusSelector} has no visible tap area`);
    }

    await page.touchscreen.tap(tapPoint.x, tapPoint.y);
    return;
  } catch (tapError) {
    console.warn(
      `Coordinate tap failed for ${focusSelector}; trying locator tap.`,
    );
    console.warn(tapError.message);
  }

  try {
    await editor.tap({ timeout: 7000 });
    return;
  } catch (locatorTapError) {
    console.warn(`Locator tap failed for ${focusSelector}; trying click.`);
    console.warn(locatorTapError.message);
  }

  try {
    await editor.click({ timeout: 7000 });
    return;
  } catch (clickError) {
    console.warn(`Click failed for ${focusSelector}; trying DOM focus.`);
    console.warn(clickError.message);
  }

  await page.evaluate((selector) => {
    const queryDeep = (root) => {
      const directMatch = root.querySelector?.(selector);
      if (directMatch) {
        return directMatch;
      }

      const allElements = root.querySelectorAll?.("*") || [];
      for (const element of allElements) {
        if (element.shadowRoot) {
          const match = queryDeep(element.shadowRoot);
          if (match) {
            return match;
          }
        }
      }

      return undefined;
    };

    const editorElement = queryDeep(document);
    editorElement?.focus?.({ preventScroll: true });
  }, focusSelector);
};

const collectMetrics = async (page) =>
  page.evaluate((selector) => {
    const toPlainRect = (rect) => ({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    });

    const queryDeep = (root, targetSelector) => {
      const directMatch = root.querySelector?.(targetSelector);
      if (directMatch) {
        return directMatch;
      }

      const allElements = root.querySelectorAll?.("*") || [];
      for (const element of allElements) {
        if (element.shadowRoot) {
          const match = queryDeep(element.shadowRoot, targetSelector);
          if (match) {
            return match;
          }
        }
      }

      return undefined;
    };

    const rectFor = (targetSelector) => {
      const element = queryDeep(document, targetSelector);
      return element ? toPlainRect(element.getBoundingClientRect()) : undefined;
    };

    const activeElementPath = [];
    let activeElement = document.activeElement;
    while (activeElement) {
      activeElementPath.push(
        activeElement.id
          ? `${activeElement.localName}#${activeElement.id}`
          : activeElement.localName,
      );
      activeElement = activeElement.shadowRoot?.activeElement;
    }

    const visualViewport = window.visualViewport;
    const virtualKeyboard = navigator.virtualKeyboard;

    return {
      activeElementPath,
      devicePixelRatio: window.devicePixelRatio,
      documentElementRect: toPlainRect(
        document.documentElement.getBoundingClientRect(),
      ),
      focusSelector: selector,
      rects: {
        app: rectFor("rvn-app"),
        canvas: rectFor("rvn-scene-editor-preview-canvas"),
        editor: rectFor(selector),
        lexicalEditor: rectFor("rvn-lexical-scene-document-editor"),
        mobileToolbar: rectFor("rvn-mobile-keyboard-toolbar"),
        sceneEditor: rectFor("rvn-scene-editor-lexical"),
      },
      scroll: {
        documentTop: document.documentElement.scrollTop,
        bodyTop: document.body.scrollTop,
        windowX: window.scrollX,
        windowY: window.scrollY,
      },
      viewport: {
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        visualHeight: visualViewport?.height,
        visualOffsetLeft: visualViewport?.offsetLeft,
        visualOffsetTop: visualViewport?.offsetTop,
        visualPageLeft: visualViewport?.pageLeft,
        visualPageTop: visualViewport?.pageTop,
        visualWidth: visualViewport?.width,
      },
      virtualKeyboard: virtualKeyboard
        ? {
            boundingRect: virtualKeyboard.boundingRect
              ? toPlainRect(virtualKeyboard.boundingRect)
              : undefined,
            overlaysContent: virtualKeyboard.overlaysContent,
          }
        : undefined,
    };
  }, focusSelector);

const main = async () => {
  await mkdir(outDir, { recursive: true });

  const devices = await android.devices();
  let device;
  let context;

  try {
    device = selectDevice(devices);
    const serial = device.serial();
    const reversePort = getLocalhostReversePort(testUrl);

    if (reversePort) {
      runAdb({
        serial,
        args: ["reverse", `tcp:${reversePort}`, `tcp:${reversePort}`],
      });
      console.log(
        `ADB reverse active: tcp:${reversePort} -> tcp:${reversePort}`,
      );
    }

    await bestEffortShell(device, "input keyevent KEYCODE_WAKEUP");
    await bestEffortShell(
      device,
      "settings put secure show_ime_with_hard_keyboard 1",
    );

    console.log(`Using Android device: ${device.model()} (${serial})`);

    context = await device.launchBrowser({
      hasTouch: true,
      isMobile: true,
      viewport: null,
    });

    const page = await context.newPage();

    await page.goto(testUrl, { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    await page.screenshot({
      path: screenshotPaths.pageBefore,
      fullPage: false,
    });
    await device.screenshot({ path: screenshotPaths.deviceBefore });

    await focusEditor(page);
    await page.waitForTimeout(waitMs);

    await page.screenshot({
      path: screenshotPaths.pageAfter,
      fullPage: false,
    });
    await device.screenshot({ path: screenshotPaths.deviceAfter });

    const metrics = await collectMetrics(page);
    await writeFile(
      screenshotPaths.metrics,
      `${JSON.stringify(metrics, null, 2)}\n`,
    );

    console.log("Android keyboard screenshots written:");
    console.log(`  ${screenshotPaths.deviceBefore}`);
    console.log(`  ${screenshotPaths.deviceAfter}`);
    console.log(`  ${screenshotPaths.pageBefore}`);
    console.log(`  ${screenshotPaths.pageAfter}`);
    console.log(`  ${screenshotPaths.metrics}`);
  } finally {
    await context?.close();
    await device?.close();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
