ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS work_start_time TIME,
    ADD COLUMN IF NOT EXISTS work_end_time TIME;