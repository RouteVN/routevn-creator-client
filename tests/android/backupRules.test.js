import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readRepoFile = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const normalizeXml = (xml) => xml.replace(/\s+/g, " ").trim();

const readXmlSection = (xml, tagName) => {
  const match = normalizeXml(xml).match(
    new RegExp(`<${tagName}(?: [^>]*)?>(.*?)</${tagName}>`),
  );
  return match?.[1]?.trim() ?? "";
};

const ALL_BACKUP_DOMAINS = [
  "root",
  "file",
  "database",
  "sharedpref",
  "external",
  "device_root",
  "device_file",
  "device_database",
  "device_sharedpref",
];

describe("Android backup policy", () => {
  it("enables controlled Android backup configuration", async () => {
    const manifest = await readRepoFile(
      "android/routevn/app/src/main/AndroidManifest.xml",
    );

    expect(manifest).toContain('android:allowBackup="true"');
    expect(manifest).toContain(
      'android:dataExtractionRules="@xml/data_extraction_rules"',
    );
    expect(manifest).toContain(
      'android:fullBackupContent="@xml/backup_rules"',
    );
  });

  it("excludes all cloud data and transfers only complete project roots on Android 12+", async () => {
    const rules = await readRepoFile(
      "android/routevn/app/src/main/res/xml/data_extraction_rules.xml",
    );
    const cloudRules = readXmlSection(rules, "cloud-backup");
    const transferRules = readXmlSection(rules, "device-transfer");

    for (const domain of ALL_BACKUP_DOMAINS) {
      expect(cloudRules).toContain(
        `<exclude domain="${domain}" path="." />`,
      );
    }
    expect(cloudRules).not.toContain("<include");
    expect(transferRules).toBe(
      '<include domain="file" path="projects/" />',
    );
  });

  it("uses D2D-only project transfer on Android 9-11 and no backup on older devices", async () => {
    const legacyRules = await readRepoFile(
      "android/routevn/app/src/main/res/xml/backup_rules.xml",
    );
    const d2dRules = normalizeXml(
      await readRepoFile(
        "android/routevn/app/src/main/res/xml-v28/backup_rules.xml",
      ),
    );

    for (const domain of ALL_BACKUP_DOMAINS) {
      expect(legacyRules).toContain(
        `<exclude domain="${domain}" path="." />`,
      );
    }
    expect(legacyRules).not.toContain("<include");
    expect(d2dRules).toContain('domain="file"');
    expect(d2dRules).toContain('path="projects/"');
    expect(d2dRules).toContain(
      'requireFlags="deviceToDeviceTransfer"',
    );
  });
});
