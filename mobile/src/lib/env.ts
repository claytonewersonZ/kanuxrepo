import Constants from 'expo-constants';

// Environment configuration for mobile app
// Update these values with your Supabase project credentials
// or set them in app.json under "extra" or use expo-env

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                    process.env.EXPO_PUBLIC_SUPABASE_URL || 
                    'https://your-project.supabase.co';

const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
                        'your-anon-key';

export const ENV = {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseAnonKey,
};

// Validate configuration
if (ENV.SUPABASE_URL.includes('your-project') || !ENV.SUPABASE_URL) {
  console.warn('⚠️ Supabase URL not configured. Please update src/lib/env.ts or app.json');
}

if (ENV.SUPABASE_ANON_KEY.includes('your-anon-key') || !ENV.SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase ANON KEY not configured. Please update src/lib/env.ts or app.json');
}
