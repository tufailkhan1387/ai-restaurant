/**
 * Diagnostics: env pairing, token (no secret printed), linked stores.
 *
 *   npm run uber:check --prefix backend
 */
import "../src/loadEnv.js";
import { getUberConfig } from "../src/uber/config.js";
import { requestUberToken } from "../src/uber/uberAuth.js";
import { listStores } from "../src/uber/uberClient.js";

async function main() {
  const cfg = getUberConfig();
  console.log("Uber environment check");
  console.log(`  UBER_ENV:     ${cfg.env}`);
  console.log(`  token URL:    ${cfg.tokenUrl}`);
  console.log(`  API base:     ${cfg.apiBase}`);
  console.log(`  requested scopes: ${cfg.scopes}`);
  console.log(`  client id set: ${Boolean(cfg.clientId)}`);
  console.log(`  client secret set: ${Boolean(cfg.clientSecret)} (value not printed)`);
  console.log(`  auto-accept:  ${cfg.autoAccept}`);

  const token = await requestUberToken({ force: true });
  console.log("Token OK");
  console.log(`  granted scope: ${token.grantedScope}`);
  console.log(`  expires_in:    ${token.expiresIn} seconds`);

  const storesResp = await listStores({ limit: 50 });
  const stores = storesResp?.stores || [];
  console.log(`Stores linked to this app: ${stores.length}`);
  for (const s of stores) {
    const id = s.store_id || s.id;
    const name = s.name || s.store_name || "";
    console.log(`  - ${id}${name ? ` (${name})` : ""}`);
  }
  if (!stores.length) {
    console.log("");
    console.log("No Uber store is linked to this application yet.");
    console.log("That is why fetch-orders and live webhooks will not show orders.");
    console.log("Ask Uber for:");
    console.log("  - sandbox: a Testing-app sandbox test store (Integration Tech Support)");
    console.log("  - production: order-manager / POS linking of a live store to this Client ID");
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
