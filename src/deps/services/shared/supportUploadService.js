import {
  MAX_SUPPORT_UPLOAD_BYTES,
  isDebugCode,
  normalizeDebugCode,
} from "../../../internal/supportUpload.js";

// A project that was not sent. `code` is one of:
// - `invalidCode`: the code is not six characters of the code alphabet;
// - `codeUnknown`, `codeExpired`, `codeUsed`: support has no such code, it
//   has expired, or it was already used to send a project;
// - `rateLimited`: too many wrong codes or requests from this network, with
//   `retryAfterMs` when the server says how long to wait;
// - `tooLarge`: the packed project is over the size limit;
// - `tooManyAttempts`: the code took the most files it can;
// - `unavailable`: the service can't be reached or isn't taking projects;
// - `cancelled`: the user stopped it;
// - `failed`: anything else, such as packing or uploading failing, with the
//   original error as `cause`.
export class SupportUploadError extends Error {
  constructor(code, { retryAfterMs, cause } = {}) {
    super(`The project was not sent: ${code}.`, { cause });
    this.name = "SupportUploadError";
    this.code = code;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

const CODE_REASONS = Object.freeze({
  UNKNOWN: "codeUnknown",
  EXPIRED: "codeExpired",
  USED: "codeUsed",
});

// The error the UI shows for a creator call that failed.
const fromCreatorError = (error) => {
  const details = error.details ?? {};
  switch (error.code) {
    case "DEBUG_CODE_UNUSABLE":
      return new SupportUploadError(CODE_REASONS[details.reason] ?? "failed", {
        cause: error,
      });
    case "DEBUG_CODE_RATE_LIMITED":
    case "RATE_LIMITED":
      return new SupportUploadError("rateLimited", {
        retryAfterMs: details.retryAfterMs,
        cause: error,
      });
    case "VALIDATION_FAILED":
      return new SupportUploadError(
        details.reason === "TOO_LARGE" ? "tooLarge" : "failed",
        { cause: error },
      );
    case "UPLOAD_LIMIT_REACHED":
      return new SupportUploadError("tooManyAttempts", { cause: error });
    case "DEBUG_UPLOADS_UNAVAILABLE":
    case "UNAVAILABLE":
      return new SupportUploadError("unavailable", { cause: error });
    default:
      return new SupportUploadError("failed", { cause: error });
  }
};

// Sends one project to support with a code support gave the user. `host`
// packs the project folder into a zip that Creator's zip import opens, and
// uploads it (`createArchive`, `uploadArchive`, `cancelArchive`,
// `discardArchive`); `creatorClient` makes the API calls; `getDevice` reads
// the device facts sent with the project. One project is sent at a time.
export const createSupportUploadService = ({
  host,
  creatorClient,
  getDevice,
  createId,
}) => {
  let running;

  const readDevice = async (projectPath) => {
    try {
      return await getDevice({ projectPath });
    } catch {
      return undefined;
    }
  };

  const throwIfCancelled = (operation) => {
    if (operation.cancelled) throw new SupportUploadError("cancelled");
  };

  const callCreator = async (request) => {
    try {
      return await request();
    } catch (error) {
      throw fromCreatorError(error);
    }
  };

  const send = async (operation, { projectPath, code, onProgress }) => {
    const archiveId = operation.id;
    onProgress({ stage: "packing", current: 0, total: 0 });
    const archive = await host.createArchive({
      archiveId,
      projectPath,
      onProgress: ({ phase, current, total }) =>
        onProgress({ stage: phase, current, total }),
    });
    throwIfCancelled(operation);
    if (archive.sizeBytes > MAX_SUPPORT_UPLOAD_BYTES) {
      throw new SupportUploadError("tooLarge");
    }

    const device = await readDevice(projectPath);
    const link = await callCreator(() =>
      creatorClient.prepareDebugUpload({
        code,
        sizeBytes: archive.sizeBytes,
        sha256: archive.sha256,
        device,
      }),
    );
    throwIfCancelled(operation);

    onProgress({ stage: "uploading", current: 0, total: archive.sizeBytes });
    // When storage already has these bytes, from an earlier try that
    // stopped before it completed, the upload is refused and the send goes
    // on to complete.
    await host.uploadArchive({
      archiveId,
      url: link.uploadUrl,
      headers: link.requiredHeaders,
      onProgress: ({ current, total }) =>
        onProgress({ stage: "uploading", current, total }),
    });
    throwIfCancelled(operation);

    // The bytes are with support: from here the send is not stopped.
    operation.finishing = true;
    onProgress({ stage: "finishing" });
    return callCreator(() =>
      creatorClient.completeDebugUpload({ code, sha256: archive.sha256 }),
    );
  };

  return {
    // Resolves to `{ deleteAfter }`, when support's copy is deleted.
    // `onProgress` receives `{ stage, current, total }`, with stage
    // `packing`, `checking` (the SHA-256 of the packed file), `uploading`
    // or `finishing`. Rejects with a SupportUploadError.
    async sendProject({ projectPath, code: typedCode, onProgress = () => {} }) {
      const code = normalizeDebugCode(typedCode);
      if (!isDebugCode(code)) throw new SupportUploadError("invalidCode");
      if (running) throw new Error("A project is already being sent.");
      const operation = {
        id: createId(),
        cancelled: false,
        finishing: false,
      };
      running = operation;
      try {
        return await send(operation, { projectPath, code, onProgress });
      } catch (error) {
        if (operation.cancelled) throw new SupportUploadError("cancelled");
        if (error instanceof SupportUploadError) throw error;
        throw new SupportUploadError("failed", { cause: error });
      } finally {
        running = undefined;
        try {
          await host.discardArchive({ archiveId: operation.id });
        } catch (error) {
          console.error("Failed to remove the packed project:", error);
        }
      }
    },

    // Stops the project being sent, if any, until its upload has finished.
    async cancel() {
      if (!running || running.cancelled || running.finishing) return;
      running.cancelled = true;
      await host.cancelArchive({ archiveId: running.id });
    },
  };
};
