console.log('[FlowPost BG] service worker started');

const COOKIE_RULE_ID = 5001;
const ELIGIBILITY_URL = 'https://business.facebook.com/creator_monetization/eligibility_widget/';
const PAGES_LIST_URL = 'https://business.facebook.com/pages/list/';

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

const COOKIE_RULE_IDS = [5001, 5002];

const COOKIE_RULES = [
  {
    id: 5001,
    priority: 100,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'set', value: '' }]
    },
    condition: {
      urlFilter: '||business.facebook.com/creator_monetization/eligibility_widget',
      resourceTypes: ['xmlhttprequest']
    }
  },
  {
    id: 5002,
    priority: 100,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'set', value: '' }]
    },
    condition: {
      urlFilter: '||business.facebook.com/pages/list/',
      resourceTypes: ['xmlhttprequest']
    }
  }
];

async function setCookieRule(cookieStr) {
  const rules = COOKIE_RULES.map(r => ({
    ...r,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieStr }]
    }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: COOKIE_RULE_IDS,
    addRules: rules
  });
}

async function clearCookieRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: COOKIE_RULE_IDS });
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

        const t = tokens || cachedTokens;
        const params = new URLSearchParams();
        params.set('surface', 'bizkit_monetization_home');
        if (t?.fb_dtsg) params.set('fb_dtsg', t.fb_dtsg);
        if (t?.lsd) params.set('lsd', t.lsd);
        if (t?.jazoest) params.set('jazoest', t.jazoest);
        page_ids.forEach((id, i) => params.set(`page_ids[${i}]`, id));

        const result = await fbFetch(ELIGIBILITY_URL, params);
        if (result.ok && result.status === 200 && result.data?.payload) return result;
        if (result.ok && result.data?.error === 1357004) {
          const tabs = await chrome.tabs.query({ url: ['*://*.business.facebook.com/*'] });
          const tab = tabs.find(t => t.status === 'complete' && !t.url?.includes('login'));
          if (tab) {
            try {
              const relayed = await chrome.tabs.sendMessage(tab.id, {
                type: 'TOOL_CHECK',
                payload: { page_ids }
              });
              if (relayed && relayed.ok) return relayed;
            } catch {}
          }
        }
        return result;
      }

      case 'STORE_TOKENS':
        cachedTokens = { ...cachedTokens, ...msg.payload };
        return { ok: true };

      case 'PING':
        console.log('[FlowPost BG] PING received, responding');
        return { ok: true, version: '1.0' };

      case 'GET_TOKENS':
        return cachedTokens;

      case 'GET_COOKIES_INFO': {
        const cookies = await getFacebookCookies();
        return {
          c_user: cookies.c_user || null,
          xs: cookies.xs ? '✓ present' : null,
          fr: cookies.fr ? '✓ present' : null,
          has_session: !!(cookies.c_user && cookies.xs),
          all_cookie_names: Object.keys(cookies),
          has_tokens: !!(cachedTokens.fb_dtsg && cachedTokens.lsd),
        };
      }

      case 'SYNC_PAGES': {
        const { pages } = msg.payload || {};
        if (!pages || !pages.length) return { error: 'no_pages' };
        await chrome.storage.local.set({ fp_synced_pages: pages });
        return { ok: true, count: pages.length };
      }

      case 'GET_PAGES': {
        const tabs = await chrome.tabs.query({ url: ['*://*.facebook.com/*', '*://*.business.facebook.com/*'] });
        const sorted = tabs
          .filter(t => t.status === 'complete' && !t.url?.includes('login'))
          .sort((a, b) => (b.url?.includes('business') ? 1 : 0) - (a.url?.includes('business') ? 1 : 0));

        for (const tab of sorted) {
          try {
            const res = await chrome.tabs.sendMessage(tab.id, { type: 'FETCH_PAGES' });
            if (res && res.pages?.length) return res;
          } catch {}
        }

        const fbRes = await fbFetch(PAGES_LIST_URL, new URLSearchParams({ dpr: '1' }));
        if (fbRes.ok && fbRes.data) {
          const list = fbRes.data?.payload?.pages || fbRes.data?.pages || [];
          const pages = list.map(p => ({ id: String(p.id || p.page_id), name: p.name || p.page_name || '' }));
          if (pages.length) return { pages };
        }

        const altEndpoints = [
          'https://business.facebook.com/latest/pages/list/',
          'https://business.facebook.com/ajax/pages/list/',
          'https://www.facebook.com/pages/list/?dpr=1',
          'https://www.facebook.com/ajax/pages/list/',
        ];
        for (const url of altEndpoints) {
          try {
            const r = await fbFetch(url, new URLSearchParams({ dpr: '1' }));
            if (r.ok && r.data) {
              const list = r.data?.payload?.pages || r.data?.pages || [];
              const pages = list.map(p => ({ id: String(p.id || p.page_id), name: p.name || p.page_name || '' }));
              if (pages.length) return { pages };
            }
          } catch {}
        }

        try {
          const allTabs = await chrome.tabs.query({});
          const fpTab = allTabs.find(t =>
            t.status === 'complete' && t.url &&
            (t.url.includes('flowpost-studio.vercel.app') || t.url.includes('localhost:') || t.url.includes('127.0.0.1'))
          );
          if (fpTab) {
            const res = await chrome.tabs.sendMessage(fpTab.id, { type: 'FETCH_PAGES_FROM_APP' });
            if (res && res.pages?.length) return res;
          }
        } catch {}

        return { error: 'no_pages_found', hint: 'Open FlowPost Studio or facebook.com/pages/ and try again' };
      }

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
