import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { UBER_ENV_URLS, getUberConfig } from "../uber/config.js";
import { formatUberTokenError } from "../uber/uberAuth.js";
import { verifyUberSignature, uberWebhookHttpHandler } from "../uber/webhookHandler.js";
import { mergeNormalizedOrder } from "./orderService.js";
import { wouldDowngrade } from "./status.js";
import { normalizeOrder as normalizeUber } from "./uber/adapter.js";
import { normalizeOrder as normalizeDeliveroo, verifyWebhook as verifyDeliverooWebhook } from "./deliveroo/adapter.js";
import { normalizeOrder as normalizeJustEat } from "./justeat/adapter.js";
import {
  normalizeOrder as normalizeDoorDash,
  verifyWebhook as verifyDoorDashWebhook,
  webhookAckStatus as doorDashAckStatus,
} from "./doordash/adapter.js";
import { createDoorDashJwt } from "./doordash/jwt.js";
import { NotConfiguredError } from "./errors.js";

describe("Uber env/URL pairing", () => {
  const prev = { ...process.env };

  afterEach(() => {
    if (prev.UBER_ENV == null) delete process.env.UBER_ENV;
    else process.env.UBER_ENV = prev.UBER_ENV;
    if (prev.UBER_SCOPES == null) delete process.env.UBER_SCOPES;
    else process.env.UBER_SCOPES = prev.UBER_SCOPES;
    if (prev.UBER_CLIENT_ID == null) delete process.env.UBER_CLIENT_ID;
    else process.env.UBER_CLIENT_ID = prev.UBER_CLIENT_ID;
    if (prev.UBER_CLIENT_SECRET == null) delete process.env.UBER_CLIENT_SECRET;
    else process.env.UBER_CLIENT_SECRET = prev.UBER_CLIENT_SECRET;
  });

  it("pairs sandbox token URL with test-api.uber.com", () => {
    process.env.UBER_ENV = "sandbox";
    const cfg = getUberConfig();
    assert.equal(cfg.tokenUrl, UBER_ENV_URLS.sandbox.tokenUrl);
    assert.equal(cfg.apiBase, UBER_ENV_URLS.sandbox.apiBase);
    assert.equal(cfg.tokenUrl, "https://sandbox-login.uber.com/oauth/v2/token");
    assert.equal(cfg.apiBase, "https://test-api.uber.com");
  });

  it("pairs production token URL with api.uber.com", () => {
    process.env.UBER_ENV = "production";
    const cfg = getUberConfig();
    assert.equal(cfg.tokenUrl, "https://auth.uber.com/oauth/v2/token");
    assert.equal(cfg.apiBase, "https://api.uber.com");
  });
});

describe("invalid_scope error message", () => {
  it("includes env, token URL, scopes, and likely causes", () => {
    const msg = formatUberTokenError({
      env: "sandbox",
      tokenUrl: "https://sandbox-login.uber.com/oauth/v2/token",
      scopes: "eats.order eats.store eats.store.orders.read",
      status: 400,
      error: "invalid_scope",
      errorDescription: "scope(s) are invalid",
    });
    assert.match(msg, /sandbox/);
    assert.match(msg, /sandbox-login\.uber\.com/);
    assert.match(msg, /eats\.store\.orders\.read/);
    assert.match(msg, /Access Token tab/);
    assert.match(msg, /agreement/i);
    assert.doesNotMatch(msg, /Bearer /);
    assert.doesNotMatch(msg, /client_secret=/);
  });
});

describe("webhook signature rejection", () => {
  it("Uber handler returns 401 for a bad X-Uber-Signature", () => {
    process.env.UBER_ENABLED = "true";
    process.env.UBER_CLIENT_SECRET = "test-secret";
    const body = Buffer.from(JSON.stringify({ event_type: "orders.notification" }), "utf8");
    const req = {
      get: (name) => (String(name).toLowerCase() === "x-uber-signature" ? "deadbeef" : undefined),
      body,
    };
    let status;
    let payload;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(obj) {
        payload = obj;
        return this;
      },
      end() {},
    };
    uberWebhookHttpHandler(req, res);
    assert.equal(status, 401);
    assert.equal(payload.error, "invalid signature");
    assert.equal(verifyUberSignature(body, "deadbeef", "test-secret"), false);
  });

  it("Deliveroo HMAC rejects a wrong signature", () => {
    process.env.DELIVEROO_WEBHOOK_SECRET = "whsec";
    const raw = Buffer.from('{"order_id":"gb:111"}', "utf8");
    const guid = "seq-guid-1";
    const req = {
      get: (name) => {
        const n = String(name).toLowerCase();
        if (n === "x-deliveroo-sequence-guid") return guid;
        if (n === "x-deliveroo-hmac-sha256") return "nope";
        return undefined;
      },
      headers: {},
      body: raw,
    };
    assert.equal(verifyDeliverooWebhook(req), false);
    const good = crypto.createHmac("sha256", "whsec").update(`${guid} ${raw.toString("utf8")}`).digest("hex");
    req.get = (name) => {
      const n = String(name).toLowerCase();
      if (n === "x-deliveroo-sequence-guid") return guid;
      if (n === "x-deliveroo-hmac-sha256") return good;
      return undefined;
    };
    assert.equal(verifyDeliverooWebhook(req), true);
  });
});

