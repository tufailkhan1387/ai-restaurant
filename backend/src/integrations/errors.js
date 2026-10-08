export class NotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotConfiguredError";
    this.code = "NOT_CONFIGURED";
  }
}

export class UberAuthError extends Error {
  constructor(message, extras = {}) {
    super(message);
    this.name = "UberAuthError";
    this.code = extras.code || "UBER_AUTH";
    this.status = extras.status;
    this.env = extras.env;
    this.tokenUrl = extras.tokenUrl;
    this.scopes = extras.scopes;
  }
}
