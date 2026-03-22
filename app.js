/* ══════════════════════════════════════════════════════════
   CRONIQ — app.js
   All application logic for app.html
   Auto-generated from app.html split
══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   CRONIQ — SINGLE UNIFIED SCRIPT
   No module/non-module split. No timing bugs. No demo data.
══════════════════════════════════════════════════════════ */

const SUPA_URL = 'https://xhyxzpiubdynjijxsdus.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoeXh6cGl1YmR5bmppanhzZHVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Nzg1NDksImV4cCI6MjA4ODE1NDU0OX0.843o70SGpZ0WqlrWFi73yenUaSnzSqbtREbhutnNwRg';
// UMD global can be 'supabase' or 'supabase_js' depending on CDN
const _supa = window.supabase || window.supabase_js;
if (!_supa) { document.body.innerHTML = '<div style="color:red;padding:2rem;font-family:sans-serif;">Supabase failed to load. Check your internet connection and refresh.</div>'; throw new Error('Supabase not loaded'); }
const sb = _supa.createClient(SUPA_URL, SUPA_KEY);

/* ── State ── */
let CUR_USER    = null;
let CUR_PROFILE = null;
const ADMIN_EMAIL = 'bigcroniq@gmail.com';
let IS_ADMIN = false;
let STORIES     = [];   // my stories
let REQUESTS    = [];   // access requests I own
let COMMENTS    = [];   // comments for open story
let ACTIVE_STORY_ID = null;
let activeFilter = 'all';
let activeCommentSort = 'newest';
let replyingTo = null;  // { id, name }
let reqTargetId = null;
let darkMode    = true;

/* ── Helpers ── */
const $  = id => document.getElementById(id);
const el = (id, val) => { const e=$( id); if(e) e.textContent=val; };
const ini = s => (s||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

const CAT = {
  Experience:{ bg:'rgba(192,48,48,.12)',  color:'#C03030' },
  Education: { bg:'rgba(201,168,76,.12)', color:'#C9A84C' },
  Reflection:{ bg:'rgba(48,209,88,.12)',  color:'#30d158' },
  Secret:    { bg:'rgba(255,255,255,.07)',color:'rgba(245,245,247,.45)'},
  Milestone: { bg:'rgba(10,132,255,.12)', color:'#0a84ff' },
  Lesson:    { bg:'rgba(255,149,0,.12)',  color:'#ff9500' }
};

/* ── Toast ── */
function toast(msg, type='ok') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (type==='err'?' err':'');
  clearTimeout(t._t);
  t._t = setTimeout(()=>{ t.className=''; }, 3400);
}

/* ── Cursor ── */
const cur = $('cur'), ring = $('cur-ring');
let mx=0,my=0,rx=0,ry=0;
document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; cur.style.left=mx+'px'; cur.style.top=my+'px'; });
(function loop(){ rx+=(mx-rx)*.13; ry+=(my-ry)*.13; ring.style.left=rx+'px'; ring.style.top=ry+'px'; requestAnimationFrame(loop); })();

/* ══════════════════════════════════════════════════════════
   BOOT — runs once on load
══════════════════════════════════════════════════════════ */
async function boot() {
  try {
    const { data:{ session }, error: sessErr } = await sb.auth.getSession();
    if (sessErr) { toast('Auth error: ' + sessErr.message, 'err'); console.error('Session error:', sessErr); return; }
    if (!session) { window.location.href = 'login.html'; return; }
    CUR_USER = session.user;
    console.log('✅ Authenticated as:', CUR_USER.email);
    // Early admin check by email — shows sidebar before profile loads
    if (CUR_USER.email === ADMIN_EMAIL) {
      IS_ADMIN = true;
      document.querySelectorAll('.admin-only').forEach(e => { e.style.display = ''; });
    }

    // Load all data
    await Promise.all([
      loadProfile(),
      loadMyStories(),
      loadMyRequests()
    ]);

    renderStories('all');
    renderRequests();
    updateProfileStats();
    setupRealtime();
  await loadNotifications();
  setupNotifRealtime();

  } catch(err) {
    console.error('Boot error:', err);
    toast('App error: ' + err.message, 'err');
  }
}

/* ══════════════════════════════════════════════════════════
   PHASE 2 — PROFILE
══════════════════════════════════════════════════════════ */
async function loadProfile() {
  const { data, error } = await sb
    .from('profiles').select('*').eq('id', CUR_USER.id).single();
  if (error) {
    console.error('Profile error:', error);
    // Profile missing = trigger didn't run. Create it now.
    if (error.code === 'PGRST116') {
      console.log('Profile missing — creating from auth metadata...');
      const meta = CUR_USER.user_metadata || {};
      const username = meta.username || CUR_USER.email.split('@')[0];
      const full_name = meta.full_name || '';
      const { error: insertErr } = await sb.from('profiles').insert({
        id: CUR_USER.id, username, full_name
      });
      if (insertErr) {
        console.error('Could not create profile:', insertErr);
        toast('Profile setup failed: ' + insertErr.message, 'err');
        // Still show something using email
        const fallback = CUR_USER.email.split('@')[0];
        el('sb-avatar', ini(fallback)); el('sb-name', fallback);
        el('profile-av', ini(fallback)); el('profile-name', fallback);
        el('profile-user', '@' + fallback);
        return;
      }
      // Retry
      const { data: d2 } = await sb.from('profiles').select('*').eq('id', CUR_USER.id).single();
      if (d2) { CUR_PROFILE = d2; }
    } else {
      toast('Profile error: ' + error.message, 'err');
    }
  } else {
    CUR_PROFILE = data;
  }
  // Set admin status
  IS_ADMIN = CUR_USER.email === ADMIN_EMAIL || CUR_PROFILE?.is_admin === true;
  if (IS_ADMIN) {
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = ''; });
  }
  const p = CUR_PROFILE || {};
  const name   = p.full_name || p.username || CUR_USER.email.split('@')[0];
  const handle = '@' + (p.username || CUR_USER.email.split('@')[0]);
  const bio    = p.bio || 'Archivist of my own life.';
  const av     = ini(name);

  // Sidebar + mobile header initials
  el('sb-avatar', av); el('sb-name', name);
  el('mob-av',    av);

  // Profile panel
  el('profile-av', av);
  // Show tick on own name if verified or admin
    el('profile-name', name);
  // Show verification tick next to name using dedicated tick element
  const profTickEl = document.getElementById('profile-name-tick');
  if (profTickEl) {
    const ownVerif = p.is_verified || p.is_admin || IS_ADMIN;
    profTickEl.innerHTML = ownVerif ? '<svg class="vtick" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    profTickEl.style.display = ownVerif ? 'inline-flex' : 'none';
  }
  el('profile-user', handle);
  el('profile-bio-text', bio);

  // Avatar photo
  if (p.avatar_url) renderAvatarPhoto(p.avatar_url);

  // Settings panel info
  el('settings-email', CUR_USER.email);
  el('settings-story-count', STORIES.length + ' archived');
  const joined = CUR_USER.created_at ? new Date(CUR_USER.created_at).toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : '—';
  el('settings-joined', 'Joined ' + joined);
}

/* ══════════════════════════════════════════════════════════
   PHASE 3 — LOAD MY STORIES + LIKES
══════════════════════════════════════════════════════════ */
async function loadMyStories() {
  $('stories-grid').innerHTML = spinner('Loading your vault…');

  // Load stories
  const { data: stories, error } = await sb
    .from('stories')
    .select('*')
    .eq('user_id', CUR_USER.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Stories:', error.message);
    $('stories-grid').innerHTML = `<div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--text3);font-size:.82rem;">Error: ${error.message}</div>`;
    return;
  }

  // Load my likes
  const { data: myLikes } = await sb
    .from('story_likes')
    .select('story_id')
    .eq('user_id', CUR_USER.id);
  const likedSet = new Set((myLikes||[]).map(l => l.story_id));

  // Load like counts for my stories
  const storyIds = (stories||[]).map(s => s.id);
  let likeCounts = {};
  if (storyIds.length) {
    const { data: counts } = await sb
      .from('story_likes')
      .select('story_id')
      .in('story_id', storyIds);
    (counts||[]).forEach(l => { likeCounts[l.story_id] = (likeCounts[l.story_id]||0)+1; });
  }

  STORIES = (stories||[]).map(s => ({
    id:         s.id,
    user_id:    s.user_id,
    title:      s.title,
    content:    s.content,
    excerpt:    s.excerpt || s.content.slice(0,120)+'…',
    category:   s.category || 'Reflection',
    visibility: s.visibility || 'public',
    likes:      likeCounts[s.id] || 0,
    liked:      likedSet.has(s.id),
    date:       fmtDate(s.created_at)
  }));
}

/* ══════════════════════════════════════════════════════════
   PHASE 3 — PUBLISH STORY
══════════════════════════════════════════════════════════ */
async function publishStory() {
  const title   = $('w-title').value.trim();
  const content = $('w-content').value.trim();
  const cat     = $('w-cat').value;
  const vis     = document.querySelector('input[name="vis"]:checked')?.value || 'public';

  if (!title)   { toast('Add a title first.', 'err'); return; }
  if (!content) { toast('Write your story first.', 'err'); return; }

  const btn = $('pub-btn');
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:13px;height:13px;border:2px solid #000;border-top-color:transparent;border-radius:50%;animation:doSpin .7s linear infinite;vertical-align:middle;margin-right:.4rem;"></span>Publishing…';

  try {
    const excerpt = content.slice(0,120)+'…';
    const { data, error } = await sb
      .from('stories')
      .insert({ user_id: CUR_USER.id, title, content, excerpt, category: cat, visibility: vis })
      .select().single();

    if (error) throw error;

    // Add to local state
    STORIES.unshift({
      id: data.id, user_id: data.user_id, title: data.title,
      content: data.content, excerpt: data.excerpt,
      category: data.category, visibility: data.visibility,
      likes: 0, liked: false, date: fmtDate(data.created_at)
    });

    // Clear form
    $('w-title').value = '';
    $('w-content').value = '';
    document.querySelector('input[name="vis"][value="public"]').checked = true;

    toast('Story archived to your vault.');
    nav('feed', document.querySelector('.sb-item[data-panel="feed"]'));

  } catch(err) {
    console.error('Publish:', err);
    toast(err.message || 'Failed to publish.', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Publish to Vault';
  }
}
window.publishStory = publishStory;

/* ── File upload ── */
async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.type === 'text/plain') {
    const text = await file.text();
    $('w-title').value   = file.name.replace(/\.txt$/i,'');
    $('w-content').value = text;
    toast('Text file loaded.');
  } else {
    toast('PDF/DOCX: paste your content manually for now.', 'err');
  }
  input.value = '';
}
window.handleFileUpload = handleFileUpload;

/* ── Delete story ── */
async function deleteStory(id) {
  if (!confirm('Delete this story permanently?')) return;
  const { error } = await sb.from('stories').delete().eq('id', id).eq('user_id', CUR_USER.id);
  if (error) { toast(error.message, 'err'); return; }
  STORIES = STORIES.filter(s => s.id !== id);
  renderStories(activeFilter);
  updateProfileStats();
  renderProfileGrid();
  toast('Story deleted.');
}
window.deleteStory = deleteStory;

/* ── Edit story ── */
function openEditModal(id) {
  const s = STORIES.find(x => x.id === id);
  if (!s) return;
  $('edit-id').value      = s.id;
  $('edit-title').value   = s.title;
  $('edit-content').value = s.content;
  $('edit-cat').value     = s.category;
  $('edit-vis').value     = s.visibility;
  openModal('edit-modal');
}
window.openEditModal = openEditModal;

