import { describe, expect, it } from "vitest";
import { sanitizeErrorMessage } from "../../src/deps/clients/errorReporting.js";
import { createErrorReporter } from "../../src/deps/clients/errorReporting.js";

describe("sanitizeErrorMessage", () => {
  it("keeps messages that only describe the failing code", () => {
    for (const message of [
      "Cannot read properties of undefined (reading 'width')",
      "Failed to execute 'drawImage' on 'CanvasRenderingContext2D'.",
      "Image 1 × 4097 exceeds this device's 4096 pixel texture limit.",
    ]) {
      expect(sanitizeErrorMessage(message)).toBe(message);
    }
  });

  it("removes secrets, emails, URLs and identifiers", () => {
    expect(
      sanitizeErrorMessage("Bearer secret-token for user@example.com"),
    ).toBe("<secret> for <email>");
    expect(sanitizeErrorMessage("password=hunter2 rejected")).toBe(
      "<secret> rejected",
    );
    expect(
      sanitizeErrorMessage("GET https://example.com/p?token=abc failed: 500"),
    ).toBe("GET <url> failed: 500");
    expect(
      sanitizeErrorMessage(
        "Texture 3f2b8c1e-aaaa-bbbb-cccc-1234567890ab missing for 12345678",
      ),
    ).toBe("Texture <id> missing for <n>");
  });

  it("does not leak file paths, including ones with spaces", () => {
    expect(
      sanitizeErrorMessage(
        "Failed to load /Users/jane/Projects/My Novel/bg.png",
      ),
    ).toBe("Failed to load <path>");
    expect(
      sanitizeErrorMessage("open C:\\Users\\Jane Doe\\My Novel\\a.png"),
    ).toBe("open <path>");
    expect(sanitizeErrorMessage("Error at /Users/jane/app.js")).toBe(
      "Error at app.js",
    );
    expect(
      sanitizeErrorMessage("ENOENT open 'C:\\Users\\Jane Doe\\a.png'"),
    ).toBe("ENOENT open '…'");
  });

  it("does not leak Android paths with spaces", () => {
    expect(
      sanitizeErrorMessage(
        "unable to open database file: /storage/emulated/0/Documents/Jane Doe Story/project.db",
      ),
    ).toBe("unable to open database file: <path>");
    expect(
      sanitizeErrorMessage(
        "/sdcard/RouteVN/Jane Doe Story/scene.json: open failed",
      ),
    ).toBe("<path>");
    expect(
      sanitizeErrorMessage(
        "copy failed: /data/user/0/com.example.app/files/Jane Doe/a.png",
      ),
    ).toBe("copy failed: <path>");
  });

  it("hides names in typographic quotes", () => {
    expect(
      sanitizeErrorMessage(
        "The file “project.db” couldn’t be saved in the folder “Jane Doe Story”.",
      ),
    ).toBe('The file "…" couldn’t be saved in the folder "…".');
    expect(
      sanitizeErrorMessage("Le dossier « Jane Doe » est introuvable."),
    ).toBe('Le dossier "…" est introuvable.');
    expect(sanitizeErrorMessage("Der Ordner „Jane Doe“ fehlt.")).toBe(
      'Der Ordner "…" fehlt.',
    );
    expect(sanitizeErrorMessage("フォルダ「山田の物語」が見つかりません")).toBe(
      'フォルダ"…"が見つかりません',
    );
  });

  it("hides quoted text that is not an identifier", () => {
    expect(sanitizeErrorMessage('{"name":"Jane Doe"}')).toBe('{"…":"…"}');
    expect(sanitizeErrorMessage("no such scene 'Chapter One'")).toBe(
      "no such scene '…'",
    );
  });

  it("drops serialized values, empty text and caps the length", () => {
    expect(
      sanitizeErrorMessage(
        'Non-Error promise rejection captured with value: {"a":1}',
      ),
    ).toBeUndefined();
    expect(sanitizeErrorMessage("   ")).toBeUndefined();
    expect(sanitizeErrorMessage(undefined)).toBeUndefined();
    expect(sanitizeErrorMessage("x".repeat(500))).toHaveLength(200);
  });

  it("falls back to the fixed message when nothing useful is left", () => {
    const { scrubErrorEvent } = createErrorReporter({ runtime: "web" });
    const event = scrubErrorEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "Non-Error promise rejection captured with value: {}",
            mechanism: { type: "onunhandledrejection", handled: false },
          },
        ],
      },
    });
    expect(event.message).toBe("Unhandled webview error");
    expect(event.exception.values[0].value).toBe("Unhandled webview error");
  });
});
