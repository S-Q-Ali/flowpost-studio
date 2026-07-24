const BG = chrome.runtime.sendMessage;

const toolLabels = {
  branded_content_fb_simple: 'Branded Content',
  ad_breaks_open_program: 'In-stream Ads',
  stars: 'Stars',
  reels_ads: 'Ads on Reels',
  fan_funding: 'Fan Funding',
  rights_manager: 'Rights Manager',
  live_ad_breaks: 'Live Ads',
  creator_store: 'Creator Store',
  brand_collab_manager: 'Brand Collab Manager',
  avatars_store: 'Avatars Store',
  unification_program: 'Content Monetization',
};

const criterionLabels = {
  follower_count: 'Followers',
  follower_count_in_stream_ads: 'Followers (Ads)',
  l60_eligible_minutes_viewed: 'Watch Minutes (60d)',
  l60_60s_video_view_count_on_180s_duration: '60s Views (180d)',
  l60_engagement: 'Engagement (60d)',
  l60_engagement_fan_subs: 'Engagement (Subs)',
  weekly_returning_viewer_count: 'Returning Viewers / Week',
  follower_count_fan_subs: 'Followers (Subs)',
  l60_minutes_viewed_fan_subs: 'Watch Minutes (Subs)',
  l60_minutes_viewed_live: 'Watch Minutes (Live)',
  follower_count_live_ads: 'Followers (Live)',
  l60_live_total_eligible_minutes_viewed: 'Live Watch (60d)',
  l30_follower_count_stars: 'Followers (Stars, 30d)',
  follower_count_stars: 'Followers (Stars)',
};

let state = {
  connected: false,
  userId: null,
  tokens: {},
  pages: [],
  results: null,
  checking: false,
};

async function bg(type, payload) {
  try {
    return await BG({ type, payload });
  } catch {
    return null;
  }
}

async function loadState() {
  const ping = await bg('PING', {});
  const cookiesInfo = await bg('GET_COOKIES_INFO', {});
  const tokens = await bg('GET_TOKENS', {});

  state.connected = ping?.ok === true;
  state.userId = cookiesInfo?.c_user || null;
  state.tokens = tokens || {};
  state._cookiesInfo = cookiesInfo || {};

  const stored = await getStoredPages();
  state.pages = stored.length ? stored : [];

  render();
}

function render() {
  renderConnection();
  renderTokens();
  renderPages();
  renderButton();
  showResults();
  renderError();
}

function renderConnection() {
  const badge = document.getElementById('statusBadge');
  const status = document.getElementById('connectionStatus');
  const userRow = document.getElementById('sessionUserRow');
  const cookieRow = document.getElementById('sessionCookieRow');
  const dtsgRow = document.getElementById('sessionTokenRow');
  const lsdRow = document.getElementById('sessionLsdRow');

  if (!state.connected) {
    badge.textContent = 'disconnected';
    badge.className = 'badge disconnected';
    status.innerHTML = '<span class="text-muted">Not detected — open Facebook in a tab</span>';
    document.getElementById('versionBadge').textContent = 'v1.0';
    userRow.style.display = 'none';
    cookieRow.style.display = 'none';
    dtsgRow.style.display = 'none';
    lsdRow.style.display = 'none';
    return;
  }

  badge.textContent = 'connected';
  badge.className = 'badge connected';
  status.innerHTML = '<span style="color:#34d399">✓ Session active</span>';
  document.getElementById('versionBadge').textContent = 'v1.0';

  document.getElementById('sessionUser').textContent = state.userId || 'unknown';
  userRow.style.display = 'flex';

  const ci = state._cookiesInfo || {};
  const cookieParts = [];
  if (ci.c_user) cookieParts.push('c_user ✓');
  if (ci.xs) cookieParts.push('xs ✓');
  if (ci.fr) cookieParts.push('fr ✓');
  const allNames = ci.all_cookie_names || [];
  const otherCount = Math.max(0, allNames.length - (ci.c_user ? 1 : 0) - (ci.xs ? 1 : 0) - (ci.fr ? 1 : 0));
  if (otherCount > 0) cookieParts.push('+' + otherCount + ' more');
  document.getElementById('sessionCookies').textContent = cookieParts.length ? cookieParts.join(', ') : 'none';
  cookieRow.style.display = 'flex';

  const dtsg = state.tokens?.fb_dtsg;
  document.getElementById('sessionDtsg').textContent = dtsg ? '✓ ' + dtsg.slice(0, 12) + '...' : '✗ missing';
  dtsgRow.style.display = 'flex';

  const lsd = state.tokens?.lsd;
  document.getElementById('sessionLsd').textContent = lsd ? '✓ ' + lsd.slice(0, 8) + '...' : '✗ missing';
  lsdRow.style.display = 'flex';
}