async function saveEdit() {
  const id      = $('edit-id').value;
  const title   = $('edit-title').value.trim();
  const content = $('edit-content').value.trim();
  const cat     = $('edit-cat').value;
  const vis     = $('edit-vis').value;
  if (!title||!content) { toast('Title and content required.','err'); return; }

  const btn = $('save-edit-btn');
  btn.disabled=true; btn.textContent='Saving…';

  const { data, error } = await sb.from('stories')
    .update({ title, content, excerpt: content.slice(0,120)+'…', category: cat, visibility: vis, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', CUR_USER.id).select().single();

  btn.disabled=false;
  btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>Save Changes';

  if (error) { toast(error.message,'err'); return; }
  const s = STORIES.find(x => x.id===id);
  if (s) Object.assign(s, { title:data.title, content:data.content, excerpt:data.excerpt, category:data.category, visibility:data.visibility });
  closeModal('edit-modal');
  renderStories(activeFilter);
  renderProfileGrid();
  updateProfileStats();
  toast('Story updated.');
}
window.saveEdit = saveEdit;

/* ══════════════════════════════════════════════════════════
   PHASE 4 — RENDER STORIES
══════════════════════════════════════════════════════════ */
let VAULT_SEARCH_Q = '';

function getVaultQuery() {
  // Read from whichever search input is visible
  const mob = $('mob-search-input');
  const desk = $('search-input');
  if (mob && mob.closest('#mob-search-bar') && mob.closest('#mob-search-bar').style.display !== 'none')
    return mob.value.trim().toLowerCase();
  if (desk) return desk.value.trim().toLowerCase();
  return VAULT_SEARCH_Q;
}

function renderStories(filter) {
  activeFilter = filter;
  const q = getVaultQuery();
  VAULT_SEARCH_Q = q;
  let list = [...STORIES];

  // Apply visibility filter
  if (filter !== 'all') list = list.filter(s => s.visibility === filter);

  // Apply search — title, category, excerpt, content snippet
  if (q) {
    list = list.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.excerpt||'').toLowerCase().includes(q) ||
      (s.content||'').toLowerCase().includes(q)
    );
  }

  // Update result count
  const countEl = $('vault-search-count');
  if (countEl) {
    if (q) {
      countEl.textContent = list.length + ' result' + (list.length !== 1 ? 's' : '') + ' for "' + q + '"';
      countEl.style.display = 'block';
    } else {
      countEl.style.display = 'none';
    }
  }

  const grid = $('stories-grid');
  if (!list.length) {
    const isSearch = !!q;
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">
      <div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">${isSearch
        ? '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
        : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'}
      </svg></div>
      <div class="empty-title">${isSearch ? 'No stories match "'+q+'"' : 'No stories here yet'}</div>
      <div class="empty-sub">${isSearch ? 'Try a different search or clear the filter.' : filter==='all' ? 'Archive your first memory →' : 'No '+filter+' stories yet'}</div>
      ${isSearch ? `<button onclick="clearVaultSearch()" style="margin-top:.75rem;background:none;border:.5px solid var(--border2);color:var(--text3);padding:.38rem .85rem;border-radius:8px;font-family:var(--font);font-size:.72rem;cursor:pointer;">Clear search</button>` : ''}
    </div>`;
    return;
  }
  grid.innerHTML = list.map(storyCard).join('');
}
window.renderStories = renderStories;

function clearVaultSearch() {
  VAULT_SEARCH_Q = '';
  const desk = $('search-input');
  const mob  = $('mob-search-input');
  if (desk) desk.value = '';
  if (mob)  mob.value  = '';
  // hide clear button
  const clr = $('vault-search-clear');
  if (clr) clr.style.opacity = '0';
  renderStories(activeFilter);
}
window.clearVaultSearch = clearVaultSearch;

function searchStories(q) {
  VAULT_SEARCH_Q = q.trim().toLowerCase();
  // Sync both inputs
  const desk = $('search-input');
  const mob  = $('mob-search-input');
  if (desk && document.activeElement !== desk) desk.value = q;
  if (mob  && document.activeElement !== mob)  mob.value  = q;
  // Show/hide clear
  const clr = $('vault-search-clear');
  if (clr) clr.style.opacity = q ? '1' : '0';
  renderStories(activeFilter);
}
window.searchStories = searchStories;

function storyCard(s) {
  const cat = CAT[s.category]||CAT.Reflection;
  const sid = `'${s.id}'`;
  const isOwn = CUR_USER && s.user_id === CUR_USER.id;

  const lock = s.visibility==='request' ? `
    <div class="lock-overlay">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
      <div class="lock-label">Access Gated</div>
      ${!isOwn?`<button class="btn-req" onclick="event.stopPropagation();openReqModal(${sid})">Request Access</button>`:''}
    </div>` : s.visibility==='private' ? `
    <div class="lock-overlay">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <div class="lock-label">Private</div>
    </div>` : '';

  const visPill = {
    public:  `<div class="vis-pill vis-public">Public</div>`,
    private: `<div class="vis-pill vis-private">Private</div>`,
    request: `<div class="vis-pill vis-request">Gated</div>`
  }[s.visibility]||'';

  const actions = isOwn ? `
    <div style="display:flex;gap:.3rem;margin-left:auto;" onclick="event.stopPropagation()">
      <button class="card-act-btn" onclick="openEditModal(${sid})" title="Edit">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="card-act-btn card-act-del" onclick="deleteStory(${sid})" title="Delete">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>` : '';

  return `<div class="story-card" onclick="openStory(${sid})">
    ${lock}
    <div class="card-top">
      <div class="cat-pill" style="background:${cat.bg};color:${cat.color}">${s.category}</div>
      ${visPill}${actions}
    </div>
    <div class="card-title">${s.title}</div>
    <div class="card-excerpt">${s.excerpt}</div>
    <div class="card-bottom">
      <div class="card-date">${s.date}</div>
      <button class="like-btn${s.liked?' liked':''}" onclick="event.stopPropagation();toggleLike(${sid})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${s.liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        ${s.likes}
      </button>
    </div>
  </div>`;
}

function filterFeed(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.ftab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  // Render whichever panel is active — feed or profile stories tab
  const profileActive = $('proftab-stories')?.classList.contains('active') &&
                        $('panel-profile')?.classList.contains('active');
  if (profileActive) renderProfileGrid();
  else renderStories(f);
}
window.filterFeed = filterFeed;

function searchStories(q) { renderStories(activeFilter); }
window.searchStories = searchStories;

/* ══════════════════════════════════════════════════════════
   DISCOVER — SEARCH + ARCHIVIST DRAWER
══════════════════════════════════════════════════════════ */

// All loaded archivists (raw data + enriched)
let DISC_ALL = [];
let DISC_FILTERED = [];
let DISC_SEARCH_TIMER = null;
let ARC_PROFILE = null;      // currently open archivist
let ARC_STORIES = [];        // their stories
let ARC_VIS_FILTER = 'all';  // 'all' | 'public' | 'request'

const DISC_GRAD = [
  'linear-gradient(135deg,#C9A84C,#7A1515)',
  'linear-gradient(135deg,#3a5e3a,#1a3a1a)',
  'linear-gradient(135deg,#7A1515,#4a0a0a)',
  'linear-gradient(135deg,#2a3a8a,#1a2a5a)',
  'linear-gradient(135deg,#8a6a1a,#5a4a0a)',
  'linear-gradient(135deg,#1a5a5a,#0a3a3a)',
  'linear-gradient(135deg,#5a2a7a,#3a1a5a)',
  'linear-gradient(135deg,#7a4a1a,#4a2a0a)',
];

async function loadDiscover() {
  const grid = $('discover-grid');
  grid.innerHTML = spinner('Finding archivists…');
  el('disc-count', '');

  // Fetch all profiles except self (include verification status)
  let query = sb.from('profiles')
    .select('id, username, full_name, bio, avatar_url, is_verified, is_admin')
    .limit(80);
  if (CUR_USER) query = query.neq('id', CUR_USER.id);
  const { data, error } = await query;

  if (error) {
    console.error('Discover:', error.message);
    grid.innerHTML = `<div style="padding:2rem;color:var(--text3);font-size:.82rem;">Could not load archivists.</div>`;
    return;
  }

  if (!data || !data.length) {
    grid.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--text3);font-size:.82rem;grid-column:1/-1;">No other archivists yet.</div>`;
    return;
  }

  // Enrich: get public+gated story counts
  const ids = data.map(p => p.id);
  const { data: storyData } = await sb
    .from('stories')
    .select('user_id, category, visibility')
    .in('user_id', ids)
    .in('visibility', ['public', 'request']);

  const countMap = {}, catMap = {}, gateMap = {};
  (storyData||[]).forEach(s => {
    if (s.visibility === 'public')  countMap[s.user_id] = (countMap[s.user_id]||0)+1;
    if (s.visibility === 'request') gateMap[s.user_id]  = (gateMap[s.user_id]||0)+1;
    if (!catMap[s.user_id]) catMap[s.user_id] = new Set();
    catMap[s.user_id].add(s.category);
  });

  DISC_ALL = data.map((p, i) => ({
    ...p,
    name:       p.full_name || p.username || 'Unknown',
    handle:     p.username  || 'unknown',
    pubCount:   countMap[p.id] || 0,
    gateCount:  gateMap[p.id]  || 0,
    cats:       [...(catMap[p.id] || [])].slice(0, 3),
    grad:       DISC_GRAD[i % DISC_GRAD.length],
    verified:   p.is_verified || false,
    isAdmin:    p.is_admin    || false,
    avatar:     p.avatar_url  || null,  // alias for userCardHTML compat
  }));

  // Admin always first, then verified, then rest
  DISC_ALL.sort((a, b) => {
    if (a.isAdmin && !b.isAdmin) return -1;
    if (!a.isAdmin && b.isAdmin) return 1;
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    return 0;
  });

  DISC_FILTERED = [...DISC_ALL];
  renderDiscGrid();
  renderStarredSection();
}

function renderDiscGrid() {
  const grid  = $('discover-grid');
  const count = $('disc-count');
  if (!grid) return;

  if (!DISC_FILTERED.length) {
    grid.innerHTML = `<div style="padding:3rem 1rem;text-align:center;color:var(--text3);font-size:.82rem;grid-column:1/-1;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" style="opacity:.3;margin-bottom:.75rem;display:block;margin-inline:auto;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      No archivists found for that search.
    </div>`;
    if (count) count.textContent = 'No results';
    return;
  }

  if (count) count.textContent = DISC_FILTERED.length === DISC_ALL.length
    ? `${DISC_ALL.length} archivist${DISC_ALL.length===1?'':'s'}`
    : `${DISC_FILTERED.length} of ${DISC_ALL.length} archivists`;

  // Use userCardHTML so all cards get tick, admin badge, star button
  grid.innerHTML = DISC_FILTERED.map(p => userCardHTML(p)).join('');
  renderStarredSection();
}

/* ── Search ── */
function searchArchivists(q) {
  const clear = $('disc-search-clear');
  if (clear) clear.style.display = q ? 'flex' : 'none';

  clearTimeout(DISC_SEARCH_TIMER);
  DISC_SEARCH_TIMER = setTimeout(() => {
    const term = q.trim().toLowerCase();
    if (!term) {
      DISC_FILTERED = [...DISC_ALL];
    } else {
      DISC_FILTERED = DISC_ALL.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.handle.toLowerCase().includes(term) ||
        (p.bio || '').toLowerCase().includes(term) ||
        p.cats.some(c => c.toLowerCase().includes(term))
      );
    }
    renderDiscGrid();
  }, 200);
}
window.searchArchivists = searchArchivists;

function clearDiscSearch() {
  const inp = $('disc-search-input');
  if (inp) { inp.value = ''; inp.focus(); }
  const clear = $('disc-search-clear');
  if (clear) clear.style.display = 'none';
  DISC_FILTERED = [...DISC_ALL];
  el('disc-count', `${DISC_ALL.length} archivist${DISC_ALL.length===1?'':'s'}`);
  renderDiscGrid();
}
window.clearDiscSearch = clearDiscSearch;

/* ════════════════════════════════════════
   ARCHIVIST DRAWER
════════════════════════════════════════ */
async function openArchivistDrawer(userId) {
  const drawer = $('arc-drawer');
  drawer.classList.add('open');
  // Show overlay + lock body scroll on mobile
  if (window.innerWidth <= 768) {
    const ov = $('arc-overlay');
    if (ov) ov.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  // Find cached profile — fall back to DB if DISC_ALL not loaded yet
  let p = DISC_ALL.find(x => x.id === userId);
  if (!p) {
    const { data: pRow } = await sb.from('profiles')
      .select('id, full_name, username, bio, avatar_url')
      .eq('id', userId).single();
    if (!pRow) { toast('Archivist not found.', 'err'); return; }
    p = {
      id:     pRow.id,
      name:   pRow.full_name || pRow.username || 'Archivist',
      handle: pRow.username  || '',
      bio:    pRow.bio       || '',
      avatar_url: pRow.avatar_url || null,
    };
    // Cache it so subsequent calls are instant
    if (!DISC_ALL.find(x => x.id === userId)) DISC_ALL.push(p);
  }
  ARC_PROFILE = p;
  ARC_VIS_FILTER = 'all';

  // Reset filter buttons
  document.querySelectorAll('.arc-vf-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.vf === 'all');
  });

  // Render hero
  $('arc-av').textContent = ini(p.name);
  $('arc-av').style.opacity = '1';
  // Verified tick in arc drawer
  const arcNameEl = $('arc-name');
  if (arcNameEl) {
    const arcTick = (p.verified || p.is_verified || p.isAdmin || p.is_admin) ? '<svg class="vtick vtick-arc" viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    arcNameEl.innerHTML = escapeHtml(p.name) + arcTick;
  }
  el('arc-handle', '@' + p.handle);
  el('arc-bio', p.bio || '');

  // Avatar photo
  const arcImgWrap = $('arc-av-img');
  const arcImg = $('arc-av-photo');
  if (p.avatar_url && arcImgWrap && arcImg) {
    arcImg.src = p.avatar_url;
    arcImgWrap.style.display = 'block';
    $('arc-av').style.opacity = '0';
  } else if (arcImgWrap) {
    arcImgWrap.style.display = 'none';
    $('arc-av').style.opacity = '1';
  }

  // Load stories
  $('arc-stories-grid').innerHTML = spinnerInline() + ' <span style="font-size:.78rem;color:var(--text3);margin-left:.5rem;">Loading stories…</span>';
  $('arc-stat-pub').textContent   = '—';
  $('arc-stat-gated').textContent = '—';
  $('arc-stat-likes').textContent = '—';

  const { data: stories } = await sb
    .from('stories')
    .select('id, title, excerpt, content, category, visibility, created_at, user_id')
    .eq('user_id', userId)
    .in('visibility', ['public', 'request'])
    .order('created_at', { ascending: false });

  ARC_STORIES = stories || [];

  // Parallel: like counts + access requests by current user + approved access
  const sids = ARC_STORIES.map(s => s.id);
  let likeCounts = {}, pendingIds = new Set(), approvedIds = new Set();

  const fetches = [
    sids.length
      ? sb.from('story_likes').select('story_id').in('story_id', sids)
      : Promise.resolve({ data: [] })
  ];

  if (CUR_USER && sids.length) {
    fetches.push(
      sb.from('access_requests')
        .select('story_id, status')
        .eq('requester_id', CUR_USER.id)
        .in('story_id', sids),
      sb.from('approved_access')
        .select('story_id')
        .eq('user_id', CUR_USER.id)
        .in('story_id', sids)
    );
  }

  const [lkRes, reqRes, apRes] = await Promise.all(fetches);
  (lkRes?.data||[]).forEach(l => { likeCounts[l.story_id] = (likeCounts[l.story_id]||0)+1; });
  (reqRes?.data||[]).forEach(r => { if (r.status === 'pending') pendingIds.add(r.story_id); });
  (apRes?.data||[]).forEach(a => { approvedIds.add(a.story_id); });

  // Is this the owner viewing their own drawer?
  const isOwner = CUR_USER && CUR_USER.id === userId;

  ARC_STORIES = ARC_STORIES.map(s => {
    const approved  = approvedIds.has(s.id);
    const canRead   = isOwner || approved || s.visibility === 'public';
    return {
      ...s,
      // Blank content for gated stories viewer can't access
      content:  canRead ? s.content  : null,
      // Keep title always visible — only blur excerpt for locked stories
      excerpt:  canRead ? (s.excerpt || '') : '',
      likes:    likeCounts[s.id] || 0,
      date:     fmtDate(s.created_at),
      approved,
      pending:  pendingIds.has(s.id),
      isOwner,
      canRead,
    };
  });

  // Update stats
  const pubCnt  = ARC_STORIES.filter(s => s.visibility === 'public').length;
  const gateCnt = ARC_STORIES.filter(s => s.visibility === 'request').length;
  const totLikes = ARC_STORIES.reduce((a,s) => a+s.likes, 0);
  el('arc-stat-pub',   pubCnt);
  el('arc-stat-gated', gateCnt);
  el('arc-stat-likes', totLikes);

  renderArchivistStories();
}
window.openArchivistDrawer = openArchivistDrawer;

