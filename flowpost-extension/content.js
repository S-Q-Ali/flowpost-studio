console.log('[FlowPost] content script loaded on', window.location.hostname);

const DASH_SOURCE = 'FLOWPOST_DASH';
const EXT_SOURCE = 'FLOWPOST_EXT';

let cachedTokens = {};
let lastUrl = location.href;

function extractFacebookTokens() {
  const host = window.location.hostname;
  if (!host.includes('facebook.com')) return null;

  const tokens = { host };

  const session = extractSessionToken();
  if (session) tokens.session_token = session;

  tokens.fb_dtsg = extractToken('fb_dtsg') || session;
  tokens.lsd = extractToken('lsd') || session;
  tokens.jazoest = extractToken('jazoest');

  const changed = tokens.fb_dtsg !== cachedTokens.fb_dtsg || tokens.lsd !== cachedTokens.lsd
    || tokens.session_token !== cachedTokens.session_token;

  if (changed) {
    cachedTokens = tokens;
    console.log('[FlowPost] tokens extracted:', { fb_dtsg: !!tokens.fb_dtsg, lsd: !!tokens.lsd, session: !!tokens.session_token });
    chrome.runtime.sendMessage({ type: 'STORE_TOKENS', payload: tokens }).catch(() => {});
  }

  return tokens;
}

function extractToken(name) {
  const allScripts = document.querySelectorAll('script');

  if (name === 'fb_dtsg') {
    for (const s of allScripts) {
      const t = s.textContent;
      const dtsgPatterns = [
        /"DTSGInitialData"[^{]*\{"token"\s*:\s*"([^"]+)"\s*\}/,
        /\["DTSGInitialData",\[\],\{"token":"([^"]+)"\}/,
        /"dtsg"\s*:\s*\{"token"\s*:\s*"([^"]+)"\}/,
        /\{"token":"([^"]+)","async_get_token"/,
        /window\.__fb_dtsg\s*=\s*"([^"]+)"/,
        /"fb_dtsg"\s*:\s*"([^"]+)"/,
        /DTSG[\s\S]{0,200}?"token"\s*:\s*"([^"]+)"/,
      ];
      for (const pat of dtsgPatterns) {
        const m = t.match(pat);
        if (m) return m[1];
      }
    }

    const globalFb = window.__fb_dtsg || window.DTSGInitialData || window.DTSG || window.__DTSG;
    if (globalFb) return globalFb;

    if (window.__comet_initialState) {
      try {
        const parsed = typeof __comet_initialState === 'string' ? JSON.parse(__comet_initialState) : __comet_initialState;
        if (parsed.fb_dtsg) return parsed.fb_dtsg;
      } catch {}
    }

    const dom = document.documentElement.innerHTML;
    const domM = dom.match(/name="fb_dtsg"[^>]*value="([^"]+)"/);
    if (domM) return domM[1];

    const sessionVal = localStorage.getItem('Session');
    if (sessionVal && /^[a-z0-9]+:\d+$/.test(sessionVal)) return sessionVal;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.toLowerCase().includes('dtsg')) {
        const val = localStorage.getItem(key);
        if (val && !val.startsWith('{') && val.length > 5) return val;
      }
    }

    return null;
  }

  if (name === 'lsd') {
    for (const s of allScripts) {
      const t = s.textContent;
      const lsdPatterns = [
        /\["LSD",\[\],\{"token":"([^"]+)"\}/,
        /"LSD"[^}]{0,200}?"token"\s*:\s*"([^"]+)"/,
        /window\.__LSD\s*=\s*"([^"]+)"/,
        /window\.LSD\s*=\s*"([^"]+)"/,
        /"lsd"\s*:\s*"([^"]+)"/,
        /"LSD"\s*:\s*"([^"]+)"/,
      ];
      for (const pat of lsdPatterns) {
        const m = t.match(pat);
        if (m) return m[1];
      }
    }

    const globalLsd = window.__LSD || window.LSD;
    if (globalLsd) return globalLsd;

    if (window.__comet_initialState) {
      try {
        const parsed = typeof __comet_initialState === 'string' ? JSON.parse(__comet_initialState) : __comet_initialState;
        if (parsed.lsd) return parsed.lsd;
      } catch {}
    }

    const dom = document.documentElement.innerHTML;
    const domM = dom.match(/name="lsd"[^>]*value="([^"]+)"/);
    if (domM) return domM[1];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.toLowerCase().includes('lsd')) {
        const val = localStorage.getItem(key);
        if (val && !val.startsWith('{') && val.length > 5) return val;
      }
    }

    const sessionVal = localStorage.getItem('Session');
    if (sessionVal && /^[a-z0-9]+:\d+$/.test(sessionVal)) return sessionVal;

    return null;
  }

  if (name === 'jazoest') {
    const dom = document.documentElement.innerHTML;
    const m = dom.match(/name="jazoest"[^>]*value="([^"]+)"/);
    if (m) return m[1];
    return null;
  }

  return null;
}

