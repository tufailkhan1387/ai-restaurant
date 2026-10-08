import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "./safeLogger.js";

describe("redactSecrets", () => {
  it("redacts authorization, cookie, token, secret, password, api key", () => {
    const out = redactSecrets({
      Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb",
      cookie: "sid=abc",
      access_token: "KA.access.secretvalue",
      client_secret: "super-secret",
      password: "hunter2",
      apiKey: "sk-live-123",
      api_key: "sk-live-456",
      UBER_CLIENT_SECRET: "keep-out",
      safe: "store-count-3",
    });
    assert.equal(out.Authorization, "[redacted]");
    assert.equal(out.cookie, "[redacted]");
    assert.equal(out.access_token, "[redacted]");
    assert.equal(out.client_secret, "[redacted]");
    assert.equal(out.password, "[redacted]");
    assert.equal(out.apiKey, "[redacted]");
    assert.equal(out.api_key, "[redacted]");
    assert.equal(out.UBER_CLIENT_SECRET, "[redacted]");
    assert.equal(out.safe, "store-count-3");
    const urls = redactSecrets({
      tokenUrl: "https://sandbox-login.uber.com/oauth/v2/token",
      apiBase: "https://test-api.uber.com",
    });
    assert.equal(urls.tokenUrl, "https://sandbox-login.uber.com/oauth/v2/token");
    assert.equal(urls.apiBase, "https://test-api.uber.com");
  });

  it("redacts nested Bearer strings", () => {
    const out = redactSecrets({ headers: { authorization: "Bearer abc.def.ghi" } });
    assert.equal(out.headers.authorization, "[redacted]");
  });
});