function closeArchivistDrawer() {
  $('arc-drawer').classList.remove('open');
  const ov = $('arc-overlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
  ARC_PROFILE = null;
  ARC_STORIES = [];
}
window.closeArchivistDrawer = closeArchivistDrawer;

function openArchivistExternal() {
  if (!ARC_PROFILE) return;
  const url = `discover.html?id=${ARC_PROFILE.id}&u=${ARC_PROFILE.handle}&n=${encodeURIComponent(ARC_PROFILE.name)}`;
  window.open(url, '_blank');
}
window.openArchivistExternal = openArchivistExternal;

function filterArchivistStories(vis, btn) {
  ARC_VIS_FILTER = vis;
  document.querySelectorAll('.arc-vf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderArchivistStories();
}
window.filterArchivistStories = filterArchivistStories;

function renderArchivistStories() {
  const grid = $('arc-stories-grid');
  let list = ARC_VIS_FILTER === 'all'
    ? ARC_STORIES
    : ARC_STORIES.filter(s => s.visibility === ARC_VIS_FILTER);

  if (!list.length) {
    const msg = ARC_VIS_FILTER === 'request' ? 'No gated stories.' : ARC_VIS_FILTER === 'public' ? 'No public stories yet.' : 'No stories to show.';
    grid.innerHTML = `<div style="padding:2.5rem 1rem;text-align:center;color:var(--text3);font-size:.82rem;grid-column:1/-1;">${msg}</div>`;
    return;
  }

  grid.innerHTML = list.map(s => {
    const cat     = CAT[s.category] || CAT.Reflection;
    const isGated = s.visibility === 'request';
    const excerpt = s.excerpt || (s.content||'').slice(0,110)+'…';
    const heartFill = s.likes ? '#c0392b' : 'none';
    const heartStroke = s.likes ? '#c0392b' : 'currentColor';

    if (isGated) {
      // ── determine access state ──
      const isMine   = s.isOwner;
      const approved = s.approved;
      const pending  = s.pending;

      // Owner sees their own gated story fully (can read it)
      if (isMine) {
        return `<div class="arc-story-card" onclick="openArcStory('${s.id}')">
          <div class="card-top">
            <div class="cat-pill" style="background:${cat.bg};color:${cat.color}">${s.category}</div>
            <div class="vis-pill vis-request">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Gated
            </div>
          </div>
          <div class="card-title">${s.title}</div>
          <div class="card-excerpt">${excerpt}</div>
          <div class="card-bottom">
            <div class="card-date">${s.date}</div>
            <div style="display:flex;align-items:center;gap:.3rem;font-size:.72rem;color:var(--text3);">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="${heartFill}" stroke="${heartStroke}" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${s.likes}
            </div>
          </div>
        </div>`;
      }

      // Approved — fully readable
      if (approved) {
        return `<div class="arc-story-card arc-approved" onclick="openArcStory('${s.id}')">
          <div class="card-top">
            <div class="cat-pill" style="background:${cat.bg};color:${cat.color}">${s.category}</div>
            <div class="vis-pill" style="background:rgba(48,209,88,.12);color:#30d158;">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="#30d158" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/></svg>Approved
            </div>
          </div>
          <div class="card-title">${s.title}</div>
          <div class="card-excerpt">${excerpt}</div>
          <div class="card-bottom">
            <div class="card-date">${s.date}</div>
            <div style="display:flex;align-items:center;gap:.3rem;font-size:.72rem;color:var(--text3);">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="${heartFill}" stroke="${heartStroke}" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${s.likes}
            </div>
          </div>
        </div>`;
      }

      // Pending request
      if (pending) {
        return `<div class="arc-story-card is-gated">
          <div class="card-top">
            <div class="cat-pill" style="background:${cat.bg};color:${cat.color}">${s.category}</div>
            <div class="vis-pill vis-request">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Gated
            </div>
          </div>
          <div class="card-title arc-card-title">${s.title}</div>
          <div class="arc-gated-banner" style="background:rgba(255,214,10,.08);border-color:rgba(255,214,10,.2);">
            <div class="arc-gated-lbl" style="color:#ffd60a;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffd60a" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Request Pending
            </div>
            <span style="font-size:.62rem;color:var(--text3);">Waiting…</span>
          </div>
        </div>`;
      }

      // Default: no access, show Request Access button
      return `<div class="arc-story-card is-gated">
        <div class="card-top">
          <div class="cat-pill" style="background:${cat.bg};color:${cat.color}">${s.category}</div>
          <div class="vis-pill vis-request">
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Gated
          </div>
        </div>
        <div class="card-title arc-card-title">${s.title}</div>
        <div class="arc-gated-banner">
          <div class="arc-gated-lbl">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Access Required
          </div>
          <button class="btn-arc-req" onclick="openArcReq('${s.id}')">Request Access</button>
        </div>
      </div>`;
    } else {
      return `<div class="arc-story-card" onclick="openArcStory('${s.id}')">
        <div class="card-top">
          <div class="cat-pill" style="background:${cat.bg};color:${cat.color}">${s.category}</div>
          <div class="vis-pill vis-public">
            <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/></svg>Public
          </div>
        </div>
        <div class="card-title">${s.title}</div>
        <div class="card-excerpt">${excerpt}</div>
        <div class="card-bottom">
          <div class="card-date">${s.date}</div>
          <div style="display:flex;align-items:center;gap:.3rem;font-size:.72rem;color:var(--text3);">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="${heartFill}" stroke="${heartStroke}" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            ${s.likes}
          </div>
        </div>
      </div>`;
    }
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   ARC DRAWER — STORY READER (open public story from drawer)
══════════════════════════════════════════════════════════ */
let ARC_ACTIVE_STORY  = null;
let ARC_COMMENTS      = [];
let ARC_CMT_SORT      = 'newest';
let ARC_REPLYING_TO   = null;

async function openArcStory(id) {
  let s = ARC_STORIES.find(x => x.id === id);
  if (!s) return;

  // If gated and canRead is false — check DB in case access was just granted
  if (s.visibility === 'request' && !s.canRead && CUR_USER) {
    const { data: ap } = await sb.from('approved_access')
      .select('id').eq('story_id', id).eq('user_id', CUR_USER.id).single();
    if (ap) {
      // Access confirmed — fetch full content and update local state
      const { data: full } = await sb.from('stories')
        .select('content, excerpt').eq('id', id).single();
      s.approved = true;
      s.canRead  = true;
      s.pending  = false;
      if (full) { s.content = full.content; s.excerpt = full.excerpt; }
      renderArchivistStories(); // refresh card to show approved state
    } else {
      openArcReq(id);
      return;
    }
  } else if (s.visibility === 'request' && !s.canRead) {
    openArcReq(id);
    return;
  }
  ARC_ACTIVE_STORY = s;
  ARC_COMMENTS     = [];
  ARC_CMT_SORT     = 'newest';
  ARC_REPLYING_TO  = null;

  // Populate modal
  const visBar = $('arc-modal-vis');
  if (visBar) visBar.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="#30d158"><circle cx="12" cy="12" r="10"/></svg> Public`;

  const titleEl = $('arc-modal-title');
  if (titleEl) titleEl.textContent = s.title;

  const metaEl = $('arc-modal-meta');
  if (metaEl) metaEl.textContent = `${s.category} · ${s.date} · ${ARC_PROFILE?.name || ''}`;

  const bodyEl = $('arc-modal-body');
  const isGatedAndApproved = s.visibility === 'request' && s.approved && !s.isOwner;
  if (bodyEl) {
    bodyEl.className = isGatedAndApproved ? 'story-body-text protected-content' : 'story-body-text';
    bodyEl.innerHTML = escapeHtml(s.content || '').replace(/\n/g, '<br>');
  }

  // Like state
  updateArcLikeBtn();

  // Reset comment compose
  const box = $('arc-cmt-box');
  if (box) { box.value = ''; box.style.height = 'auto'; }
  cancelArcReply();

  // Sort buttons reset
  document.querySelectorAll('.arc-csort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sort === 'newest')
  );

  openModal('arc-story-modal');
  loadArcComments(id);
}
window.openArcStory = openArcStory;
function showToast(msg, isErr=false) { const t=$("toast"); if(!t) return; t.textContent=msg; t.style.cssText=""; t.classList.add("show"); if(isErr) t.classList.add("toast-err"); clearTimeout(t._st); t._st=setTimeout(()=>{t.classList.remove("show","toast-err");},3200); }
window.showToast=showToast;

function updateArcLikeBtn() {
  if (!ARC_ACTIVE_STORY) return;
  const btn = $('arc-like-btn');
  if (!btn) return;
  btn.className = 'like-btn' + (ARC_ACTIVE_STORY.liked ? ' liked' : '');
  const ico = $('arc-like-icon');
  if (ico) {
    ico.setAttribute('fill', ARC_ACTIVE_STORY.liked ? '#c0392b' : 'none');
    ico.setAttribute('stroke', ARC_ACTIVE_STORY.liked ? '#c0392b' : 'currentColor');
  }
  const cnt = $('arc-like-count');
  if (cnt) cnt.textContent = ARC_ACTIVE_STORY.likes;
}

async function toggleArcLike() {
  if (!CUR_USER) { showToast('Sign in to like stories.'); return; }
  if (!ARC_ACTIVE_STORY) return;
  const was = ARC_ACTIVE_STORY.liked;
  ARC_ACTIVE_STORY.liked = !was;
  ARC_ACTIVE_STORY.likes += ARC_ACTIVE_STORY.liked ? 1 : -1;
  updateArcLikeBtn();
  renderArchivistStories(); // sync grid card

  if (ARC_ACTIVE_STORY.liked) {
    const { error } = await sb.from('story_likes').insert({ story_id: ARC_ACTIVE_STORY.id, user_id: CUR_USER.id });
    if (error && error.code !== '23505') {
      ARC_ACTIVE_STORY.liked = was; ARC_ACTIVE_STORY.likes--; updateArcLikeBtn(); renderArchivistStories(); showToast('Could not like.', true);
    } else if (!error) {
      const from = CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Someone';
      pushNotif(ARC_ACTIVE_STORY.user_id, 'like',
        `<strong>${escapeHtml(from)}</strong> liked your story <strong>${escapeHtml(ARC_ACTIVE_STORY.title)}</strong>`,
        ARC_ACTIVE_STORY.id, CUR_USER.id);
    }
  } else {
    const { error } = await sb.from('story_likes').delete().eq('story_id', ARC_ACTIVE_STORY.id).eq('user_id', CUR_USER.id);
    if (error) { ARC_ACTIVE_STORY.liked = was; ARC_ACTIVE_STORY.likes++; updateArcLikeBtn(); renderArchivistStories(); showToast('Could not unlike.', true); }
  }
}
window.toggleArcLike = toggleArcLike;

/* ── Arc Comments ── */
async function loadArcComments(storyId) {
  const list = $('arc-cmt-list');
  if (!list) return;
  list.innerHTML = `<div style="padding:1rem 0;text-align:center;color:var(--text3);font-size:.78rem;">${spinnerInline()} Loading…</div>`;

  const { data: cmts, error } = await sb.from('comments')
    .select('id,content,parent_id,created_at,user_id')
    .eq('story_id', storyId).order('created_at', { ascending: true });

  if (error) { list.innerHTML = `<div style="padding:.75rem 0;color:var(--text3);font-size:.78rem;">Could not load responses.</div>`; return; }
  if (!cmts || !cmts.length) { ARC_COMMENTS = []; renderArcComments(); return; }

  const uids = [...new Set(cmts.map(c => c.user_id))];
  const { data: profs } = await sb.from('profiles').select('id,full_name,username,avatar_url,is_verified,is_admin').in('id', uids);
  const pmap = {};
  (profs || []).forEach(p => { pmap[p.id] = p; });
  ARC_COMMENTS = cmts.map(c => ({ ...c, author: pmap[c.user_id] || null }));
  renderArcComments();
}

function renderArcComments() {
  const list = $('arc-cmt-list');
  if (!list) return;
  const lbl = $('arc-cmt-count');

  let sorted = [...ARC_COMMENTS];
  if (ARC_CMT_SORT === 'newest') sorted.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  else sorted.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  const roots   = sorted.filter(c => !c.parent_id);
  const replies = sorted.filter(c =>  c.parent_id);

  if (lbl) lbl.textContent = ARC_COMMENTS.length + ' ' + (ARC_COMMENTS.length === 1 ? 'Response' : 'Responses');

  if (!roots.length) {
    list.innerHTML = `<div style="padding:1rem 0;color:var(--text3);font-size:.82rem;text-align:center;">No comments yet.</div>`;
    return;
  }

  list.innerHTML = roots.map(c => {
    const name   = c.author?.full_name || c.author?.username || 'Someone';
    const isOwn  = c.user_id === CUR_USER?.id;
    const isV    = c.author?.is_verified || c.author?.is_admin || false;
    const avSrc  = c.author?.avatar_url || null;
    const cUid   = c.author?.id || c.user_id;
    const cUname = c.author?.username || '';
    const cReps  = replies.filter(r => r.parent_id === c.id);
    const avSt   = avSrc ? 'padding:0;overflow:hidden;background:none;' : '';
    const avIn   = avSrc
      ? `<img src="${avSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.parentElement.textContent='${ini(name)}'">` : ini(name);
    const pLink  = cUname ? `discover.html?id=${cUid}&u=${encodeURIComponent(cUname)}&n=${encodeURIComponent(c.author?.full_name||cUname)}` : '';
    const avEl   = pLink
      ? `<a href="${pLink}" class="cmt-av" style="${avSt}" title="View ${escapeHtml(name)}">${avIn}</a>`
      : `<div class="cmt-av" style="${avSt}">${avIn}</div>`;
    const tick   = isV ? `<svg style="display:inline-block;vertical-align:middle;margin-left:.25rem;flex-shrink:0;" viewBox="0 0 24 24" width="13" height="13" fill="none"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    const repHtml = cReps.map(r => {
      const rname  = r.author?.full_name || r.author?.username || 'Someone';
      const rOwn   = r.user_id === CUR_USER?.id;
      const rV     = r.author?.is_verified || r.author?.is_admin || false;
      const rSrc   = r.author?.avatar_url || null;
      const rUid   = r.author?.id || r.user_id;
      const rUname = r.author?.username || '';
      const rAvSt  = rSrc ? 'padding:0;overflow:hidden;background:none;width:26px;height:26px;font-size:.55rem;' : 'width:26px;height:26px;font-size:.55rem;';
      const rAvIn  = rSrc ? `<img src="${rSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.parentElement.textContent='${ini(rname)}'">` : ini(rname);
      const rLink  = rUname ? `discover.html?id=${rUid}&u=${encodeURIComponent(rUname)}&n=${encodeURIComponent(r.author?.full_name||rUname)}` : '';
      const rAvEl  = rLink
        ? `<a href="${rLink}" class="cmt-av" style="${rAvSt}">${rAvIn}</a>`
        : `<div class="cmt-av" style="${rAvSt}">${rAvIn}</div>`;
      return `<div class="comment reply" id="arc-c-${r.id}">
        ${rAvEl}
        <div class="cmt-body">
          <div style="display:flex;align-items:baseline;gap:.4rem;flex-wrap:wrap;">
            <span class="cmt-name">${escapeHtml(rname)}${rV ? `<svg style="display:inline-block;vertical-align:middle;margin-left:.25rem;flex-shrink:0;" viewBox="0 0 24 24" width="13" height="13" fill="none"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}</span>
            <span class="cmt-time">${fmtDate(r.created_at)}</span>
          </div>
          <div class="cmt-text">${escapeHtml(r.content)}</div>
          <div style="display:flex;gap:.4rem;margin-top:.25rem;">
            ${rOwn ? `<button class="cmt-btn cmt-del" onclick="arcDeleteCmt('${r.id}')">Delete</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div class="comment" id="arc-c-${c.id}">
      ${avEl}
      <div class="cmt-body">
        <div style="display:flex;align-items:baseline;gap:.4rem;flex-wrap:wrap;">
          <span class="cmt-name">${escapeHtml(name)}${tick}</span>
          <span class="cmt-time">${fmtDate(c.created_at)}</span>
        </div>
        <div class="cmt-text">${escapeHtml(c.content)}</div>
        <div style="display:flex;gap:.5rem;margin-top:.3rem;">
          <button class="cmt-btn" onclick="arcStartReply('${c.id}','${escapeHtml(name).replace(/'/g,"\\'")}')" >↩ Reply</button>
          ${isOwn ? `<button class="cmt-btn cmt-del" onclick="arcDeleteCmt('${c.id}')">Delete</button>` : ''}
        </div>
        ${repHtml}
      </div>
    </div>`;
  }).join('');
}



function arcSortCmts(s, btn) {
  ARC_CMT_SORT = s;
  document.querySelectorAll('.arc-csort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderArcComments();
}
window.arcSortCmts = arcSortCmts;

function arcStartReply(pid, name) {
  ARC_REPLYING_TO = { id: pid, name };
  const bar = $('arc-reply-bar');
  if (bar) { bar.style.display = 'flex'; bar.querySelector('#arc-reply-name').textContent = name; }
  const box = $('arc-cmt-box');
  if (box) { box.placeholder = `Replying to ${name}…`; box.focus(); }
}
window.arcStartReply = arcStartReply;

function cancelArcReply() {
  ARC_REPLYING_TO = null;
  const bar = $('arc-reply-bar');
  if (bar) bar.style.display = 'none';
  const box = $('arc-cmt-box');
  if (box) box.placeholder = 'Write a response…';
}
window.cancelArcReply = cancelArcReply;

async function arcPostComment() {
  if (!CUR_USER) { showToast('Sign in to comment.'); return; }
  const box = $('arc-cmt-box');
  const content = (box?.value || '').trim();
  if (!content || !ARC_ACTIVE_STORY) return;

  const { data, error } = await sb.from('comments').insert({
    story_id: ARC_ACTIVE_STORY.id, user_id: CUR_USER.id,
    content, parent_id: ARC_REPLYING_TO?.id || null
  }).select('id,content,parent_id,created_at,user_id').single();

  if (error) { showToast(error.message, true); return; }
  const { data: me } = await sb.from('profiles').select('id,full_name,username,avatar_url,is_verified,is_admin').eq('id',CUR_USER.id).single();
  ARC_COMMENTS.push({ ...data, author: me || null });
  box.value = ''; box.style.height = 'auto';
  cancelArcReply();
  renderArcComments();
  // notify story owner if not commenting on own story
  if (ARC_ACTIVE_STORY && ARC_ACTIVE_STORY.user_id !== CUR_USER.id) {
    const from = CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Someone';
    pushNotif(ARC_ACTIVE_STORY.user_id, 'comment',
      `<strong>${escapeHtml(from)}</strong> commented on <strong>${escapeHtml(ARC_ACTIVE_STORY.title)}</strong>`,
      ARC_ACTIVE_STORY.id, CUR_USER.id);
  }
}
window.arcPostComment = arcPostComment;

async function arcDeleteCmt(id) {
  if (!confirm('Delete this comment?')) return;
  const { error } = await sb.from('comments').delete().eq('id', id).eq('user_id', CUR_USER.id);
  if (error) { showToast(error.message, true); return; }
  ARC_COMMENTS = ARC_COMMENTS.filter(c => c.id !== id && c.parent_id !== id);
  renderArcComments();
}
window.arcDeleteCmt = arcDeleteCmt;

/* ── Request access from inside drawer ── */
async function openArcReq(storyId) {
  if (!CUR_USER) { toast('Sign in to request access.', 'err'); return; }
  reqTargetId = storyId;
  if (ARC_PROFILE) reqOwnerCache = ARC_PROFILE.id;

  // ── Populate modal with story info ──
  const story = ARC_STORIES.find(s => s.id === storyId);
  const titleEl      = $('req-story-title');
  const archivistEl  = $('req-archivist-name');
  const catEl        = $('req-cat-pill');

  if (story && titleEl) {
    titleEl.textContent = story.title || 'Untitled';
  } else if (titleEl) {
    titleEl.textContent = 'Untitled Story';
  }

  if (archivistEl) {
    const name = ARC_PROFILE?.name || ARC_PROFILE?.handle || 'this archivist';
    archivistEl.textContent = 'by ' + name;
  }

  if (catEl && story?.category) {
    const cat = CAT[story.category] || CAT.Reflection;
    catEl.textContent = story.category;
    catEl.style.background = cat.bg;
    catEl.style.color = cat.color;
    catEl.style.display = 'inline-flex';
  } else if (catEl) {
    catEl.style.display = 'none';
  }

  openModal('req-modal');
}
window.openArcReq = openArcReq;

let reqOwnerCache = null; // owner_id hint set by openArcReq

/* ══════════════════════════════════════════════════════════
   PHASE 5 — ACCESS REQUESTS
══════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════
   PHASE 5 — ACCESS REQUESTS
══════════════════════════════════════════════════════════ */
async function loadMyRequests() {
  const { data, error } = await sb
    .from('access_requests')
    .select('id, story_id, status, reason, created_at, requester_id, stories(title), requester:profiles!requester_id(full_name, username)')
    .eq('owner_id', CUR_USER.id)
    .order('created_at', { ascending: false });

  if (error) { console.error('Requests:', error.message); return; }

  REQUESTS = (data||[]).map(r => ({
    id:         r.id,
    storyId:    r.story_id,
    storyTitle: r.stories?.title || 'Untitled',
    requesterId:r.requester_id,
    requester:  r.requester?.full_name || r.requester?.username || 'Unknown',
    initials:   ini(r.requester?.full_name || r.requester?.username),
    date:       fmtDate(r.created_at),
    reason:     r.reason || null,
    status:     r.status
  }));

  updateRequestBadge();
}

function updateRequestBadge() {
  const pending = REQUESTS.filter(r => r.status === 'pending').length;
  // Desktop sidebar badge
  const badge = $('req-badge');
  if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline' : 'none'; }
  // Mobile nav badge
  const mobBadge = $('mob-req-badge');
  if (mobBadge) { mobBadge.textContent = pending; mobBadge.style.display = pending ? 'flex' : 'none'; }
  // Mobile topbar notif dot (on requests button) — hide if no pending
  const notifDot = document.querySelector('#mob-req-icon .notif-dot');
}

function renderRequests() {
  const list = $('req-list');
  if (!REQUESTS.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg></div><div class="empty-title">No access requests</div><div class="empty-sub">Requests for your gated stories appear here</div></div>`;
    return;
  }
  list.innerHTML = REQUESTS.map(r => `
    <div class="req-card">
      <div class="req-av">${r.initials}</div>
      <div class="req-info">
        <div class="req-name">${r.requester}</div>
        <div class="req-story">Wants to read: <em>${r.storyTitle}</em></div>
        ${r.reason?`<div class="req-reason">"${r.reason}"</div>`:''}
        <div class="req-date">${r.date}</div>
      </div>
      <div class="req-actions">
        ${r.status==='pending'
          ? `<button class="req-btn req-approve" onclick="handleReq('${r.id}','approved')">Approve</button>
             <button class="req-btn req-decline" onclick="handleReq('${r.id}','rejected')">Decline</button>`
          : `<span class="req-status req-status-${r.status}">${r.status==='approved'?'✓ Approved':'✗ Declined'}</span>`}
      </div>
    </div>`).join('');
}
window.renderRequests = renderRequests;

function openReqModal(id) {
  reqTargetId = id;
  // Try to populate from STORIES (vault) or DISC_ALL context
  const story = STORIES.find(s => s.id === id);
  const titleEl     = $('req-story-title');
  const archivistEl = $('req-archivist-name');
  const catEl       = $('req-cat-pill');
  if (titleEl)     titleEl.textContent = story?.title || 'Gated Story';
  if (archivistEl) archivistEl.textContent = story ? 'by ' + (CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Archivist') : '';
  if (catEl && story?.category) {
    const cat = CAT[story.category] || CAT.Reflection;
    catEl.textContent = story.category;
    catEl.style.background = cat.bg;
    catEl.style.color = cat.color;
    catEl.style.display = 'inline-flex';
  } else if (catEl) { catEl.style.display = 'none'; }
  openModal('req-modal');
}
window.openReqModal = openReqModal;

async function submitReq() {
  if (!CUR_USER) { toast('Sign in to request access.', 'err'); return; }
  const reason     = $('req-reason').value.trim();
  const targetId   = reqTargetId;
  closeModal('req-modal');
  if (!targetId) return;

  // Owner_id: use cache (set by openArcReq) → local STORIES → DB
  let ownerId = reqOwnerCache;
  if (!ownerId) {
    const localStory = STORIES.find(s => s.id === targetId);
    ownerId = localStory?.user_id;
  }
  if (!ownerId) {
    const { data: sd } = await sb.from('stories').select('user_id').eq('id', targetId).single();
    if (!sd) { toast('Story not found.', 'err'); reqTargetId = null; reqOwnerCache = null; return; }
    ownerId = sd.user_id;
  }

  if (ownerId === CUR_USER.id) {
    toast("You can't request access to your own story.");
    reqTargetId = null; reqOwnerCache = null;
    return;
  }

  const { error } = await sb.from('access_requests').insert({
    story_id: targetId, requester_id: CUR_USER.id,
    owner_id: ownerId, reason: reason || null, status: 'pending'
  });

  if (error) {
    if (error.code === '23505') toast('You already requested access to this story.');
    else { console.error(error); toast(error.message, 'err'); }
  } else {
    toast('Request sent! Waiting for approval.');

    // ── Update arc card to "pending" immediately (no re-fetch) ──
    const arcS = ARC_STORIES.find(s => s.id === targetId);
    if (arcS) { arcS.pending = true; renderArchivistStories(); }

    // ── Notify story owner ──
    const { data: stRow } = await sb.from('stories').select('title, user_id').eq('id', targetId).single();
    if (stRow) {
      const from = CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Someone';
      pushNotif(
        stRow.user_id, 'request',
        `<strong>${escapeHtml(from)}</strong> requested access to <strong>${escapeHtml(stRow.title)}</strong>`,
        targetId, CUR_USER.id
      );
    }
  }
  $('req-reason').value = '';
  reqTargetId  = null;
  reqOwnerCache = null;
}
window.submitReq = submitReq;

async function handleReq(id, action) {
  const r = REQUESTS.find(x=>x.id===id);
  if (!r) return;

  // Update in DB
  const { error } = await sb.from('access_requests')
    .update({ status: action, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) { toast(error.message,'err'); return; }

  // If approved → insert into approved_access
  if (action==='approved') {
    const { error: ae } = await sb.from('approved_access').insert({
      story_id: r.storyId, user_id: r.requesterId
    });
    if (ae && ae.code!=='23505') console.error('approved_access:', ae.message);
  }

  // Notify requester + update local state
  const stTitle = r.storyTitle || r.story || 'a story';
  const owner   = CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Someone';
  if (action === 'approved') {
    pushNotif(r.requesterId, 'approve',
      `<strong>${escapeHtml(owner)}</strong> approved your access to <strong>${escapeHtml(stTitle)}</strong>`,
      r.storyId, CUR_USER.id);
  } else {
    pushNotif(r.requesterId, 'decline',
      `<strong>${escapeHtml(owner)}</strong> declined your request for <strong>${escapeHtml(stTitle)}</strong>`,
      r.storyId, CUR_USER.id);
  }
  r.status = action;
  updateRequestBadge();
  renderRequests();
  toast(action === 'approved'
    ? `✓ Access granted to ${r.requester} for "${stTitle}"`
    : `Request from ${r.requester} declined`
  );
}
window.handleReq = handleReq;

/* ── When owner approves: if arc drawer is open showing requester's profile,
       refresh so the approved story becomes readable immediately ── */
function refreshArcApproved(storyId) {
  const s = ARC_STORIES.find(x => x.id === storyId);
  if (!s) return;
  s.approved = true;
  s.canRead  = true;
  s.pending  = false;
  renderArchivistStories();
}

/* ══════════════════════════════════════════════════════════
   PHASE 6 — LIKES
══════════════════════════════════════════════════════════ */
async function toggleLike(id) {
  const s = STORIES.find(x=>x.id===id);
  if (!s) return;

  // Optimistic update
  s.liked = !s.liked;
  s.likes += s.liked ? 1 : -1;
  renderStories(activeFilter);
  updateProfileStats();

  if (s.liked) {
    const { error } = await sb.from('story_likes').insert({ story_id: id, user_id: CUR_USER.id });
    if (!error) {
      if (s.user_id !== CUR_USER.id) {
        const from = CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Someone';
        pushNotif(s.user_id, 'like', `<strong>${escapeHtml(from)}</strong> liked your story <strong>${escapeHtml(s.title)}</strong>`, id, CUR_USER.id);
      }
    }
    if (error && error.code !== '23505') { s.liked=false; s.likes--; renderStories(activeFilter); toast('Could not like.','err'); }
  } else {
    const { error } = await sb.from('story_likes').delete().eq('story_id',id).eq('user_id',CUR_USER.id);
    if (error) { s.liked=true; s.likes++; renderStories(activeFilter); toast('Could not unlike.','err'); }
  }
}
window.toggleLike = toggleLike;

/* ══════════════════════════════════════════════════════════
   COMMENTS (in Story Modal)
══════════════════════════════════════════════════════════ */
async function loadComments(storyId) {
  renderCommentsLoading();

  // Step 1: fetch comments (no FK join — avoids schema cache issues)
  const { data: cmtData, error } = await sb
    .from('comments')
    .select('id, content, parent_id, created_at, user_id')
    .eq('story_id', storyId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Comments:', error.message); renderCommentsError(); return; }
  if (!cmtData || !cmtData.length) { COMMENTS = []; renderComments(); return; }

  // Step 2: collect unique user_ids and batch-fetch their profiles
  const uids = [...new Set(cmtData.map(c => c.user_id))];
  const { data: profData } = await sb
    .from('profiles')
    .select('id, full_name, username, avatar_url, is_verified, is_admin')
    .in('id', uids);

  const profMap = {};
  (profData||[]).forEach(p => { profMap[p.id] = p; });

  // Step 3: attach author to each comment
  COMMENTS = cmtData.map(c => ({
    ...c,
    author: profMap[c.user_id] || null
  }));

  renderComments();
}

function renderCommentsLoading() {
  const c = $('comments-section');
  if (c) c.innerHTML = `<div style="padding:1rem 0;text-align:center;color:var(--text3);font-size:.78rem;">${spinnerInline()} Loading comments…</div>`;
}
function renderCommentsError() {
  const c = $('comments-section');
  if (c) c.innerHTML = `<div style="padding:1rem 0;color:var(--text3);font-size:.78rem;">Could not load comments.</div>`;
}

function renderComments() {
  const c = $('comments-section');
  if (!c) return;

  let list = [...COMMENTS];
  if (activeCommentSort==='top') list.sort((a,b)=>0); // future: sort by likes
  if (activeCommentSort==='oldest') list.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  if (activeCommentSort==='newest') list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const roots = list.filter(c=>!c.parent_id);
  const replies = list.filter(c=>c.parent_id);

  if (!roots.length && !replies.length) {
    c.innerHTML = `<div style="padding:1rem 0;color:var(--text3);font-size:.82rem;text-align:center;">No comments yet. Be the first to respond.</div>`;
    return;
  }

  c.innerHTML = roots.map(comment => {
    const name   = comment.author?.full_name || comment.author?.username || 'Someone';
    const isOwn  = comment.user_id === CUR_USER.id;
    const isV    = comment.author?.is_verified || comment.author?.is_admin || false;
    const avSrc  = comment.author?.avatar_url || null;
    const cUid   = comment.author?.id || comment.user_id;
    const cUname = comment.author?.username || '';
    const commentReplies = replies.filter(r=>r.parent_id===comment.id);
    const avSt   = avSrc ? 'padding:0;overflow:hidden;background:none;' : '';
    const avIn   = avSrc
      ? `<img src="${avSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.parentElement.textContent='${ini(name)}'">` : ini(name);
    const pLink  = cUname ? `discover.html?id=${cUid}&u=${encodeURIComponent(cUname)}&n=${encodeURIComponent(comment.author?.full_name||cUname)}` : '';
    const avEl   = pLink
      ? `<a href="${pLink}" class="cmt-av" style="${avSt}" title="View ${name}'s profile">${avIn}</a>`
      : `<div class="cmt-av" style="${avSt}">${avIn}</div>`;
    const tick   = isV ? `<svg style="display:inline-block;vertical-align:middle;margin-left:.25rem;flex-shrink:0;" viewBox="0 0 24 24" width="13" height="13" fill="none"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    return `
    <div class="comment" id="cmt-${comment.id}">
      ${avEl}
      <div class="cmt-body">
        <div class="cmt-header">
          <span class="cmt-name">${name}${tick}</span>
          <span class="cmt-time">${fmtDate(comment.created_at)} · ${fmtTime(comment.created_at)}</span>
        </div>
        <div class="cmt-text">${escapeHtml(comment.content)}</div>
        <div class="cmt-actions">
          <button class="cmt-btn" onclick="startReply('${comment.id}','${escapeHtml(name)}')" >↩ Reply</button>
          ${isOwn?`<button class="cmt-btn cmt-del" onclick="deleteComment('${comment.id}')">Delete</button>`:''}
        </div>
        ${commentReplies.map(rep => {
          const rname  = rep.author?.full_name || rep.author?.username || 'Someone';
          const rOwn   = rep.user_id === CUR_USER.id;
          const rV     = rep.author?.is_verified || rep.author?.is_admin || false;
          const rSrc   = rep.author?.avatar_url || null;
          const rUid   = rep.author?.id || rep.user_id;
          const rUname = rep.author?.username || '';
          const rAvSt  = rSrc ? 'padding:0;overflow:hidden;background:none;width:28px;height:28px;font-size:.6rem;' : 'width:28px;height:28px;font-size:.6rem;';
          const rAvIn  = rSrc ? `<img src="${rSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.parentElement.textContent='${ini(rname)}'">`  : ini(rname);
          const rLink  = rUname ? `discover.html?id=${rUid}&u=${encodeURIComponent(rUname)}&n=${encodeURIComponent(rep.author?.full_name||rUname)}` : '';
          const rAvEl  = rLink ? `<a href="${rLink}" class="cmt-av" style="${rAvSt}" title="View ${rname}">${rAvIn}</a>` : `<div class="cmt-av" style="${rAvSt}">${rAvIn}</div>`;
          return `<div class="comment reply" id="cmt-${rep.id}">
            ${rAvEl}
            <div class="cmt-body">
              <div class="cmt-header">
                <span class="cmt-name">${rname}${rV?`<svg style="display:inline-block;vertical-align:middle;margin-left:.25rem;flex-shrink:0;" viewBox="0 0 24 24" width="13" height="13" fill="none"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`:''}
                </span><span class="cmt-time">${fmtDate(rep.created_at)} · ${fmtTime(rep.created_at)}</span>
              </div>
              <div class="cmt-text">${escapeHtml(rep.content)}</div>
              <div class="cmt-actions">${rOwn?`<button class="cmt-btn cmt-del" onclick="deleteComment('${rep.id}')">Delete</button>`:''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function startReply(parentId, name) {
  replyingTo = { id: parentId, name };
  const box = $('comment-box');
  const bar = $('reply-bar');
  if (bar) { bar.style.display='flex'; bar.querySelector('#reply-to-name').textContent = name; }
  if (box) { box.focus(); box.placeholder = `Replying to ${name}…`; }
}
window.startReply = startReply;

function cancelReply() {
  replyingTo = null;
  const bar = $('reply-bar');
  const box = $('comment-box');
  if (bar) bar.style.display='none';
  if (box) { box.placeholder='Write a response…'; }
}
window.cancelReply = cancelReply;

async function submitComment() {
  const box = $('comment-box');
  const content = box?.value?.trim();
  if (!content) return;

  const { data, error } = await sb.from('comments').insert({
    story_id:  ACTIVE_STORY_ID,
    user_id:   CUR_USER.id,
    content,
    parent_id: replyingTo?.id || null
  }).select('id, content, parent_id, created_at, user_id').single();

  if (error) { toast(error.message,'err'); return; }

  // Attach author from current user profile
  const newComment = {
    ...data,
    author: CUR_PROFILE ? {
      id:         CUR_USER.id,
      full_name:  CUR_PROFILE.full_name,
      username:   CUR_PROFILE.username,
      avatar_url: CUR_PROFILE.avatar_url  || null,
      is_verified:CUR_PROFILE.is_verified || false,
      is_admin:   CUR_PROFILE.is_admin    || IS_ADMIN,
    } : null
  };
  COMMENTS.push(newComment);
  box.value = '';
  cancelReply();
  renderComments();
  updateCommentCount();
  // notify story owner (check local STORIES first, fall back to DB)
  if (ACTIVE_STORY_ID) {
    const localStory = STORIES.find(x => x.id === ACTIVE_STORY_ID);
    if (localStory) {
      if (localStory.user_id !== CUR_USER.id) {
        const from = CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Someone';
        pushNotif(localStory.user_id, 'comment', `<strong>${escapeHtml(from)}</strong> commented on <strong>${escapeHtml(localStory.title)}</strong>`, localStory.id, CUR_USER.id);
      }
    } else {
      // Story not in local vault — fetch owner from DB (arc drawer scenario)
      sb.from('stories').select('user_id, title').eq('id', ACTIVE_STORY_ID).single()
        .then(({ data: st }) => {
          if (st && st.user_id !== CUR_USER.id) {
            const from = CUR_PROFILE?.full_name || CUR_PROFILE?.username || 'Someone';
            pushNotif(st.user_id, 'comment', `<strong>${escapeHtml(from)}</strong> commented on <strong>${escapeHtml(st.title)}</strong>`, ACTIVE_STORY_ID, CUR_USER.id);
          }
        });
    }
  }
}
window.submitComment = submitComment;

async function deleteComment(id) {
  if (!confirm('Delete this comment?')) return;
  const { error } = await sb.from('comments').delete().eq('id',id).eq('user_id', CUR_USER.id);
  if (error) { toast(error.message,'err'); return; }
  COMMENTS = COMMENTS.filter(c=>c.id!==id && c.parent_id!==id);
  renderComments();
  updateCommentCount();
  toast('Comment deleted.');
}
window.deleteComment = deleteComment;

function updateCommentCount() {
  const el = $('comment-count');
  if (el) el.textContent = COMMENTS.length + ' ' + (COMMENTS.length===1?'Response':'Responses');
}

function sortComments(sort, btn) {
  activeCommentSort = sort;
  document.querySelectorAll('.csort-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderComments();
}
window.sortComments = sortComments;

function escapeHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

/* ══════════════════════════════════════════════════════════
   OPEN STORY MODAL
══════════════════════════════════════════════════════════ */
function openStory(id) {
  const s = STORIES.find(x=>x.id===id);
  if (!s) return;
  ACTIVE_STORY_ID = id;
  COMMENTS = [];
  activeCommentSort = 'newest';
  replyingTo = null;

  const visMap = {
    public:  `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#30d158" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/></svg> Public`,
    request: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> Gated`,
    private: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Private`
  };

  $('modal-vis-bar').innerHTML = visMap[s.visibility]||'';
  $('modal-title').textContent = s.title;
  $('modal-meta').textContent = `${s.category} · ${s.date}`;
  const isGatedStory = s.visibility === 'request';
  $('modal-body').innerHTML = `
    <div class="${isGatedStory ? 'protected-content' : ''}" id="story-protected-wrap" style="font-size:.92rem;line-height:1.85;color:var(--text2);white-space:pre-wrap;">${escapeHtml(s.content)}</div>
    <div style="margin-top:1.5rem;padding-top:1rem;border-top:.5px solid var(--border);display:flex;align-items:center;gap:1rem;">
      <button class="like-btn${s.liked?' liked':''}" id="modal-like-btn" onclick="toggleLikeModal('${id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${s.liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span id="modal-like-count">${s.likes}</span> ${s.likes===1?'like':'likes'}
      </button>
    </div>

    <!-- COMMENTS -->
    <div style="margin-top:2rem;padding-top:1.5rem;border-top:.5px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <div style="font-size:.82rem;font-weight:700;color:var(--text);letter-spacing:-.02em;" id="comment-count">0 Responses</div>
        <div style="display:flex;gap:.4rem;">
          <button class="csort-btn active" onclick="sortComments('newest',this)">Newest</button>
          <button class="csort-btn" onclick="sortComments('oldest',this)">Oldest</button>
        </div>
      </div>

      <!-- compose -->
      <div style="background:var(--surface);border:.5px solid var(--border2);border-radius:10px;padding:1rem;margin-bottom:1.25rem;">
        <div id="reply-bar" style="display:none;align-items:center;gap:.5rem;margin-bottom:.75rem;padding:.5rem .75rem;background:var(--gold-dim);border-radius:7px;font-size:.72rem;color:var(--gold);">
          <span>Replying to <strong id="reply-to-name"></strong></span>
          <button onclick="cancelReply()" style="margin-left:auto;background:none;border:none;color:var(--gold);cursor:none;font-size:.72rem;">✕ Cancel</button>
        </div>
        <textarea id="comment-box" placeholder="Write a response…" maxlength="500"
          style="width:100%;background:none;border:none;outline:none;font-family:var(--font);font-size:.85rem;color:var(--text);line-height:1.6;resize:none;min-height:70px;"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:.5rem;">
          <button onclick="submitComment()" style="background:var(--gold);color:#000;border:none;padding:.45rem 1rem;border-radius:8px;font-size:.78rem;font-weight:700;font-family:var(--font);cursor:none;">Post</button>
        </div>
      </div>

      <div id="comments-section"></div>
    </div>`;

  openModal('story-modal');
  loadComments(id);
}
window.openStory = openStory;

async function toggleLikeModal(id) {
  await toggleLike(id);
  const s = STORIES.find(x=>x.id===id);
  if (!s) return;
  const btn = $('modal-like-btn');
  const cnt = $('modal-like-count');
  if (btn) { btn.className='like-btn'+(s.liked?' liked':''); btn.querySelector('svg').setAttribute('fill',s.liked?'currentColor':'none'); }
  if (cnt) cnt.textContent = s.likes;
}
window.toggleLikeModal = toggleLikeModal;

/* ══════════════════════════════════════════════════════════
   PROFILE STATS
══════════════════════════════════════════════════════════ */
function updateProfileStats() {
  el('ps-total',  STORIES.length);
  el('ps-public', STORIES.filter(s=>s.visibility==='public').length);
  const psLikes = $('ps-likes');
  if (psLikes) psLikes.innerHTML = STORIES.reduce((a,s)=>a+s.likes,0)+'<span>+</span>';
  const pending = REQUESTS.filter(r=>r.status==='pending').length;
  el('ps-pending', pending);
  // Update settings story count
  el('settings-story-count', STORIES.length + ' archived');
}
window.updateProfileStats = updateProfileStats;

function renderProfileGrid() {
  const g = $('profile-grid');
  if (!g) return;
  // Respect the active filter (shared with feed tab)
  const filtered = activeFilter==='all' ? STORIES : STORIES.filter(s=>s.visibility===activeFilter);
  g.innerHTML = filtered.map(storyCard).join('') ||
    `<div class="empty" style="grid-column:1/-1;">
       <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
       <div class="empty-title">No stories here yet</div>
       <div class="empty-sub">Start archiving your memories.</div>
     </div>`;
}

/* ══════════════════════════════════════════════════════════
   REALTIME
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   NOTIFICATIONS — full system
   Types: like | comment | request | approve
══════════════════════════════════════════════════════════════════ */
let NOTIFS         = [];
let NOTIF_FILTER   = 'all';
let NOTIF_CHANNEL  = null;
let STARRED_IDS    = new Set(JSON.parse(localStorage.getItem('croniq_starred')||'[]'));

/* ── helpers ── */
function notifIcon(type) {
  const icons = {
    like:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    comment: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    request: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    approve: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    decline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  };
  return icons[type] || icons.comment;
}

/* ── Web Push + Notification Sound ── */
let NOTIF_SOUND_CTX = null;

function getNotifSound() {
  if (!NOTIF_SOUND_CTX) {
    try { NOTIF_SOUND_CTX = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; }
  }
  return NOTIF_SOUND_CTX;
}

function playNotifSound() {
  const ctx = getNotifSound();
  if (!ctx) return;
  try {
    // Soft double-ping — pleasant, not intrusive
    const t = ctx.currentTime;
    [0, 0.15].forEach((delay, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 1046, t + delay);
      osc.frequency.exponentialRampToValueAtTime(i === 0 ? 660 : 880, t + delay + 0.12);
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.18, t + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.22);
      osc.start(t + delay);
      osc.stop(t + delay + 0.25);
    });
  } catch(e) {}
}

async function requestPushPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function sendBrowserNotif(title, body, type) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'croniq-' + type,
      renotify: true,
    });
    n.onclick = () => { window.focus(); n.close(); openNotifPanel(); };
    setTimeout(() => n.close(), 6000);
  } catch(e) {}
}

function handleIncomingNotif(notif) {
  // Only trigger sound+push if app is not focused
  const soundEnabled = localStorage.getItem('croniq_notif_sound') !== 'off';
  if (soundEnabled) playNotifSound();

  // Strip HTML tags for browser notification body
  const bodyText = notif.message.replace(/<[^>]+>/g, '');
  const titles = { like:'New Like', comment:'New Comment', request:'Access Request', approve:'Access Approved', decline:'Request Declined' };
  sendBrowserNotif('CRONIQ — ' + (titles[notif.type]||'Notification'), bodyText, notif.type);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m/60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h/24);
  if (d < 7)  return d + 'd ago';
  return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}

function saveStarred() {
  localStorage.setItem('croniq_starred', JSON.stringify([...STARRED_IDS]));
}

/* ── load notifications from DB ── */
async function loadNotifications() {
  if (!CUR_USER) return;
  const { data, error } = await sb.from('notifications')
    .select('*')
    .eq('user_id', CUR_USER.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) { console.warn('notif load:', error.message); return; }
  NOTIFS = data || [];
  updateNotifBadge();
}

/* ── badge ── */
function updateNotifBadge() {
  const unread = NOTIFS.filter(n => !n.is_read).length;
  ['notif-dot-desktop','notif-dot-mob'].forEach(id => {
    const el = $(id);
    if (el) el.style.display = unread > 0 ? 'block' : 'none';
  });
  // Animate bell if new
  if (unread > 0) {
    ['bell-btn-desktop','bell-btn-mob'].forEach(id => {
      const el = $(id);
      if (el) { el.classList.add('bell-pulse'); setTimeout(()=>el.classList.remove('bell-pulse'),600); }
    });
  }
}

/* ── open / close panel ── */
function openNotifPanel() {
  $('notif-overlay').style.display = 'block';
  $('notif-panel').classList.add('open');
  NOTIF_FILTER = 'all';
  document.querySelectorAll('.nf-tab').forEach(b => b.classList.toggle('active', b.dataset.nf === 'all'));
  renderNotifs();
}
window.openNotifPanel = openNotifPanel;

function closeNotifPanel() {
  $('notif-overlay').style.display = 'none';
  $('notif-panel').classList.remove('open');
}
window.closeNotifPanel = closeNotifPanel;

/* ── filter ── */
function filterNotifs(f, btn) {
  NOTIF_FILTER = f;
  document.querySelectorAll('.nf-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNotifs();
}
window.filterNotifs = filterNotifs;

/* ── render ── */
function renderNotifs() {
  const list = $('notif-list');
  if (!list) return;

  // ── Tab badges: one clean pass, remove old then add new ──
  const TAB_TYPES = ['all','like','comment','request','approve','decline'];
  TAB_TYPES.forEach(f => {
    const btn = document.querySelector(`.nf-tab[data-nf="${f}"]`);
    if (!btn) return;
    // Remove ALL existing badges first
    btn.querySelectorAll('.nf-count').forEach(el => el.remove());
    // Count unread for this type
    const count = f === 'all'
      ? NOTIFS.filter(n => !n.is_read).length
      : NOTIFS.filter(n => n.type === f && !n.is_read).length;
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'nf-count';
      badge.textContent = count > 99 ? '99+' : count;
      btn.appendChild(badge);
    }
  });

  // ── Filter items ──
  const items = NOTIF_FILTER === 'all'
    ? [...NOTIFS]
    : NOTIFS.filter(n => n.type === NOTIF_FILTER);

  // ── Empty state ──
  if (!items.length) {
    const labels = {
      like:'likes', comment:'comments', request:'requests',
      approve:'approvals', decline:'declines'
    };
    const label = NOTIF_FILTER === 'all' ? '' : (labels[NOTIF_FILTER] || NOTIF_FILTER) + ' ';
    list.innerHTML = `<div class="notif-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <div class="notif-empty-title">All caught up</div>
      <div class="notif-empty-sub">No ${label}notifications yet.</div>
    </div>`;
    return;
  }

  // ── Render items ──
  const ICO_CLASS = { like:'like', comment:'comment', request:'request', approve:'approve', decline:'decline' };

  list.innerHTML = items.map(n => {
    const icoClass  = ICO_CLASS[n.type] || 'comment';
    const storyId   = n.related_story_id || '';
    const fromUser  = n.related_user_id  || '';

    // "View Profile" button only on request type when we have the requester's id
    const profileBtn = (n.type === 'request' && fromUser)
      ? `<button class="notif-profile-btn"
           onclick="event.stopPropagation();viewRequesterProfile('${fromUser}','${n.id}')"
           title="View requester profile">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
             <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
           </svg>
           View Profile
         </button>`
      : '';

    return `<div class="notif-item${n.is_read ? '' : ' unread'}"
      onclick="handleNotifClick('${n.id}','${n.type}','${storyId}','${fromUser}')">
      ${n.is_read ? '' : '<div class="notif-unread-bar"></div>'}
      <div class="notif-ico ${icoClass}">${notifIcon(n.type)}</div>
      <div class="notif-body">
        <div class="notif-msg">${n.message}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
        ${profileBtn}
      </div>
    </div>`;
  }).join('');
}

/* ── click handler ── */
async function handleNotifClick(id, type, storyId, fromUserId) {
  // Mark as read
  await sb.from('notifications').update({ is_read: true }).eq('id', id);
  NOTIFS = NOTIFS.map(n => n.id === id ? { ...n, is_read: true } : n);
  updateNotifBadge();
  renderNotifs();
  closeNotifPanel();

  const navBtn = panel => document.querySelector(`.sb-item[data-panel="${panel}"]`) || document.querySelector(`.mob-nav-btn[data-panel="${panel}"]`);

  if (type === 'request') {
    // Owner got a request → go to requests panel
    nav('requests', navBtn('requests'));

  } else if (type === 'approve' && storyId && fromUserId) {
    // Requester was approved → nav to discover, open drawer, open story
    nav('discover', navBtn('discover'));
    setTimeout(async () => {
      try {
        // Open the archivist's drawer (fetches from DB including fresh approved_access)
        await openArchivistDrawer(fromUserId);
        // Story should now have canRead=true from fresh DB load
        const s = ARC_STORIES.find(x => x.id === storyId);
        if (s) {
          await openArcStory(storyId);
        } else {
          // Fallback: story not in ARC_STORIES (shouldn't happen after drawer load)
          // Try opening the drawer and let user tap the story
          toast('Story approved! It is now readable in the drawer.');
        }
      } catch(err) {
        console.error('approve redirect:', err);
        toast('Access granted! Open the story from the drawer.');
      }
    }, 300);

  } else if (type === 'decline' && storyId && fromUserId) {
    // Requester was declined → open the archivist's drawer
    nav('discover', navBtn('discover'));
    setTimeout(() => openArchivistDrawer(fromUserId), 350);

  } else if (type === 'like' || type === 'comment') {
    // Story owner got a like/comment → open their own story
    nav('feed', navBtn('feed'));
    setTimeout(() => {
      const s = STORIES.find(x => x.id === storyId);
      if (s) openStory(storyId);
    }, 250);

  } else {
    nav('feed', navBtn('feed'));
  }
}
window.handleNotifClick = handleNotifClick;

/* View requester profile from notification — opens arc drawer */
async function viewRequesterProfile(userId, notifId) {
  // Mark notification read
  await sb.from('notifications').update({ is_read: true }).eq('id', notifId);
  NOTIFS = NOTIFS.map(n => n.id === notifId ? { ...n, is_read: true } : n);
  updateNotifBadge();
  renderNotifs();
  closeNotifPanel();
  // Open discover panel then load their drawer
  nav('discover', document.querySelector('.sb-item[data-panel="discover"]') || document.querySelector('.mob-nav-btn[data-panel="discover"]'));
  setTimeout(() => openArchivistDrawer(userId), 300);
}
window.viewRequesterProfile = viewRequesterProfile;

/* ── mark all read ── */
async function markAllRead() {
  if (!CUR_USER || !NOTIFS.some(n => !n.is_read)) return;
  await sb.from('notifications').update({ is_read: true }).eq('user_id', CUR_USER.id).eq('is_read', false);
  NOTIFS = NOTIFS.map(n => ({ ...n, is_read: true }));
  updateNotifBadge();
  renderNotifs();
}
window.markAllRead = markAllRead;

/* ── INSERT notification helper ── */
async function pushNotif(userId, type, message, storyId = null, fromUserId = null) {
  if (!userId || userId === CUR_USER?.id) return; // never self-notify

  // Respect recipient's stored notification prefs (sender's settings irrelevant here)
  // We check OUR OWN prefs — are we configured to send this type?
  // Actually prefs are per-user on their own device; we can only gate on sender side.
  // The real gate: only push if the action type is enabled in our settings
  const pref = localStorage.getItem('croniq_notif_' + type);
  if (pref === 'off') return; // user turned this type off in settings

  try {
    await sb.from('notifications').insert({
      user_id: userId, type, message,
      related_story_id: storyId || null,
      related_user_id: fromUserId || null,
    });
  } catch(e) { console.warn('pushNotif:', e.message); }
}

/* ── realtime: subscribe to own notifications ── */
function setupNotifRealtime() {
  if (!CUR_USER) return;
  NOTIF_CHANNEL = sb.channel('notifs-' + CUR_USER.id)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${CUR_USER.id}`
    }, payload => {
      const n = payload.new;
      NOTIFS.unshift(n);
      updateNotifBadge();
      if ($('notif-panel')?.classList.contains('open')) renderNotifs();
      // Sound + browser push
      handleIncomingNotif(n);
    })
    .subscribe();

  // Ask for push permission once
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => requestPushPermission(), 3000);
  }
}

/* ══════════════════════════════════════════════════════════════════
   STARRED ARCHIVISTS — localStorage-backed + discover section
══════════════════════════════════════════════════════════════════ */
function isStarred(userId) { return STARRED_IDS.has(userId); }

function toggleStarArchivist() {
  if (!CUR_USER) { toast('Sign in to star archivists.', 'err'); return; }
  if (!ARC_PROFILE) return;
  const uid = ARC_PROFILE.id;
  if (STARRED_IDS.has(uid)) {
    STARRED_IDS.delete(uid);
    toast('Removed from starred');
  } else {
    STARRED_IDS.add(uid);
    toast('⭐ ' + (ARC_PROFILE.name || 'Archivist') + ' starred');
  }
  saveStarred();
  updateArcStarBtn();
  renderStarredSection();
  // Also refresh discover card star button
  const cardBtn = document.querySelector(`.uc-star-btn[data-uid="${uid}"]`);
  if (cardBtn) updateUserCardStar(cardBtn, uid);
}
window.toggleStarArchivist = toggleStarArchivist;

function updateArcStarBtn() {
  if (!ARC_PROFILE) return;
  const btn = $('arc-star-btn');
  const lbl = $('arc-star-lbl');
  const ico = $('arc-star-ico');
  if (!btn) return;
  const starred = isStarred(ARC_PROFILE.id);
  btn.classList.toggle('starred', starred);
  if (lbl) lbl.textContent = starred ? 'Starred' : 'Star';
  if (ico) ico.setAttribute('fill', starred ? 'var(--gold)' : 'none');
}

function toggleStarFromCard(uid, e) {
  e.stopPropagation();
  if (!CUR_USER) { toast('Sign in to star archivists.', 'err'); return; }
  const wasStarred = STARRED_IDS.has(uid);
  if (wasStarred) {
    STARRED_IDS.delete(uid);
    toast('Removed from starred');
  } else {
    STARRED_IDS.add(uid);
    const u = DISC_ALL.find(x => x.id === uid);
    toast('⭐ ' + (u?.name || 'Archivist') + ' starred');
  }
  saveStarred();
  renderStarredSection();
  renderDiscGrid(); // re-render so star buttons reflect new state
}
window.toggleStarFromCard = toggleStarFromCard;

function updateUserCardStar(btn, uid) {
  const starred = isStarred(uid);
  btn.classList.toggle('starred', starred);
  btn.title = starred ? 'Remove star' : 'Star archivist';
  btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="${starred ? 'var(--gold)' : 'none'}" stroke="${starred ? 'var(--gold)' : 'currentColor'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

function renderStarredSection() {
  const sec   = $('starred-section');
  const grid  = $('starred-grid');
  const div   = $('disc-divider');
  const lbl   = $('disc-all-label');
  if (!sec || !grid) return;

  const starredUsers = DISC_ALL.filter(u => STARRED_IDS.has(u.id));
  if (!starredUsers.length) {
    sec.style.display = 'none';
    if (div) div.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  if (div) div.style.display = 'block';
  grid.innerHTML = starredUsers.map(u => userCardHTML(u, true)).join('');
}

/* shared user card renderer (used for both starred + main grid) */
function userCardHTML(u, miniStar = false) {
  const starred  = isStarred(u.id);
  const isVerif  = u.verified || u.is_verified || false;
  const isAdmU   = u.isAdmin  || u.is_admin    || false;
  const avSrc   = u.avatar_url || u.avatar || null;
  const avStyle = avSrc
    ? 'padding:0;overflow:hidden;background:none;'
    : `background:${u.grad || 'linear-gradient(135deg,var(--gold),var(--red2))'};`;
  const av = avSrc
    ? `<img src="${avSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none';this.parentElement.style.background='${u.grad||'#888'}';this.parentElement.textContent='${ini(u.name)}'"/>`
    : ini(u.name);
  const tick = (isVerif || isAdmU) ? `<svg class="vtick vtick-sm" viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';;
  const adminBadge = isAdmU ? `<div class="uc-admin-badge">ADMIN</div>` : '';
  return `<div class="user-card${isAdmU ? ' uc-is-admin' : ''}" onclick="openArchivistDrawer('${u.id}')">
    <button class="uc-star-btn ${starred ? 'starred' : ''}" data-uid="${u.id}" onclick="toggleStarFromCard('${u.id}',event)" title="${starred ? 'Remove star' : 'Star archivist'}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="${starred ? 'var(--gold)' : 'none'}" stroke="${starred ? 'var(--gold)' : 'currentColor'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    </button>
    ${adminBadge}
    <div class="uc-avatar" style="${avStyle}">${av}</div>
    <div class="uc-name-row"><span class="uc-name">${escapeHtml(u.name)}</span>${tick}</div>
    <div class="uc-handle">@${escapeHtml(u.handle)}</div>
    ${u.bio ? `<div class="uc-bio">${escapeHtml(u.bio).slice(0,55)}${u.bio.length>55?'...':''}</div>` : ''}
    <div class="uc-tags">
      <div class="uc-tag">${(u.pubCount||u.stories||0)} stories</div>
      ${(u.cats||u.categories||[]).slice(0,2).map(c=>`<div class="uc-tag">${c}</div>`).join('')}
    </div>
    <div class="uc-view-btn">View stories</div>
  </div>`;
}


/* ══════════════════════════════════════════════════════════
   ADMIN PANEL — Verification Control (bigcroniq@gmail.com)
══════════════════════════════════════════════════════════ */
const VTICK_16 = '<svg class="vtick" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const VTICK_13 = '<svg class="vtick vtick-sm" viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#8B5E3C"/><path d="M8 12l2.5 2.5L16 9" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let ADMIN_VERIFIED_LIST = [];

async function loadAdminPanel() {
  if (!IS_ADMIN) return;
  const grid = $('admin-verified-grid');
  if (grid) grid.innerHTML = '<div style="padding:1rem 0;color:var(--text3);font-size:.8rem;">Loading...</div>';
  const { data } = await sb.from('profiles')
    .select('id,username,full_name,is_verified,is_admin,avatar_url')
    .eq('is_verified', true).order('full_name');
  ADMIN_VERIFIED_LIST = data || [];
  renderAdminVerifiedList();
}
window.loadAdminPanel = loadAdminPanel;

function renderAdminVerifiedList() {
  const grid = $('admin-verified-grid');
  if (!grid) return;
  if (!ADMIN_VERIFIED_LIST.length) {
    grid.innerHTML = '<div style="padding:1rem 0;color:var(--text3);font-size:.8rem;">No verified archivists yet.</div>';
    return;
  }
  grid.innerHTML = ADMIN_VERIFIED_LIST.map(u => {
    const name = u.full_name || u.username || 'Unknown';
    return `<div class="admin-user-row">
      <div class="admin-user-av">${ini(name)}</div>
      <div class="admin-user-info">
        <div class="admin-user-name">${escapeHtml(name)} ${VTICK_16}</div>
        <div class="admin-user-handle">@${escapeHtml(u.username||'')}${u.is_admin ? ' <span style="color:var(--gold);font-weight:700;font-size:.62rem;">ADMIN</span>' : ''}</div>
      </div>
      ${u.is_admin ? '<span style="font-size:.68rem;color:var(--text3);">Platform Admin</span>' :
        `<button class="admin-revoke-btn" onclick="adminSetVerified('${u.id}',false,'${escapeHtml(u.username||'')}')">Revoke</button>`}
    </div>`;
  }).join('');
}
window.renderAdminVerifiedList = renderAdminVerifiedList;

let adminSearchTimer = null;
function adminSearchUser(q) {
  clearTimeout(adminSearchTimer);
  const results = $('admin-search-results');
  const val = q.trim();
  if (!val) { if (results) results.innerHTML = ''; return; }
  adminSearchTimer = setTimeout(async () => {
    if (results) results.innerHTML = '<div style="color:var(--text3);font-size:.78rem;padding:.5rem 0;">Searching...</div>';
    const { data } = await sb.from('profiles')
      .select('id,username,full_name,is_verified,is_admin')
      .ilike('username', `%${val}%`).limit(8);
    if (!data?.length) {
      if (results) results.innerHTML = '<div style="color:var(--text3);font-size:.78rem;padding:.5rem 0;">No users found.</div>';
      return;
    }
    if (results) results.innerHTML = data.map(u => {
      const name = u.full_name || u.username || 'Unknown';
      const isV  = u.is_verified;
      const isA  = u.is_admin;
      return `<div class="admin-search-row">
        <div class="admin-user-av" style="width:32px;height:32px;font-size:.65rem;">${ini(name)}</div>
        <div class="admin-user-info">
          <div class="admin-user-name" style="font-size:.82rem;">${escapeHtml(name)}${isV?' '+VTICK_13:''}</div>
          <div class="admin-user-handle" style="font-size:.7rem;">@${escapeHtml(u.username||'')}${isA?' · ADMIN':''}</div>
        </div>
        ${isA ? '<span style="font-size:.68rem;color:var(--text3);">Platform Admin</span>' :
          `<button class="admin-${isV?'revoke':'grant'}-btn" onclick="adminSetVerified('${u.id}',${!isV},'${escapeHtml(u.username||'')}')">
            ${isV ? 'Revoke' : 'Verify'}
          </button>`}
      </div>`;
    }).join('');
  }, 300);
}
window.adminSearchUser = adminSearchUser;

async function adminSetVerified(userId, grant, username) {
  if (!IS_ADMIN) { toast('Not authorised.', 'err'); return; }
  const { error } = await sb.from('profiles').update({ is_verified: grant }).eq('id', userId);
  if (error) { toast(error.message, 'err'); return; }
  toast(grant ? `@${username} is now verified` : `@${username} verification removed`);
  // Refresh
  const inp = $('admin-search-input');
  if (inp?.value) adminSearchUser(inp.value);
  loadAdminPanel();
  // Live update discover grid
  const u = DISC_ALL.find(x => x.id === userId);
  if (u) { u.verified = grant; u.is_verified = grant; }
  renderDiscGrid();
  renderStarredSection();
}
window.adminSetVerified = adminSetVerified;

function setupRealtime() {
  // Realtime likes
  sb.channel('rt-likes')
    .on('postgres_changes', { event:'*', schema:'public', table:'story_likes' }, payload => {
      const sid = payload.new?.story_id || payload.old?.story_id;
      const uid = payload.new?.user_id  || payload.old?.user_id;
      if (!sid || uid === CUR_USER.id) return; // skip own actions (already optimistic)
      const s = STORIES.find(x=>x.id===sid);
      if (!s) return;
      if (payload.eventType==='INSERT') s.likes++;
      if (payload.eventType==='DELETE') s.likes = Math.max(0, s.likes-1);
      renderStories(activeFilter);
      updateProfileStats();
    })
    .subscribe();

  // Realtime new access requests
  sb.channel('rt-requests')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'access_requests', filter:`owner_id=eq.${CUR_USER.id}` }, async () => {
      await loadMyRequests();
      renderRequests();
      toast('New access request received!');
    })
    .subscribe();
}


/* ══════════════════════════════════════════════════════════
   ADVANCED PROFILE — AVATAR, EDIT, SETTINGS
══════════════════════════════════════════════════════════ */

/* ── Avatar helpers ── */
function renderAvatarPhoto(url) {
  // ── Profile panel large avatar ──
  const initEl  = $('profile-av');
  const imgWrap = $('profile-av-img');
  const imgEl   = $('profile-av-photo');
  if (imgWrap && imgEl) {
    imgEl.src = url;
    imgWrap.style.display = 'block';
    if (initEl) initEl.style.opacity = '0';
  }

  // ── Sidebar small avatar → swap initials for photo ──
  const sbAv = $('sb-avatar');
  if (sbAv) {
    sbAv.innerHTML = `<img src="${url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
    sbAv.style.padding = '0';
  }

  // ── Mobile header avatar ──
  const mobAv = $('mob-av');
  if (mobAv) {
    mobAv.innerHTML = `<img src="${url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
    mobAv.style.padding = '0';
  }
}

function triggerAvatarUpload() {
  const inp = $('avatar-input');
  if (inp) inp.click();
}
window.triggerAvatarUpload = triggerAvatarUpload;

async function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // Validate
  if (!file.type.startsWith('image/')) { toast('Please pick an image file.', 'err'); return; }
  if (file.size > 5 * 1024 * 1024)    { toast('Image must be under 5MB.',   'err'); return; }

  // Show progress ring
  const ring = $('prof-av-ring');
  if (ring) ring.innerHTML = `<div style="color:#fff;font-size:.65rem;font-weight:700;">Uploading…</div>`;

  try {
    // Upload to Supabase Storage bucket "avatars"
    const ext  = file.name.split('.').pop();
    const path = `${CUR_USER.id}/avatar.${ext}`;

    const { error: upErr } = await sb.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) throw upErr;

    // Get public URL
    const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
    const avatar_url = urlData.publicUrl + '?t=' + Date.now(); // cache-bust

    // Save to profile
    const { error: dbErr } = await sb.from('profiles')
      .update({ avatar_url })
      .eq('id', CUR_USER.id);

    if (dbErr) throw dbErr;

    // Update local + render
    if (CUR_PROFILE) CUR_PROFILE.avatar_url = avatar_url;
    renderAvatarPhoto(avatar_url);
    toast('Profile photo updated!');

  } catch(err) {
    console.error('Avatar upload:', err);
    toast(err.message || 'Upload failed.', 'err');
  } finally {
    // Restore camera icon
    if (ring) ring.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    input.value = '';
  }
}
window.handleAvatarUpload = handleAvatarUpload;

