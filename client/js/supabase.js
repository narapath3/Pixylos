// Supabase Configuration
const SUPABASE_URL = 'https://btrtpzfkbrnjudmulhbz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0cnRwemZrYnJuanVkbXVsaGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTc3NzQsImV4cCI6MjA5ODEzMzc3NH0.cQ54HKYi6rX4zP0RVttB77R_lNQrvOCjO-2W4DdIBOA';

let supa;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
    supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Supabase] Initialized');
} else {
    console.warn('[Supabase] API keys not set in supabase.js. Realtime features will be disabled.');
}