describe("idempotent upsert merge + no status downgrade", () => {
  it("same incoming event keeps one logical row identity", () => {
    const incoming = {
      source: "uber",
      external_order_id: "ord-1",
      status: "placed",
    };
    const first = mergeNormalizedOrder(null, incoming);
    const second = mergeNormalizedOrder(
      { marketplace_status: "placed", status: "pending" },
      incoming,
    );
    assert.equal(first.marketplace_status, "placed");
    assert.equal(second.marketplace_status, "placed");
    assert.equal(second.skipStatus, false);
  });

  it("never downgrades completed or cancelled", () => {
    assert.equal(wouldDowngrade("completed", "placed"), true);
    assert.equal(wouldDowngrade("cancelled", "accepted"), true);
    assert.equal(wouldDowngrade("placed", "accepted"), false);
    const merged = mergeNormalizedOrder(
      { marketplace_status: "completed", status: "delivered" },
      { status: "placed" },
    );
    assert.equal(merged.skipStatus, true);
    assert.equal(merged.marketplace_status, "completed");
    assert.equal(merged.kitchen_status, "delivered");
  });
});

describe("platform normalizers", () => {
  it("Uber: maps documented v2 Get Order Details fields", () => {
    // Field names from Uber Eats Marketplace Get Order Details (v2) docs.
    const raw = {
      id: "f9f363d1-e1c2-4595-b477-c649845bc953",
      display_id: "BC953",
      current_state: "CREATED",
      placed_at: "2019-09-23T16:16:30Z",
      store: { id: "store-1" },
      eater: { first_name: "Larry" },
      cart: { items: [{ id: "Muffin", title: "Muffin", quantity: 1 }] },
    };
    const n = normalizeUber(raw);
    assert.equal(n.source, "uber");
    assert.equal(n.external_order_id, "f9f363d1-e1c2-4595-b477-c649845bc953");
    assert.equal(n.display_id, "UE-BC953");
    assert.equal(n.status, "placed");
    assert.equal(n.customer_name, "Larry");
  });

  it("Deliveroo: maps documented Order Events statuses and {market}:{uuid} order_id", () => {
    // order_id format + status_log values from
    // https://api-docs.deliveroo.com/reference/order-events-webhook-1
    // and https://api-docs.deliveroo.com/reference/patch-order-1
    const raw = {
      order_id: "gb:07fbb82a-ceb5-43ec-123f-18af89e3380a",
      status: "placed",
      status_log: [{ status: "placed" }],
      items: [{ name: "Burger", quantity: 1 }],
    };
    const n = normalizeDeliveroo(raw);
    assert.equal(n.source, "deliveroo");
    assert.equal(n.external_order_id, "gb:07fbb82a-ceb5-43ec-123f-18af89e3380a");
    assert.match(n.display_id, /^DR-/);
    assert.equal(n.status, "placed");
  });

  it("Just Eat: skips until partner payload is documented", () => {
    // TODO(docs): no public restaurant-order sample JSON on developers.just-eat.com
    assert.throws(() => normalizeJustEat({}), (err) => err instanceof NotConfiguredError);
  });

  it("DoorDash: maps OrderCreate webhook Order object (Marketplace docs)", () => {
    const raw = {
      id: "dd-order-123",
      consumer: { first_name: "Ada", last_name: "Lovelace", phone: "555" },
      store: { merchant_supplied_id: "store-msid-1" },
      subtotal: 1250,
      tax: 100,
      fulfillment_type: "dx_delivery",
      delivery_short_code: "AB12",
      categories: [{ items: [{ name: "Tacos", quantity: 2, price: 625 }] }],
    };
    const n = normalizeDoorDash(raw, { event_type: "OrderCreate", status: "NEW" });
    assert.equal(n.source, "doordash");
    assert.equal(n.external_order_id, "dd-order-123");
    assert.equal(n.status, "placed");
    assert.equal(n.customer_name, "Ada Lovelace");
    assert.equal(n.store_id, "store-msid-1");
    assert.equal(n.totals.subtotal, 12.5);
    assert.equal(n.items[0].name, "Tacos");
    assert.equal(doorDashAckStatus({ event: { type: "OrderCreate" } }), 202);
  });

  it("DoorDash: webhook Authorization must match DOORDASH_WEBHOOK_AUTH", () => {
    process.env.DOORDASH_WEBHOOK_AUTH = "secret-token";
    const bad = {
      get: (n) => (String(n).toLowerCase() === "authorization" ? "Bearer nope" : undefined),
      headers: {},
    };
    assert.equal(verifyDoorDashWebhook(bad), false);
    const good = {
      get: (n) => (String(n).toLowerCase() === "authorization" ? "Bearer secret-token" : undefined),
      headers: {},
    };
    assert.equal(verifyDoorDashWebhook(good), true);
  });

  it("DoorDash: JWT mints with dd-ver header when credentials set", () => {
    process.env.DOORDASH_DEVELOPER_ID = "582e4f20-0f48-4bc2-99c2-e094675e2919";
    process.env.DOORDASH_KEY_ID = "585698aa-2aa6-4bb4-8b3f-dd9d3f47dc28";
    process.env.DOORDASH_SIGNING_SECRET = Buffer.from("test-signing-secret").toString("base64");
    const token = createDoorDashJwt({ ttlSec: 120 });
    const parts = token.split(".");
    assert.equal(parts.length, 3);
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    assert.equal(header["dd-ver"], "DD-JWT-V1");
    assert.equal(header.alg, "HS256");
  });
});
