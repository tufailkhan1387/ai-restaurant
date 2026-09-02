-- Add missing agent columns to restaurants table
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS agent_first_message TEXT,
ADD COLUMN IF NOT EXISTS agent_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS agent_system_prompt TEXT,
ADD COLUMN IF NOT EXISTS agent_voice_id TEXT;

-- Create ai_agents table if missing
CREATE TABLE IF NOT EXISTS public.ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elevenlabs_agent_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    voice_id TEXT,
    system_prompt_template TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversations table for call transcripts
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE,
    speaker TEXT, -- 'ai' or 'customer'
    message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure updated_at triggers
DO $$ BEGIN
    CREATE TRIGGER trg_ai_agents_updated_at BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
