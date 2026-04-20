-- Adiciona campos de mídia na tabela messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_name TEXT;

-- Bucket para mídia do chat (executar no Supabase Storage)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
-- ON CONFLICT DO NOTHING;

-- Políticas de acesso ao bucket chat-media (usuários autenticados)
-- CREATE POLICY "Authenticated users can upload media" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'chat-media' AND auth.role() = 'authenticated');
-- CREATE POLICY "Anyone can read media" ON storage.objects
--   FOR SELECT USING (bucket_id = 'chat-media');