function renderTokens() {
  const sec = document.getElementById('tokenSection');
  const dtsg = state.tokens?.fb_dtsg;
  const lsd = state.tokens?.lsd;

  sec.style.display = 'block';
  document.getElementById('tokenDtsg').textContent = 'DTSG: ' + (dtsg ? '✓ ready' : '✗ need FB tab');
  document.getElementById('tokenLsd').textContent = 'LSD: ' + (lsd ? '✓ ready' : '✗ need FB tab');

  const msg = document.getElementById('tokenMissingMsg');
  if (!dtsg || !lsd) {
    if (!msg) {
      const msgEl = document.createElement('div');
      msgEl.id = 'tokenMissingMsg';
      msgEl.className = 'text-xs';
      msgEl.style.cssText = 'color:#fbbf24;margin-top:4px;';
      msgEl.textContent = 'Open facebook.com in a tab then refresh this popup (↻)';
      sec.appendChild(msgEl);
    }
  } else if (msg) {
    msg.remove();
  }
}

function renderPages() {
  const list = document.getElementById('pagesList');

  if (state.pages.length === 0) {
    list.innerHTML = `
      <div class="text-xs text-muted mb-1">No pages loaded.</div>
      <input id="pageIdInput" class="input" placeholder="Paste page IDs (comma separated)" />
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button id="savePageIds" class="btn btn-secondary" style="width:auto;padding:5px 12px;font-size:11px;">Save</button>
        <button id="fetchPagesBtn" class="btn btn-primary" style="width:auto;padding:5px 12px;font-size:11px;">Fetch from Facebook</button>
      </div>
    `;
    setTimeout(() => {
      const input = document.getElementById('pageIdInput');
      const save = document.getElementById('savePageIds');
      const fetchBtn = document.getElementById('fetchPagesBtn');
      if (input && save) {
        save.onclick = async () => {
          const ids = input.value.split(',').map(s => s.trim()).filter(Boolean);
          state.pages = ids.map(id => ({ id, name: '' }));
          await storePages(state.pages);
          renderPages();
        };
      }
      if (fetchBtn) {
        fetchBtn.onclick = fetchPages;
      }
    }, 0);
    return;
  }

  list.innerHTML = state.pages.map((p, i) => {
    const name = p.name || `Page ${i + 1}`;
    return `<div class="page-item selected">
      <div class="checkbox"></div>
      <span class="page-name">${escHtml(name)}</span>
      <span class="page-id">${p.id}</span>
    </div>`;
  }).join('') +
  `<div style="display:flex;gap:6px;margin-top:6px;">
    <button id="clearPageIds" style="background:none;border:none;color:#6b7280;font-size:11px;cursor:pointer;padding:4px 0;">× Clear</button>
    <button id="fetchPagesBtn" class="btn btn-primary" style="width:auto;padding:3px 10px;font-size:10px;margin-left:auto;">Fetch from Facebook</button>
  </div>`;

  setTimeout(() => {
    const clear = document.getElementById('clearPageIds');
    if (clear) clear.onclick = async () => {
      state.pages = [];
      await storePages([]);
      renderPages();
    };
    const fetchBtn = document.getElementById('fetchPagesBtn');
    if (fetchBtn) fetchBtn.onclick = fetchPages;
  }, 0);
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderButton() {
  const btn = document.getElementById('runBtn');
  const hasTokens = state.tokens?.fb_dtsg && state.tokens?.lsd;
  const canRun = state.connected && state.pages.length > 0 && !state.checking && hasTokens;

  btn.disabled = !canRun;

  if (state.checking) {
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Checking...';
  } else {
    btn.innerHTML = '<span>▶</span> Run Tool Check';
  }

  btn.onclick = runToolCheck;
}

async function runToolCheck() {
  if (state.checking) return;
  state.checking = true;
  state.results = null;
  renderError();
  hideResults();
  renderButton();

  const res = await bg('TOOL_CHECK', {
    page_ids: state.pages.map(p => p.id),
    tokens: state.tokens
  });

  if (!res) {
    renderError('No response from background. Make sure cookies and tokens are available.');
  } else if (res.error) {
    renderError(res.error);
  } else if (res.ok && res.data?.payload) {
    state.results = res.data.payload;
    showResults();
  } else {
    const raw = typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 1200) : String(res.data || 'empty');
    renderError('Status: ' + (res.status || 'unknown') + ' — payload is empty. Raw response (first 1200 chars):<br><span style="font-size:10px;font-family:monospace;word-break:break-all;">' + raw + '</span>');
  }

  state.checking = false;
  renderButton();
}

