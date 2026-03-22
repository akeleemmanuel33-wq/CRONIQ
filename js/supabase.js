// js/supabase.js
// ============================================
// CRONIQ — Supabase Client
// Replace the two values below with yours from:
// Supabase Dashboard → Project Settings → API
// ============================================

const SUPABASE_URL = 'https://xhyxzpiubdynjijxsdus.supabase.co';         // e.g. https://xyzabc.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoeXh6cGl1YmR5bmppanhzZHVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Nzg1NDksImV4cCI6MjA4ODE1NDU0OX0.843o70SGpZ0WqlrWFi73yenUaSnzSqbtREbhutnNwRg'; // long string starting with eyJ...

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helper: get current logged-in user ──
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Helper: get current user's profile ──
export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return data;
}