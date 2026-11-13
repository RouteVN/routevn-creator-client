import { sanitizeArtifactFileName } from "./artifactFileName.js";
import { requireProjectResolution } from "./projectResolution.js";

// Switches Android APK export off again if needed: when false, the Versions
// page hides its export button and Platform Details hides the Android platform.
export const ANDROID_EXPORT_RELEASED = true;

export const isValidAndroidBackgroundColor = (value) =>
  typeof value === "string" &&
  value.length === 7 &&
  /^#[0-9a-f]{6}$/i.test(value);

export const normalizeAndroidBackgroundColor = (value) => {
  if (!isValidAndroidBackgroundColor(value)) {
    throw new Error(
      "Android background colors must use opaque #RRGGBB values.",
    );
  }
  return value.toUpperCase();
};

export const createAndroidApkFileName = (applicationName, version, signed) =>
  `${sanitizeArtifactFileName(
    signed
      ? `${applicationName}-${version}`
      : `${applicationName}-${version}-unsigned`,
  )}.apk`;

// A signing certificate's SHA-256 as the project records it: 64 lowercase hex
// digits.
export const isAndroidCertificateSha256 = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

const isBase64 = (value) =>
  typeof value === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(value);

const normalizeAndroidSigningKey = (value) => {
  if (
    !isAndroidCertificateSha256(value?.certificateSha256) ||
    !isBase64(value.certificate) ||
    !isBase64(value.privateKey)
  ) {
    return undefined;
  }
  return {
    certificateSha256: value.certificateSha256,
    certificate: value.certificate,
    privateKey: value.privateKey,
    origin: value.origin === "uploaded" ? "uploaded" : "created",
    addedAt: Number.isFinite(value.addedAt) ? value.addedAt : 0,
  };
};

// The keys Creator can use from the project's `androidSigning` record: every
// signing key the game has had, and `currentKey`, the fingerprint of the one
// that signs new builds. A key Creator cannot read is left out of this view,
// and `currentKey` is kept only when its key is usable. The stored record is
// never rewritten from this view (see `addAndroidSigningKey`).
export const normalizeAndroidSigning = (value) => {
  const keys = [];
  for (const entry of Array.isArray(value?.keys) ? value.keys : []) {
    const key = normalizeAndroidSigningKey(entry);
    if (
      key &&
      !keys.some(
        ({ certificateSha256 }) => certificateSha256 === key.certificateSha256,
      )
    ) {
      keys.push(key);
    }
  }
  const signing = { keys };
  if (
    keys.some(
      ({ certificateSha256 }) => certificateSha256 === value?.currentKey,
    )
  ) {
    signing.currentKey = value.currentKey;
  }
  return signing;
};

export const findAndroidSigningKey = (signing, certificateSha256) =>
  signing.keys.find((key) => key.certificateSha256 === certificateSha256);

// A copy of the stored record to change. Entries and fields this version does
// not read, such as a key written by a later Creator, are kept as they are:
// a signing key cannot be made again, so a write never drops one.
const copyStoredAndroidSigning = (stored) => {
  const next =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? structuredClone(stored)
      : {};
  if (!Array.isArray(next.keys)) next.keys = [];
  return next;
};

// Makes `material` the current key of the stored record. A key the game
// already had keeps its origin and date; the key it replaces stays as a
// previous key.
export const addAndroidSigningKey = (stored, material, { origin, addedAt }) => {
  const next = copyStoredAndroidSigning(stored);
  if (
    !findAndroidSigningKey(
      normalizeAndroidSigning(stored),
      material.certificateSha256,
    )
  ) {
    const key = normalizeAndroidSigningKey({
      certificateSha256: material.certificateSha256,
      certificate: material.certificate,
      privateKey: material.privateKey,
      origin,
      addedAt,
    });
    if (!key) {
      throw new Error("Invalid Android signing key.");
    }
    next.keys.push(key);
  }
  next.currentKey = material.certificateSha256;
  return next;
};

// Use Again: makes a previous key current in the stored record.
export const useAndroidSigningKey = (stored, certificateSha256) => {
  if (
    !findAndroidSigningKey(normalizeAndroidSigning(stored), certificateSha256)
  ) {
    throw new Error("This project has no signing key with that fingerprint.");
  }
  const next = copyStoredAndroidSigning(stored);
  next.currentKey = certificateSha256;
  return next;
};

// What the UI shows of the keys: no key material.
export const summarizeAndroidSigning = (signing) => {
  const describe = ({ certificateSha256, origin, addedAt }) => ({
    certificateSha256,
    origin,
    addedAt,
  });
  const current = findAndroidSigningKey(signing, signing.currentKey);
  return {
    currentKey: current ? describe(current) : undefined,
    previousKeys: signing.keys
      .filter((key) => key !== current)
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(describe),
  };
};

// AB:CD:... as keytool, apksigner, and Play Console show fingerprints.
export const formatAndroidCertificateFingerprint = (certificateSha256) =>
  certificateSha256.toUpperCase().match(/.{2}/g).join(":");

// keytool refuses shorter PKCS #12 passwords.
export const MIN_ANDROID_KEYSTORE_PASSWORD_LENGTH = 6;
// The alias of the key in a copy saved with Save a Copy.
export const ANDROID_KEY_COPY_ALIAS = "key0";

export const getAndroidExportOrientation = (resolution) => {
  const { width, height } = requireProjectResolution(resolution);
  return height > width ? "portrait" : "landscape";
};