function showResults() {
  const sec = document.getElementById('resultsSection');
  const div = document.getElementById('resultsDivider');
  const content = document.getElementById('resultsContent');

  sec.style.display = 'block';
  div.style.display = 'block';

  if (!state.results || state.results.length === 0) {
    content.innerHTML = '<div class="empty-state">No results returned</div>';
    return;
  }

  content.innerHTML = state.results.map((page, pi) => {
    const tools = page.monetizationToolsEligibilityStatus || {};
    const criteria = page.eligibilityCriteriaProgress || {};
    const toolsHtml = Object.entries(tools).map(([tool, status]) =>
      `<div class="tool-row">
        <span class="status-icon">${status === 'eligible' ? '✅' : '❌'}</span>
        <span class="tool-name">${toolLabels[tool] || tool}</span>
        <span class="tool-status ${status === 'eligible' ? 'eligible' : 'ineligible'}">${status}</span>
      </div>`
    ).join('');

    const critKeys = Object.entries(criteria).filter(([, c]) => c.goal != null).slice(0, 6);
    const critHtml = critKeys.length ? critKeys.map(([key, c]) => {
      const pct = c.goal ? Math.min(100, Math.round(((c.count || 0) / c.goal) * 100)) : 0;
      return `<div class="criterion-row">
        <div class="c-label">
          <span>${criterionLabels[key] || key}</span>
          <span>${c.count?.toLocaleString() || 0} / ${c.goal?.toLocaleString() || '?'}</span>
        </div>
        <div class="progress-bar">
          <div class="fill ${c.status === 'pass' ? 'pass' : 'fail'}" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('') : '';

    const bucket = page.eligibilityBucket || 'unknown';

    return `<div class="page-results">
      <div class="page-title">
        ${page.basicInfo?.name || 'Page ' + (pi + 1)}
        <span style="font-size:11px;font-weight:normal;color:${bucket === 'eligible' ? '#34d399' : '#6b7280'};margin-left:8px">${bucket}</span>
      </div>
      <div class="tool-result">${toolsHtml}</div>
      ${critHtml ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #1f1f1f">${critHtml}</div>` : ''}
      ${pi < state.results.length - 1 ? '<hr class="divider">' : ''}
    </div>`;
  }).join('');
}

function hideResults() {
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('resultsDivider').style.display = 'none';
}

function renderError(msg) {
  const sec = document.getElementById('errorSection');
  if (msg) {
    sec.style.display = 'block';
    sec.innerHTML = `<div class="error-box">${msg}</div>`;
  } else {
    sec.style.display = 'none';
  }
}

async function fetchPages() {
  const btn = document.getElementById('fetchPagesBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching...'; }

  const res = await bg('GET_PAGES', {});

  if (btn) { btn.disabled = false; btn.textContent = 'Fetch from Facebook'; }

  if (!res) {
    renderError('No response from background.');
    return;
  }
  if (res.error) {
    renderError(res.hint || res.error);
    return;
  }
  if (!res.pages || !res.pages.length) {
    renderError('No pages found. Open business.facebook.com/pages/ and try again.');
    return;
  }

  state.pages = res.pages;
  await storePages(state.pages);
  renderError();
  renderPages();
}

async function getStoredPages() {
  try {
    const result = await chrome.storage.local.get(['fp_pages', 'fp_page_ids', 'fp_synced_pages']);
    if (result.fp_pages && result.fp_pages.length) return result.fp_pages;
    if (result.fp_synced_pages && result.fp_synced_pages.length) {
      const mapped = result.fp_synced_pages.map(p => ({ id: p.id, name: p.name || '' }));
      await chrome.storage.local.set({ fp_pages: mapped, fp_synced_pages: undefined });
      return mapped;
    }
    if (result.fp_page_ids) {
      const migrated = result.fp_page_ids.map(id => ({ id, name: '' }));
      await chrome.storage.local.set({ fp_pages: migrated, fp_page_ids: undefined });
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

async function storePages(pages) {
  try {
    await chrome.storage.local.set({ fp_pages: pages });
  } catch {}
}

document.getElementById('refreshBtn').onclick = loadState;
document.addEventListener('DOMContentLoaded', loadState);
