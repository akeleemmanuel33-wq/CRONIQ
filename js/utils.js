// js/utils.js
// ============================================
// CRONIQ — Shared Utilities
// ============================================

// ── Toast notifications ──
export function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.className = '';
  }, 3500);
}

// ── Loading state on buttons ──
export function setLoading(btn, loading, originalText = '') {
  if (loading) {
    btn.disabled = true;
    btn.dataset.original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
  } else {
    btn.disabled = false;
    btn.textContent = originalText || btn.dataset.original || btn.textContent;
  }
}

// ── Format date ──
export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Truncate text ──
export function truncate(str, n = 120) {
  return str.length > n ? str.slice(0, n).trimEnd() + '…' : str;
}

// ── Get URL param ──
export function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

// ── Redirect if not logged in ──
export async function requireAuth(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = '/index.html';
    return null;
  }
  return user;
}

// ── Redirect if already logged in ──
export async function redirectIfAuthed(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) window.location.href = '/app.html';
}

// ── Avatar initials ──
export function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Category colors ──
export const CATEGORY_COLORS = {
  Experience:  { bg: 'rgba(139,26,26,0.08)',  text: '#8B1A1A' },
  Education:   { bg: 'rgba(201,168,76,0.12)', text: '#8a6a1a' },
  Reflection:  { bg: 'rgba(74,94,74,0.10)',   text: '#3a6a3a' },
  Secret:      { bg: 'rgba(14,10,0,0.07)',    text: '#1a1208' },
  Milestone:   { bg: 'rgba(42,74,138,0.08)',  text: '#1a3a8a' },
  Lesson:      { bg: 'rgba(138,42,138,0.08)', text: '#5a1a5a' }
};