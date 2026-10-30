export class ImportPackageClientError extends Error {
  constructor(code, message, { retryable = false, details } = {}) {
    super(message);
    this.name = "ImportPackageClientError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}
