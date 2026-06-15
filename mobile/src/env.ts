// lib/env.ts

// Environment configuration for Expo mobile app

export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
};

// Debug (pode remover depois que funcionar)
console.log("Supabase URL:", ENV.SUPABASE_URL);
console.log("Supabase Key loaded:", ENV.SUPABASE_ANON_KEY ? "YES" : "NO");

// Hard validation (se estiver errado ele para o app)
if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
  throw new Error("❌ Supabase environment variables are not configured correctly.");
}