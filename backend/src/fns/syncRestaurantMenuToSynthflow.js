import { getKnex } from "../db.js";
import { updateAgent, postCallWebhookUrl } from "../lib/synthflowClient.js";
import {
  buildRestaurantVoiceKnowledge,
  defaultSynthflowGreeting,
  defaultSynthflowPrompt,
  loadRestaurantVoiceCatalog,
} from "../lib/restaurantVoiceContext.js";

/**
 * Refresh Synthflow agent prompt with current menu + coupons/promotions.
 */
export async function syncRestaurantMenuToSynthflow(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const knex = getKnex();
    const body = req.body || {};
    const restaurant_id = body.restaurant_id || body.body?.restaurant_id;
    if (!restaurant_id) {
      return res.status(400).json({ success: false, error: "restaurant_id is required" });
    }

    const r = await knex("restaurants").where({ id: restaurant_id }).first();
    if (!r) throw new Error("Restaurant not found");
    if (!r.synthflow_agent_id) {
      throw new Error("Create a Synthflow agent for this restaurant first");
    }

    const catalog = await loadRestaurantVoiceCatalog(knex, restaurant_id);
    const knowledge = buildRestaurantVoiceKnowledge({
      restaurantName: r.name,
      ...catalog,
    });
    const greeting =
      (r.agent_first_message || "").trim() || defaultSynthflowGreeting(r.name);
    const prompt = defaultSynthflowPrompt(r.name, knowledge);
    const webhookUrl = postCallWebhookUrl();

    await updateAgent(r.synthflow_agent_id, {
      // Do not re-send phone_number — number is already attached; re-sending can fail.
      is_recording: true,
      ...(webhookUrl ? { external_webhook_url: webhookUrl } : {}),
      agent: {
        prompt,
        greeting_message: greeting,
        voice_speed: 0.88,
      },
    });

    await knex("restaurants").where({ id: restaurant_id }).update({
      agent_system_prompt: prompt,
      agent_first_message: greeting,
      synthflow_synced_at: knex.fn.now(),
      agent_menu_synced_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    return res.json({
      success: true,
      synthflow_agent_id: r.synthflow_agent_id,
      synced_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Sync Synthflow menu error:", e);
    return res.status(500).json({ success: false, error: e.message || "sync failed" });
  }
}
