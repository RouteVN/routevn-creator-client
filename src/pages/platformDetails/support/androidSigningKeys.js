import { sanitizeArtifactFileName } from "../../../internal/artifactFileName.js";
import { MIN_ANDROID_KEYSTORE_PASSWORD_LENGTH } from "../../../internal/androidExport.js";
import { withErrorDetails } from "../../../internal/errorDetails.js";
import { formatI18nCopy } from "../../../internal/ui/i18nCopy.js";

// Upload Key and Save a Copy: the dialogs around the project's signing-key
// service calls.

const fileNameOf = (path) => path.split(/[\\/]/).pop();

// A stable message for a failed key change, with the host's technical message
// as details where it names something useful, such as the aliases in a
// keystore.
export const getAndroidSigningKeyErrorMessage = (error, copy) => {
  const details = (message) =>
    withErrorDetails(message, error, copy.errorDetailsLabel);
  switch (error?.code) {
    case "keystore-password-incorrect":
      return copy.androidKeystorePasswordIncorrect;
    case "keystore-legacy-format":
      return copy.androidKeystoreLegacyFormat;
    case "keystore-alias-required":
      return details(copy.androidKeystoreAliasRequired);
    case "keystore-alias-not-found":
      return details(copy.androidKeystoreAliasNotFound);
    case "signing-key-invalid":
      return details(copy.androidKeystoreInvalid);
    case "signing-key-unsupported":
      return details(copy.androidSigningKeyUnsupported);
    default:
      return details(copy.androidSigningKeyFailed);
  }
};

// Errors the creator fixes by entering the password or alias again.
const RETRY_KEYSTORE_ERROR_CODES = new Set([
  "keystore-password-incorrect",
  "keystore-alias-required",
  "keystore-alias-not-found",
]);

const createUploadKeyForm = (copy, { fileName, replacesKey }) => {
  const fields = [];
  if (replacesKey) {
    fields.push({
      type: "read-only-text",
      content: copy.androidUploadKeyReplaceWarning,
    });
  }
  fields.push(
    {
      name: "password",
      type: "input-text",
      inputType: "password",
      label: copy.androidKeystorePasswordLabel,
      required: true,
    },
    {
      name: "alias",
      type: "input-text",
      label: copy.androidKeyAliasLabel,
      description: copy.androidKeyAliasDescription,
    },
  );
  return {
    title: copy.androidUploadKeyTitle,
    description: formatI18nCopy(copy.androidUploadKeyDescription, { fileName }),
    fields,
    actions: {
      layout: "",
      buttons: [
        { id: "cancel", variant: "se", label: copy.cancelButton },
        {
          id: "submit",
          variant: "pr",
          validate: true,
          label: copy.androidUploadKeySubmit,
        },
      ],
    },
  };
};

// Upload Key: asks for a keystore file, then its password, and copies its key
// into the project as the current key. A wrong password or alias asks again.
// `onImport` runs the service call, so the page can show it as busy.
export const uploadAndroidSigningKey = async ({
  appService,
  projectService,
  copy,
  replacesKey,
  onImport,
}) => {
  let path;
  try {
    path = await projectService.promptAndroidKeystorePath({
      title: copy.androidKeystorePickerTitle,
      fileTypeName: copy.androidKeystoreFileTypeName,
    });
  } catch (error) {
    await appService.showAlert({
      message: getAndroidSigningKeyErrorMessage(error, copy),
      title: copy.errorTitle,
    });
    return;
  }
  if (!path) return;

  const form = createUploadKeyForm(copy, {
    fileName: fileNameOf(path),
    replacesKey,
  });
  let alias = "";
  for (;;) {
    const result = await appService.showFormDialog({
      size: "md",
      form,
      defaultValues: { password: "", alias },
    });
    if (!result || result.actionId !== "submit") return;
    const { password } = result.values;
    alias = result.values.alias.trim();
    if (!password) {
      await appService.showAlert({
        message: copy.androidKeystorePasswordRequired,
        title: copy.warningTitle,
      });
      continue;
    }
    try {
      const { changed } = await onImport(() =>
        projectService.importAndroidSigningKey({
          path,
          password,
          alias: alias === "" ? undefined : alias,
        }),
      );
      appService.showToast({
        message: changed
          ? copy.androidKeyUploadedMessage
          : copy.androidKeyAlreadyCurrentMessage,
      });
      return;
    } catch (error) {
      await appService.showAlert({
        message: getAndroidSigningKeyErrorMessage(error, copy),
        title: copy.errorTitle,
      });
      if (!RETRY_KEYSTORE_ERROR_CODES.has(error?.code)) return;
    }
  }
};

const createSaveCopyForm = (copy) => ({
  title: copy.androidSaveKeyCopyTitle,
  description: copy.androidSaveKeyCopyDescription,
  fields: [
    {
      name: "password",
      type: "input-text",
      inputType: "password",
      label: copy.androidSaveKeyCopyPasswordLabel,
      description: formatI18nCopy(copy.androidSaveKeyCopyPasswordDescription, {
        count: MIN_ANDROID_KEYSTORE_PASSWORD_LENGTH,
      }),
      required: true,
    },
    {
      name: "confirmPassword",
      type: "input-text",
      inputType: "password",
      label: copy.androidSaveKeyCopyConfirmPasswordLabel,
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      { id: "cancel", variant: "se", label: copy.cancelButton },
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: copy.androidSaveKeyCopySubmit,
      },
    ],
  },
});

// Save a Copy: asks for a password, then where to save a PKCS #12 keystore of
// the key.
export const saveAndroidSigningKeyCopy = async ({
  appService,
  projectService,
  copy,
  certificateSha256,
  applicationName,
  onSave,
}) => {
  let password;
  for (;;) {
    const result = await appService.showFormDialog({
      size: "md",
      form: createSaveCopyForm(copy),
      defaultValues: { password: "", confirmPassword: "" },
    });
    if (!result || result.actionId !== "submit") return;
    let problem;
    // Characters, as the host counts them, not UTF-16 code units.
    if (
      [...result.values.password].length < MIN_ANDROID_KEYSTORE_PASSWORD_LENGTH
    ) {
      problem = formatI18nCopy(copy.androidKeystorePasswordTooShort, {
        count: MIN_ANDROID_KEYSTORE_PASSWORD_LENGTH,
      });
    } else if (result.values.password !== result.values.confirmPassword) {
      problem = copy.androidKeystorePasswordMismatch;
    }
    if (!problem) {
      password = result.values.password;
      break;
    }
    await appService.showAlert({ message: problem, title: copy.warningTitle });
  }

  try {
    const path = await projectService.promptAndroidKeyCopyPath(
      {
        defaultFileName: `${sanitizeArtifactFileName(
          `${applicationName}-signing-key`,
        )}.p12`,
      },
      {
        title: copy.androidSaveKeyCopyDialogTitle,
        fileTypeName: copy.androidKeyCopyFileTypeName,
      },
    );
    if (!path) return;
    await onSave(() =>
      projectService.saveAndroidSigningKeyCopy({
        certificateSha256,
        path,
        password,
      }),
    );
    appService.showToast({
      message: formatI18nCopy(copy.androidKeyCopySavedMessage, {
        path: appService.getFileDisplayPath(path),
      }),
    });
  } catch (error) {
    await appService.showAlert({
      message: withErrorDetails(
        copy.androidSaveKeyCopyFailed,
        error,
        copy.errorDetailsLabel,
      ),
      title: copy.errorTitle,
    });
  }
};
