export class DomainValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DomainValidationError";
    this.code = "validation_failed";
    this.details = details;
  }
}

export class DomainInvariantError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DomainInvariantError";
    this.code = "validation_failed";
    this.details = details;
  }
}

export class DomainPreconditionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DomainPreconditionError";
    this.code = "validation_failed";
    this.details = details;
  }
}