function extractSessionToken() {
  const val = localStorage.getItem('Session');
  if (val && /^[a-z0-9]+:\d+$/.test(val)) return val;
  return null;
}

let pollCount = 0;
const MAX_POLL = 15;
function pollTokens() {
  if (pollCount >= MAX_POLL) return;
  pollCount++;
  const tokens = extractFacebookTokens();
  if (tokens && tokens.fb_dtsg && tokens.lsd) {
    console.log('[FlowPost] tokens resolved after poll', pollCount);
    return;
  }
  setTimeout(pollTokens, 1000);
}

function extractCometParams() {
  const scripts = document.querySelectorAll('script:not([src])');
  const globals = ['__dyn', '__csr', '__hsdp', '__hblp', '__sjsp', '__hsi', '__hs', '__comet_req', '__spin_r', '__spin_b', '__spin_t', '__jssesw', '__crn'];

  for (const s of scripts) {
    const text = s.textContent || '';
    for (const g of globals) {
      if (cachedTokens[g]) continue;
      const m = text.match(new RegExp(`(?:window\\.)?${g}\\s*=\\s*"([^"]+)"`));
      if (m) cachedTokens[g] = m[1];
    }
  }

  if (Object.keys(cachedTokens).length > 3) {
    chrome.runtime.sendMessage({ type: 'STORE_TOKENS', payload: cachedTokens }).catch(() => {});
  }
}

function extractPage() {
  if (window.location.hostname.includes('facebook.com')) {
    const tokens = extractFacebookTokens();
    if (tokens) {
      setTimeout(extractCometParams, 500);
      if (!tokens.fb_dtsg || !tokens.lsd) {
        pollCount = 0;
        setTimeout(pollTokens, 2000);
      }
    }
  }
}

window.addEventListener('message', (event) => {
  if (event.data?.source !== DASH_SOURCE) return;
  console.log('[FlowPost] msg from page:', event.data.type, event.data.id);

  const msg = event.data;
  try {
    chrome.runtime.sendMessage(msg, (response) => {
      const hasError = chrome.runtime.lastError;
      if (hasError) {
        console.warn('[FlowPost] bg error:', hasError.message);
        window.postMessage({ source: EXT_SOURCE, id: msg.id, type: msg.type + '_RESULT', payload: null }, event.origin);
        return;
      }
      window.postMessage({
        source: EXT_SOURCE,
        id: msg.id,
        type: msg.type + '_RESULT',
        payload: response
      }, event.origin);
    });
  } catch (err) {
    console.warn('[FlowPost] sendMessage threw:', err);
    window.postMessage({ source: EXT_SOURCE, id: msg.id, type: msg.type + '_RESULT', payload: null }, event.origin);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TOOL_CHECK' && window.location.hostname.includes('facebook.com')) {
    handleToolCheckFromTab(msg, sendResponse);
    return true;
  }
  if (msg.type === 'GET_PAGE_TOKENS') {
    sendResponse(cachedTokens);
  }
  if (msg.type === 'FETCH_PAGES') {
    handleFetchPages(sendResponse);
    return true;
  }
  if (msg.type === 'FETCH_PAGES_FROM_APP') {
    handleFetchPagesFromApp(sendResponse);
    return true;
  }
});

