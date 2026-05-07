-- V13: offline sync + idempotency para mensagens REST/WS em alta escala

-- 1) Campo de idempotência para retries/offline queue
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS client_message_id TEXT;

-- 2) Unicidade por chat + usuário + client_message_id (somente quando preenchido)
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_chat_user_client_msg
    ON messages (chat_id, user_profile_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

-- 3) Índices para leitura rápida no bootstrap/sync
CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at
    ON messages (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_company_created_at
    ON tickets (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chats_company_created_at
    ON chats (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_departments_company
    ON departments (company_id);
