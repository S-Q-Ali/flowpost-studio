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
  pageIds: [],
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

  const stored = await getStoredPageIds();
  state.pageIds = stored.length ? stored : [];

  render();
}

function render() {
  renderConnection();
  renderTokens();
  renderPages();
  renderButton();
  renderResults();
  renderError();
}

function renderConnection() {
  const badge = document.getElementById('statusBadge');
  const status = document.getElementById('connectionStatus');

  if (!state.connected) {
    badge.textContent = 'disconnected';
    badge.className = 'badge disconnected';
    status.innerHTML = '<span class="text-muted">Not detected — open Facebook in a tab</span>';
    document.getElementById('versionBadge').textContent = 'v1.0';
    return;
  }

  badge.textContent = 'connected';
  badge.className = 'badge connected';
  status.innerHTML = `<span style="color:#34d399">${state.userId ? 'User: ' + state.userId : 'Connected'}</span>`;
  document.getElementById('versionBadge').textContent = 'v1.0';
}

function renderTokens() {
  const sec = document.getElementById('tokenSection');
  const hasTokens = state.tokens?.fb_dtsg || state.tokens?.lsd;

  if (!hasTokens) {
    sec.style.display = 'none';
    return;
  }

  sec.style.display = 'block';
  document.getElementById('tokenDtsg').textContent = 'DTSG: ' + (state.tokens.fb_dtsg ? '✓' : '—');
  document.getElementById('tokenLsd').textContent = 'LSD: ' + (state.tokens.lsd ? '✓' : '—');
}

function renderPages() {
  const list = document.getElementById('pagesList');

  if (state.pageIds.length === 0) {
    list.innerHTML = `
      <div class="text-xs text-muted mb-1">No pages loaded. Paste page IDs below or open Facebook.</div>
      <input id="pageIdInput" class="input" placeholder="Paste page IDs (comma separated)" />
      <button id="savePageIds" class="btn btn-secondary mt-2" style="width:auto;padding:5px 12px;font-size:11px;">Save</button>
    `;
    setTimeout(() => {
      const input = document.getElementById('pageIdInput');
      const save = document.getElementById('savePageIds');
      if (input && save) {
        input.value = state.pageIds.join(', ');
        save.onclick = async () => {
          const ids = input.value.split(',').map(s => s.trim()).filter(Boolean);
          state.pageIds = ids;
          await chrome.storage.local.set({ fp_page_ids: ids });
          renderPages();
        };
      }
    }, 0);
    return;
  }

  list.innerHTML = state.pageIds.map((id, i) =>
    `<div class="page-item selected">
      <div class="checkbox"></div>
      <span class="page-name">Page ${i + 1}</span>
      <span class="page-id">${id}</span>
    </div>`
  ).join('') +
  `<button id="clearPageIds" style="background:none;border:none;color:#6b7280;font-size:11px;cursor:pointer;padding:4px 0;">× Clear</button>`;

  setTimeout(() => {
    const clear = document.getElementById('clearPageIds');
    if (clear) clear.onclick = async () => {
      state.pageIds = [];
      await chrome.storage.local.set({ fp_page_ids: [] });
      renderPages();
    };
  }, 0);
}

function renderButton() {
  const btn = document.getElementById('runBtn');
  const canRun = state.connected && state.pageIds.length > 0 && !state.checking;

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
  hideError();
  hideResults();
  renderButton();

  const res = await bg('TOOL_CHECK', {
    page_ids: state.pageIds,
    tokens: state.tokens
  });

  if (!res) {
    showError('No response from background. Make sure cookies and tokens are available.');
  } else if (res.error) {
    showError(res.error);
  } else if (res.ok && res.data?.payload) {
    state.results = res.data.payload;
    showResults();
  } else {
    showError('Unexpected response. Status: ' + (res.status || 'unknown') + '. ' + JSON.stringify(res.data));
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

function showError(msg) {
  const sec = document.getElementById('errorSection');
  sec.style.display = 'block';
  sec.innerHTML = `<div class="error-box">${msg}</div>`;
}

function hideError() {
  document.getElementById('errorSection').style.display = 'none';
}

async function getStoredPageIds() {
  try {
    const result = await chrome.storage.local.get('fp_page_ids');
    return result.fp_page_ids || [];
  } catch {
    return [];
  }
}

document.getElementById('refreshBtn').onclick = loadState;
document.addEventListener('DOMContentLoaded', loadState);
