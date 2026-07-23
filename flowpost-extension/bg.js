const EXT_SOURCE = 'FLOWPOST_EXT';
const COOKIE_RULE_ID = 5001;
const ELIGIBILITY_URL = 'https://business.facebook.com/creator_monetization/eligibility_widget/';

let cachedCookies = {};
let cachedTokens = {};

async function getFacebookCookies() {
  const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
  cachedCookies = {};
  for (const c of cookies) {
    cachedCookies[c.name] = c.value;
  }
  return cachedCookies;
}

function fmtCookie(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function setCookieRule(cookieStr) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [COOKIE_RULE_ID],
    addRules: [{
      id: COOKIE_RULE_ID,
      priority: 100,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieStr }]
      },
      condition: {
        urlFilter: '||business.facebook.com/creator_monetization/eligibility_widget',
        resourceTypes: ['xmlhttprequest']
      }
    }]
  });
}

async function clearCookieRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [COOKIE_RULE_ID] });
}

async function fbFetch(path, bodyParams) {
  const cookies = await getFacebookCookies();
  const cookieStr = fmtCookie(cookies);

  const ts = Date.now();
  const nonce = Math.random().toString(36).slice(2, 10);
  const url = path + (path.includes('?') ? '&' : '?') + `_extr=${ts}_${nonce}`;

  bodyParams.set('__user', cookies.c_user || '');
  bodyParams.set('__a', '1');
  bodyParams.set('__req', generateReqId());

  await setCookieRule(cookieStr);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        'sec-fetch-site': 'same-origin'
      },
      body: bodyParams.toString(),
      credentials: 'omit'
    });

    let text = await res.text();
    if (text.startsWith('for (;;);')) text = text.slice(9);
    return { ok: res.ok, status: res.status, data: safeParse(text) };
  } finally {
    await clearCookieRule();
  }
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function generateReqId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = String(Math.floor(Math.random() * 9) + 1);
  for (let i = 0; i < 2; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function findFacebookTab() {
  const tabs = await chrome.tabs.query({
    url: ['*://*.facebook.com/*', '*://*.business.facebook.com/*'],
    status: 'complete'
  });
  return tabs.length > 0 ? tabs[0] : null;
}

async function forwardToTab(message) {
  const tab = await findFacebookTab();
  if (!tab) return { error: 'no_facebook_tab' };
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, resolve);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case 'TOOL_CHECK': {
        const { page_ids, tokens } = msg.payload || {};
        if (!page_ids || !page_ids.length) return { error: 'no_page_ids' };

        const params = new URLSearchParams();
        params.set('surface', 'bizkit_monetization_home');
        if (tokens?.fb_dtsg) params.set('fb_dtsg', tokens.fb_dtsg);
        if (tokens?.lsd) params.set('lsd', tokens.lsd);
        if (tokens?.jazoest) params.set('jazoest', tokens.jazoest);
        page_ids.forEach((id, i) => params.set(`page_ids[${i}]`, id));

        const result = await fbFetch(ELIGIBILITY_URL, params);
        return result;
      }

      case 'GET_TOKENS':
        return cachedTokens;

      case 'STORE_TOKENS':
        cachedTokens = { ...cachedTokens, ...msg.payload };
        return { ok: true };

      case 'PING':
        return { ok: true, version: '1.0' };

      default:
        return { error: 'unknown_type' };
    }
  };

  handle().then(sendResponse);
  return true;
});