/* ── Profile edit ── */
function openProfileEdit() {
  const p = CUR_PROFILE || {};
  $('edit-fullname').value         = p.full_name || '';
  $('edit-username-field').value   = p.username  || '';
  $('edit-bio').value              = p.bio        || '';
  $('prof-info-view').style.display = 'none';
  $('prof-info-edit').style.display = 'block';
}
window.openProfileEdit = openProfileEdit;

function cancelProfileEdit() {
  $('prof-info-view').style.display = 'block';
  $('prof-info-edit').style.display = 'none';
}
window.cancelProfileEdit = cancelProfileEdit;

async function saveProfileEdit() {
  const full_name = $('edit-fullname').value.trim();
  const username  = $('edit-username-field').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const bio       = $('edit-bio').value.trim();

  if (!full_name) { toast('Name cannot be empty.', 'err'); return; }
  if (!username)  { toast('Username cannot be empty.', 'err'); return; }

  const btn = document.querySelector('#prof-info-edit .prof-save-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    const { error } = await sb.from('profiles')
      .update({ full_name, username, bio })
      .eq('id', CUR_USER.id);

    if (error) {
      if (error.code === '23505') throw new Error('That username is already taken.');
      throw error;
    }

    // Update local state
    if (!CUR_PROFILE) CUR_PROFILE = {};
    CUR_PROFILE.full_name = full_name;
    CUR_PROFILE.username  = username;
    CUR_PROFILE.bio       = bio;

    // Re-render profile display
    const handle = '@' + username;
    el('profile-name',    full_name);
    el('profile-user',    handle);
    el('profile-bio-text', bio);
    el('sb-name',         full_name);
    const av = ini(full_name);
    el('sb-avatar', av); el('mob-av', av);
    if (!CUR_PROFILE.avatar_url) el('profile-av', av);

    cancelProfileEdit();
    toast('Profile updated!');

  } catch(err) {
    toast(err.message || 'Could not save.', 'err');
  } finally {
    if (btn) { btn.textContent = 'Save Changes'; btn.disabled = false; }
  }
}
window.saveProfileEdit = saveProfileEdit;

