-- Align tickets schema with JPA entity (environments that were baselined without full V1)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS department_id UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignee_profile_id UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
