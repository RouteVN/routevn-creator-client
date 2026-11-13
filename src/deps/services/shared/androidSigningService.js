import {
  ANDROID_KEY_COPY_ALIAS,
  addAndroidSigningKey,
  findAndroidSigningKey,
  normalizeAndroidSigning,
  summarizeAndroidSigning,
  useAndroidSigningKey,
} from "../../../internal/androidExport.js";

// The project's Android signing keys. The project database holds them; the
// host only makes, reads, and writes keys and signs APKs. Hosts without the
// signing commands export unsigned APKs only.
export const createAndroidSigningService = ({
  fileAdapter,
  filePicker,
  getProjectId,
  getAndroidSigningByProjectId,
  setAndroidSigningByProjectId,
  now = () => Date.now(),
}) => {
  // Key changes run one at a time, so quick repeated clicks never make two
  // keys or lose one.
  let queue = Promise.resolve();
  const runInOrder = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const requireProjectId = () => {
    const projectId = getProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    return projectId;
  };

  // The keys Creator can use. The stored record may also hold keys it
  // cannot read, which every write keeps.
  const getUsableSigning = async (projectId) =>
    normalizeAndroidSigning(await getAndroidSigningByProjectId(projectId));

  const addKey = async (projectId, material, origin) => {
    const stored = await getAndroidSigningByProjectId(projectId);
    const changed =
      normalizeAndroidSigning(stored).currentKey !== material.certificateSha256;
    if (changed) {
      await setAndroidSigningByProjectId(
        projectId,
        addAndroidSigningKey(stored, material, { origin, addedAt: now() }),
      );
    }
    return { certificateSha256: material.certificateSha256, changed };
  };

  const supportsAndroidSigning = () =>
    typeof fileAdapter.createAndroidSigningKey === "function";

  const getAndroidSigningSummary = async () =>
    summarizeAndroidSigning(await getUsableSigning(requireProjectId()));

  // The key signed exports use. The first signed export makes it.
  const ensureAndroidSigningKey = ({ applicationName, applicationId }) => {
    const projectId = requireProjectId();
    return runInOrder(async () => {
      const signing = await getUsableSigning(projectId);
      if (signing.currentKey) {
        return { certificateSha256: signing.currentKey, created: false };
      }
      const material = await fileAdapter.createAndroidSigningKey({
        applicationName,
        applicationId,
      });
      await addKey(projectId, material, "created");
      return { certificateSha256: material.certificateSha256, created: true };
    });
  };

  // Create Key and Replace Key: a new key becomes current.
  const createAndroidSigningKey = ({ applicationName, applicationId }) => {
    const projectId = requireProjectId();
    return runInOrder(async () =>
      addKey(
        projectId,
        await fileAdapter.createAndroidSigningKey({
          applicationName,
          applicationId,
        }),
        "created",
      ),
    );
  };

  const promptAndroidKeystorePath = async (options = {}) =>
    fileAdapter.promptAndroidKeystorePath({ options, filePicker });

  // Upload Key: the key in a keystore file becomes current. `changed` is
  // false when it already is.
  const importAndroidSigningKey = ({ path, password, alias }) => {
    const projectId = requireProjectId();
    return runInOrder(async () =>
      addKey(
        projectId,
        await fileAdapter.readAndroidKeystore({ path, password, alias }),
        "uploaded",
      ),
    );
  };

  const useAndroidSigningKeyAgain = (certificateSha256) => {
    const projectId = requireProjectId();
    return runInOrder(async () => {
      await setAndroidSigningByProjectId(
        projectId,
        useAndroidSigningKey(
          await getAndroidSigningByProjectId(projectId),
          certificateSha256,
        ),
      );
    });
  };

  const promptAndroidKeyCopyPath = async ({ defaultFileName }, options = {}) =>
    fileAdapter.promptAndroidKeyCopyPath({
      defaultFileName,
      options,
      filePicker,
    });

  const requireKey = async (certificateSha256) => {
    const key = findAndroidSigningKey(
      await getUsableSigning(requireProjectId()),
      certificateSha256,
    );
    if (!key) {
      throw new Error("This project has no signing key with that fingerprint.");
    }
    return {
      certificateSha256: key.certificateSha256,
      certificate: key.certificate,
      privateKey: key.privateKey,
    };
  };

  // Save a Copy: a password-protected PKCS #12 keystore of one of the keys.
  const saveAndroidSigningKeyCopy = async ({
    certificateSha256,
    path,
    password,
  }) =>
    fileAdapter.writeAndroidKeystore({
      path,
      password,
      alias: ANDROID_KEY_COPY_ALIAS,
      key: await requireKey(certificateSha256),
    });

  return {
    supportsAndroidSigning,
    getAndroidSigningSummary,
    ensureAndroidSigningKey,
    createAndroidSigningKey,
    promptAndroidKeystorePath,
    importAndroidSigningKey,
    useAndroidSigningKeyAgain,
    promptAndroidKeyCopyPath,
    saveAndroidSigningKeyCopy,
    getAndroidSigningKeyMaterial: requireKey,
  };
};