/* ── Profile tab switcher ── */
function switchProfTab(tab, btn) {
  document.querySelectorAll('.prof-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.prof-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = $('proftab-' + tab);
  if (panel) panel.classList.add('active');

  if (tab === 'stories')  renderProfileGrid();
  if (tab === 'settings') updateSettingsPanel();
}
window.switchProfTab = switchProfTab;

/* ── Settings panel helpers ── */
function updateSettingsPanel() {
  el('settings-email',       CUR_USER?.email || '—');
  el('settings-story-count', STORIES.length + ' archived');
  if (CUR_USER?.created_at) {
    const joined = new Date(CUR_USER.created_at).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    el('settings-joined', 'Joined ' + joined);
  }
  updateSettingsThemeBtn();
}
window.updateSettingsPanel = updateSettingsPanel;

function updateSettingsThemeBtn() {
  el('theme-toggle-label', darkMode ? 'Dark' : 'Light');
}
window.updateSettingsThemeBtn = updateSettingsThemeBtn;

function openPasswordChange() {
  $('password-change-row').style.display = 'flex';
  $('new-password').focus();
}
window.openPasswordChange = openPasswordChange;

function closePasswordChange() {
  $('password-change-row').style.display = 'none';
  $('new-password').value = '';
}
window.closePasswordChange = closePasswordChange;

async function savePassword() {
  const pw = $('new-password')?.value?.trim();
  if (!pw || pw.length < 8) { toast('Password must be at least 8 characters.', 'err'); return; }

  const btn = document.querySelector('#password-change-row .prof-save-btn');
  if (btn) { btn.textContent = 'Updating…'; btn.disabled = true; }

  try {
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) throw error;
    closePasswordChange();
    toast('Password updated successfully!');
  } catch(err) {
    toast(err.message || 'Could not update password.', 'err');
  } finally {
    if (btn) { btn.textContent = 'Update Password'; btn.disabled = false; }
  }
}
window.savePassword = savePassword;


