import "dotenv/config";
import { getKnex } from "../src/db.js";
import {
  loadRestaurantVoiceCatalog,
  buildRestaurantVoiceKnowledge,
  defaultSynthflowPrompt,
} from "../src/lib/restaurantVoiceContext.js";

async function main() {
  const knex = getKnex();
  try {
    const restaurants = await knex("restaurants").select("id", "name");
    console.log("Found restaurants:", restaurants);

    for (const r of restaurants) {
      console.log("\n" + "=".repeat(60));
      console.log(`TESTING VOICE KNOWLEDGE FOR: ${r.name} (${r.id})`);
      console.log("=".repeat(60));

      const catalog = await loadRestaurantVoiceCatalog(knex, r.id);
      console.log(`- Loaded Categories: ${catalog.categories?.length || 0}`);
      console.log(`- Loaded Items: ${catalog.items?.length || 0}`);
      console.log(`- Loaded Variants: ${catalog.variants?.length || 0}`);
      console.log(`- Loaded Addons: ${catalog.addons?.length || 0}`);
      console.log(`- Loaded ItemAddons: ${catalog.itemAddons?.length || 0}`);

      const knowledge = buildRestaurantVoiceKnowledge({
        restaurantName: r.name,
        ...catalog,
      });

      const fullPrompt = defaultSynthflowPrompt(r.name, knowledge);

      console.log("\n--- GENERATED PROMPT OUTPUT ---");
      console.log(fullPrompt);

      // Check for flavors in knowledge
      const hasFlavors = /AVAILABLE FLAVORS|Flavors available/i.test(knowledge);
      const hasSizes = /Available Sizes/i.test(knowledge);
      const hasAddons = /Available Sauces & Add-ons|Sauces & Extra Add-ons/i.test(knowledge);

      console.log("\n--- VERIFICATION CHECKS ---");
      console.log(`✓ Sizes Present in Knowledge: ${hasSizes}`);
      console.log(`✓ Flavors Present in Knowledge: ${hasFlavors}`);
      console.log(`✓ Addons Present in Knowledge: ${hasAddons}`);
    }
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await knex.destroy();
  }
}

main();
