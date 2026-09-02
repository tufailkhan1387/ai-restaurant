-- ElevenLabs knowledge-base doc id + last menu sync (used by sync-restaurant-menu-to-agent and dashboard)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS agent_knowledge_doc_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_menu_synced_at TIMESTAMPTZ;