/* ══════════════════════════════════════════════════════════
   NAV
══════════════════════════════════════════════════════════ */
const NAV_TITLES = { feed:'My Stories', write:'Archive a Memory', requests:'Access Requests', profile:'My Profile', discover:'Discover', admin:'Verification Control' };

function nav(panel, _el) {
  // Deactivate all panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  // Activate target panel
  const target = $('panel-' + panel);
  if (target) target.classList.add('active');

  // Sync sidebar items
  document.querySelectorAll('.sb-item[data-panel]').forEach(i => i.classList.remove('active'));
  const sbItem = document.querySelector(`.sb-item[data-panel="${panel}"]`);
  if (sbItem) sbItem.classList.add('active');

  // Sync mobile nav buttons
  document.querySelectorAll('.mob-nav-btn[data-panel]').forEach(b => b.classList.remove('active'));
  const mobBtn = document.querySelector(`.mob-nav-btn[data-panel="${panel}"]`);
  if (mobBtn) mobBtn.classList.add('active');

  // Update desktop topbar title
  const tt = $('topbar-title');
  if (tt) tt.textContent = NAV_TITLES[panel] || '';

  // Close mobile search bar when navigating
  const msb = $('mob-search-bar');
  if (msb) msb.style.display = 'none';

  // Scroll main back to top
  const main = $('main') || document.querySelector('#main');
  if (main) main.scrollTop = 0;

  // Panel-specific rendering
  if (panel === 'feed')     renderStories(activeFilter);
  if (panel === 'requests') { loadMyRequests().then(() => renderRequests()); }
  if (panel === 'profile')  { updateProfileStats(); renderProfileGrid(); updateSettingsPanel(); }
  if (panel === 'discover') { loadDiscover(); }
}
window.nav = nav;