async function handleToolCheckFromTab(msg, sendResponse) {
  const { page_ids } = msg.payload || {};
  if (!page_ids || !page_ids.length) { sendResponse({ error: 'no_page_ids' }); return; }

  const dtsg = cachedTokens.fb_dtsg || cachedTokens.session_token;
  const lsd = cachedTokens.lsd || cachedTokens.session_token;
  const jazoest = cachedTokens.jazoest;

  if (!dtsg) { sendResponse({ error: 'no_dtsg_token', hint: 'Open facebook.com and wait for tokens to load' }); return; }

  const cUser = (document.cookie.match(/\bc_user=(\d+)/) || [])[1] || '';

  const params = new URLSearchParams();
  params.set('surface', 'bizkit_monetization_home');
  if (dtsg) params.set('fb_dtsg', dtsg);
  if (lsd) params.set('lsd', lsd);
  if (jazoest) params.set('jazoest', jazoest);
  page_ids.forEach((id, i) => params.set(`page_ids[${i}]`, id));
  params.set('__user', cUser);
  params.set('__a', '1');
  params.set('__req', String(Math.floor(Math.random() * 9) + 1));

  try {
    const res = await fetch('https://business.facebook.com/creator_monetization/eligibility_widget/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      credentials: 'include'
    });
    let text = await res.text();
    console.log('[FlowPost] tool check fetch:', res.status, 'body length:', text.length, 'preview:', text.slice(0, 100));
    if (text.startsWith('for (;;);')) text = text.slice(9);
    sendResponse({ ok: res.ok, status: res.status, data: safeParse(text) });
  } catch (err) {
    console.log('[FlowPost] tool check fetch error:', err.message);
    sendResponse({ error: err.message });
  }
}

async function handleFetchPages(sendResponse) {
  const host = window.location.hostname;

  try {
    const pages = await tryFetchPagesAPI(host);
    if (pages.length) { sendResponse({ pages }); return; }

    const domPages = extractPagesFromDOM();
    if (domPages.length) { sendResponse({ pages: domPages }); return; }

    sendResponse({ error: 'no_pages_found', hint: 'Open facebook.com/pages/?category=your_pages or FlowPost Studio and try again' });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

function handleFetchPagesFromApp(sendResponse) {
  const bridgeId = 'fp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  const handler = (event) => {
    if (event.data?.source === DASH_SOURCE && event.data?.id === bridgeId && event.data?.type === 'QUERY_PAGES_RESULT') {
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      const pages = event.data.payload?.pages || [];
      sendResponse(pages.length ? { pages } : { error: 'no_pages_found', hint: 'No Facebook pages found in your FlowPost account.' });
    }
  };
  window.addEventListener('message', handler);

  window.postMessage({ source: EXT_SOURCE, type: 'QUERY_PAGES', id: bridgeId }, window.location.origin);

  const timer = setTimeout(() => {
    window.removeEventListener('message', handler);
    sendResponse({ error: 'no_pages_found', hint: 'FlowPost Studio did not respond. Make sure you are logged in.' });
  }, 5000);
}

async function tryFetchPagesAPI(host) {
  const isBiz = host.includes('business.facebook.com');
  const isFb = host.includes('facebook.com');
  if (!isBiz && !isFb) return [];
  const base = isBiz ? 'https://business.facebook.com' : 'https://www.facebook.com';
  const endpoints = [
    base + '/pages/list/?dpr=1',
    base + '/ajax/pages/list/',
    base + '/api/graphql/'
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      let text = await res.text();
      if (text.startsWith('for (;;);')) text = text.slice(9);
      const data = safeParse(text);
      if (data?.payload || data?.pages) {
        const pages = extractPagesFromResponse(data);
        if (pages.length) return pages;
      }
    } catch {}
  }
  return [];
}

function extractPagesFromResponse(data) {
  try {
    const list = data?.payload?.pages || data?.pages || [];
    return list.map(p => ({ id: String(p.id || p.page_id), name: p.name || p.page_name || '' }));
  } catch {
    return [];
  }
}

