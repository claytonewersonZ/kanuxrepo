-- Super admin será criado manualmente via Supabase Dashboard
-- A migration é mantida para não quebrar o histórico do Flyway
DO $$
BEGIN
  -- Insere apenas se o usuário já existe em auth.users
  INSERT INTO public.user_profiles (auth_user_id, display_name, email, is_super_admin)
  SELECT 
    id,
    'Super Admin',
    email,
    TRUE
  FROM auth.users
  WHERE email = 'admin@kanux.com'
  ON CONFLICT (email) DO NOTHING;
END $$;
