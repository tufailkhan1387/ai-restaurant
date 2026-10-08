import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  extractOrderIdFromWebhook,
  verifyUberSignature,
} from "./webhookHandler.js";
import { mapUberOrderToRow } from "./orderService.js";
import { mapUberStateToStatus, uberMoneyToNumber } from "./syncRestaurantOrder.js";

describe("verifyUberSignature", () => {
  const secret = "test-client-secret";
  const body = Buffer.from(
    JSON.stringify({
      event_type: "orders.notification",
      event_id: "evt-1",
      meta: { resource_id: "153dd7f1-339d-4619-940c-418943c14636" },
    }),
    "utf8",
  );

  it("accepts a valid lowercase hex HMAC-SHA256 signature", () => {
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(verifyUberSignature(body, sig, secret), true);
  });

  it("accepts uppercase signature by normalizing to lowercase", () => {
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex").toUpperCase();
    assert.equal(verifyUberSignature(body, sig, secret), true);
  });

  it("rejects an invalid signature", () => {
    assert.equal(verifyUberSignature(body, "deadbeef", secret), false);
  });

  it("rejects missing signature or secret", () => {
    assert.equal(verifyUberSignature(body, undefined, secret), false);
    assert.equal(verifyUberSignature(body, "abc", ""), false);
  });

  it("rejects when body bytes differ", () => {
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const tampered = Buffer.from(
      body.toString("utf8").replace("orders.notification", "orders.cancel"),
    );
    assert.equal(verifyUberSignature(tampered, sig, secret), false);
  });
});

describe("extractOrderIdFromWebhook", () => {
  it("reads meta.resource_id", () => {
    assert.equal(
      extractOrderIdFromWebhook({
        meta: { resource_id: "153dd7f1-339d-4619-940c-418943c14636" },
      }),
      "153dd7f1-339d-4619-940c-418943c14636",
    );
  });

  it("parses resource_href", () => {
    assert.equal(
      extractOrderIdFromWebhook({
        resource_href:
          "https://api.uber.com/v2/eats/order/153dd7f1-339d-4619-940c-418943c14636",
      }),
      "153dd7f1-339d-4619-940c-418943c14636",
    );
  });

  it("same order id across retry payload shapes (idempotency key)", () => {
    const orderId = "153dd7f1-339d-4619-940c-418943c14636";
    const a = extractOrderIdFromWebhook({
      event_id: "e1",
      meta: { resource_id: orderId },
    });
    const b = extractOrderIdFromWebhook({
      event_id: "e2",
      resource_href: `https://test-api.uber.com/v2/eats/order/${orderId}`,
    });
    assert.equal(a, b);
  });
});

describe("mapUberOrderToRow idempotent shape", () => {
  it("maps stable uber_order_id from v2 payload", () => {
    const row1 = mapUberOrderToRow({
      id: "f9f363d1-e1c2-4595-b477-c649845bc953",
      display_id: "BC953",
      current_state: "CREATED",
      placed_at: "2019-09-23T16:16:30Z",
      store: { id: "store-1", name: "Test" },
      eater: { first_name: "Larry" },
      cart: { items: [{ id: "Muffin", title: "Muffin", quantity: 1 }] },
      payment: { charges: [] },
    });
    const row2 = mapUberOrderToRow({
      id: "f9f363d1-e1c2-4595-b477-c649845bc953",
      display_id: "BC953",
      current_state: "ACCEPTED",
      placed_at: "2019-09-23T16:16:30Z",
      store: { id: "store-1" },
      eater: { first_name: "Larry" },
      cart: { items: [{ id: "Muffin", title: "Muffin", quantity: 1 }] },
    });
    assert.equal(row1.uber_order_id, row2.uber_order_id);
    assert.equal(row1.customer_name, "Larry");
    assert.equal(row2.current_state, "ACCEPTED");
  });
});

describe("uberMoneyToNumber", () => {
  it("converts v2 cents Money", () => {
    assert.equal(uberMoneyToNumber({ amount: 350, formatted_amount: "$3.50" }), 3.5);
  });
  it("converts amount_e5", () => {
    assert.equal(uberMoneyToNumber({ amount_e5: 1080000, formatted: "$10.80" }), 10.8);
  });
});

describe("mapUberStateToStatus", () => {
  it("maps marketplace states to kitchen statuses", () => {
    assert.equal(mapUberStateToStatus("CREATED"), "pending");
    assert.equal(mapUberStateToStatus("ACCEPTED"), "confirmed");
    assert.equal(mapUberStateToStatus("CANCELED"), "cancelled");
    assert.equal(mapUberStateToStatus("SUCCEEDED"), "delivered");
  });
});