function extractPagesFromDOM() {
  const pages = [];
  const seen = new Set();
  const host = window.location.hostname;

  if (host.includes('business.facebook.com')) {
    const sidebarLinks = document.querySelectorAll('[role="navigation"] a[href*="asset_id="], aside a[href*="asset_id="], a[href*="latest/"][href*="asset_id="]');
    for (const a of sidebarLinks) {
      const m = a.href.match(/asset_id=(\d+)/);
      const text = a.textContent.trim();
      if (m && text) {
        const id = m[1];
        if (!seen.has(id)) { seen.add(id); pages.push({ id, name: text }); }
      }
    }
    const currentId = window.location.href.match(/asset_id=(\d+)/);
    if (currentId && !seen.has(currentId[1])) {
      const navEl = document.querySelector('[role="navigation"] [role="button"], [role="navigation"] button, .x1rg5ohu .x1n2onr6');
      const name = navEl ? navEl.textContent.trim() : document.title.replace(/\(.*?\)\s*/g, '').trim() || 'Current Page';
      seen.add(currentId[1]);
      pages.push({ id: currentId[1], name });
    }
  }

  if (host.includes('facebook.com')) {
    const fbPageLinks = document.querySelectorAll(
      'a[href*="/pages/"][role="link], a[href*=".php?id="], [data-pageid], a[href*="?page_id="], [data-page-id], ' +
      '[data-pagelet="PageCard"] a[role="link"], [role="list"] a[role="link"][href*="facebook.com"]'
    );
    for (const el of fbPageLinks) {
      const id = el.getAttribute('data-pageid') || el.getAttribute('data-page-id') ||
        (el.href && (el.href.match(/[?&]page_id=(\d+)/) || el.href.match(/[?&]id=(\d+)/) || [])[1]);
      const text = el.textContent.trim();
      if (id && text && !seen.has(id)) { seen.add(id); pages.push({ id, name: text }); }
    }
  }

  if (host.includes('facebook.com')) {
    const urlPageId = window.location.href.match(/[?&]id=(\d+)/) || window.location.href.match(/\/pages\/(\d+)/);
    if (urlPageId && !seen.has(urlPageId[1])) {
      const nameEl = document.querySelector('[data-pagelet="ProfileHeader"] h1, [data-page-header] h1, h1, [role="heading"], [data-pagelet="ProfileHeader"] span[dir="auto"]');
      const rawTitle = document.title.replace(/[|].*$/, '').replace(/\s*Facebook\s*/i, '').trim();
      const name = nameEl ? nameEl.textContent.trim() : rawTitle || 'Current Page';
      seen.add(urlPageId[1]);
      pages.push({ id: urlPageId[1], name });
    }
  }

  const anchors = document.querySelectorAll('a[href*="/pages/"]');
  for (const a of anchors) {
    const m = a.href.match(/\/pages\/(\d+)/);
    if (m && a.textContent.trim()) {
      const id = m[1];
      if (!seen.has(id)) {
        seen.add(id);
        pages.push({ id, name: a.textContent.trim() });
      }
    }
  }

  return pages;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

if (document.readyState === 'loading') {
  document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') extractPage();
  });
} else {
  extractPage();
}

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(extractPage, 1500);
  }
}).observe(document, { subtree: true, childList: true });

window.addEventListener('storage', (e) => {
  if (window.location.hostname.includes('facebook.com')) {
    setTimeout(extractFacebookTokens, 100);
  }
});

const origOpen = XMLHttpRequest.prototype.open;
const origSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
  this._fpUrl = typeof url === 'string' ? url : (url ? url.toString() : '');
  this._fpMethod = method;
  return origOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function(body) {
  const url = this._fpUrl || '';
  if (body && typeof body === 'string' && body.includes('fb_dtsg')) {
    try {
      const params = new URLSearchParams(body);
      const fb_dtsg = params.get('fb_dtsg');
      const lsd = params.get('lsd');
      if (fb_dtsg && fb_dtsg !== cachedTokens.fb_dtsg) {
        console.log('[FlowPost] captured fb_dtsg from XHR:', fb_dtsg, (lsd ? 'with lsd' : 'no lsd'));
        cachedTokens.fb_dtsg = fb_dtsg;
        if (lsd) cachedTokens.lsd = lsd;
        chrome.runtime.sendMessage({ type: 'STORE_TOKENS', payload: { fb_dtsg, lsd, host: window.location.hostname, source: 'xhr_hook' } }).catch(() => {});
      }
    } catch {}
  }
  return origSend.apply(this, arguments);
};
