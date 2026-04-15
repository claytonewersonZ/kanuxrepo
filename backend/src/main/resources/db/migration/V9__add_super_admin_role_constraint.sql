-- V9: Update company_members role CHECK constraint to include SUPER_ADMIN
ALTER TABLE company_members DROP CONSTRAINT IF EXISTS company_members_role_check;
ALTER TABLE company_members ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('MEMBER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'));