/* ══════════════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════════════ */
function openModal(id)  { $(id)?.classList.add('open'); }
function closeModal(id) { $(id)?.classList.remove('open'); }
window.openModal=openModal; window.closeModal=closeModal;
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); }));

/* ══════════════════════════════════════════════════════════
   THEME + SIGNOUT
══════════════════════════════════════════════════════════ */
function toggleTheme() {
  darkMode = !darkMode;
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');

  const moonPath = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  const sunPaths = `<circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>`;

  // Update both sidebar icon and mobile header icon
  ['theme-icon-sb', 'theme-icon-mob'].forEach(id => {
    const ic = $(id);
    if (ic) ic.innerHTML = darkMode ? moonPath : sunPaths;
  });

  // Persist preference
  try { localStorage.setItem('croniq-theme', darkMode ? 'dark' : 'light'); } catch(e) {}
}
window.toggleTheme = toggleTheme;

async function signOut() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}
window.signOut = signOut;

function toggleMobSearch() {
  const bar = $('mob-search-bar');
  if (!bar) return;
  const open = bar.style.display !== 'none';
  bar.style.display = open ? 'none' : 'block';
  if (!open) {
    const inp = $('mob-search-input');
    if (inp) { inp.value = ''; inp.focus(); }
    // Sync search state with desktop input
    const di = $('search-input');
    if (di) di.value = '';
    searchStories('');
  }
}
window.toggleMobSearch = toggleMobSearch;

