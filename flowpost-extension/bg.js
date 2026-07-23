console.log('[FlowPost BG] service worker started');

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

  console.log('[FlowPost BG] fbFetch cookies:', Object.keys(cookies).join(','));

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
    console.log('[FlowPost BG] fbFetch response status:', res.status);
    return { ok: res.ok, status: res.status, data: safeParse(text) };
  } catch (err) {
    console.error('[FlowPost BG] fbFetch error:', err);
    return { error: err.message };
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[FlowPost BG] msg received:', msg.type, msg);

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

        return await fbFetch(ELIGIBILITY_URL, params);
      }

      case 'STORE_TOKENS':
        cachedTokens = { ...cachedTokens, ...msg.payload };
        return { ok: true };

      case 'PING':
        console.log('[FlowPost BG] PING received, responding');
        return { ok: true, version: '1.0' };

      case 'GET_TOKENS':
        return cachedTokens;

      default:
        return { error: 'unknown_type' };
    }
  };

  handle().then((result) => {
    console.log('[FlowPost BG] sending response for', msg.type, result);
    sendResponse(result);
  }).catch((err) => {
    console.error('[FlowPost BG] handler error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});
