const DASH_SOURCE = 'FLOWPOST_DASH';
const EXT_SOURCE = 'FLOWPOST_EXT';

let cachedTokens = {};
let lastUrl = location.href;

function extractFacebookTokens() {
  const host = window.location.hostname;
  if (!host.includes('facebook.com')) return null;

  const html = document.documentElement.innerHTML;

  const fb_dtsg = html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1];
  const lsd = html.match(/name="lsd"[^>]*value="([^"]+)"/)?.[1];
  const jazoest = html.match(/name="jazoest"[^>]*value="([^"]+)"/)?.[1];

  const newTokens = { fb_dtsg, lsd, jazoest, host };

  if (fb_dtsg !== cachedTokens.fb_dtsg || lsd !== cachedTokens.lsd) {
    cachedTokens = newTokens;
    chrome.runtime.sendMessage({ type: 'STORE_TOKENS', payload: newTokens });
  }

  return newTokens;
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

  if (Object.keys(cachedTokens).length > 0) {
    chrome.runtime.sendMessage({ type: 'STORE_TOKENS', payload: cachedTokens });
  }
}

function extractPage() {
  if (window.location.hostname.includes('facebook.com')) {
    const tokens = extractFacebookTokens();
    if (tokens) setTimeout(extractCometParams, 500);
  }
}

window.addEventListener('message', (event) => {
  if (event.data?.source !== DASH_SOURCE) return;
  const msg = event.data;

  chrome.runtime.sendMessage(msg, (response) => {
    window.postMessage({
      source: EXT_SOURCE,
      id: msg.id,
      type: msg.type + '_RESULT',
      payload: response
    }, event.origin);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TOOL_CHECK' && window.location.hostname.includes('facebook.com')) {
    handleToolCheckFromTab(msg, sendResponse);
    return true;
  }
  if (msg.type === 'GET_PAGE_TOKENS') {
    sendResponse(cachedTokens);
  }
});

async function handleToolCheckFromTab(msg, sendResponse) {
  const { page_ids } = msg.payload || {};
  if (!page_ids || !page_ids.length) {
    sendResponse({ error: 'no_page_ids' });
    return;
  }

  const params = new URLSearchParams();
  params.set('surface', 'bizkit_monetization_home');
  if (cachedTokens.fb_dtsg) params.set('fb_dtsg', cachedTokens.fb_dtsg);
  if (cachedTokens.lsd) params.set('lsd', cachedTokens.lsd);
  if (cachedTokens.jazoest) params.set('jazoest', cachedTokens.jazoest);
  page_ids.forEach((id, i) => params.set(`page_ids[${i}]`, id));

  try {
    const res = await fetch('https://business.facebook.com/creator_monetization/eligibility_widget/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      credentials: 'include'
    });
    let text = await res.text();
    if (text.startsWith('for (;;);')) text = text.slice(9);
    sendResponse({ ok: res.ok, status: res.status, data: safeParse(text) });
  } catch (err) {
    sendResponse({ error: err.message });
  }
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