/* ══════════════════════════════════════════════════════════
   SPINNER HELPERS
══════════════════════════════════════════════════════════ */
function spinner(msg='Loading…') {
  return `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text3);font-size:.82rem;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
      style="display:block;margin:0 auto .75rem;animation:doSpin .8s linear infinite;">
      <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
    </svg>${msg}</div>`;
}
function spinnerInline() {
  return `<span style="display:inline-block;width:10px;height:10px;border:1.5px solid var(--text3);border-top-color:var(--gold);border-radius:50%;animation:doSpin .7s linear infinite;vertical-align:middle;margin-right:.35rem;"></span>`;
}

/* ── RESTORE THEME ── */
try {
  const saved = localStorage.getItem('croniq-theme');
  if (saved === 'light') {
    darkMode = false;
    document.documentElement.setAttribute('data-theme', 'light');
    ['theme-icon-sb','theme-icon-mob'].forEach(id => {
      const ic = $(id);
      if (ic) ic.innerHTML = `<circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>`;
    });
  }
} catch(e) {}

/* ── BOOT ── */
boot();

/* ══════════════════════════════════════════════════════
   SCREENSHOT PROTECTION — visibility blur
   Blurs gated story content when tab loses focus
══════════════════════════════════════════════════════ */
document.addEventListener('visibilitychange', () => {
  const protected_els = document.querySelectorAll('.protected-content');
  if (!protected_els.length) return;
  if (document.hidden) {
    protected_els.forEach(el => el.classList.add('blurred'));
  } else {
    // Small delay so returning user sees content restore smoothly
    setTimeout(() => {
      protected_els.forEach(el => el.classList.remove('blurred'));
    }, 400);
  }
});

/* Disable right-click context menu on protected content */
document.addEventListener('contextmenu', e => {
  if (e.target.closest('.protected-content')) {
    e.preventDefault();
    return false;
  }
});
