'use strict';

/**
 * 회원번호 안내 API
 *
 * 회원번호 풀은 코드에 존재하지 않고 Vercel 환경변수 SPONSOR_POOL_JSON 에서만 읽는다.
 * 응답에는 선택된 1명의 이름/번호와 다음 갱신 시각만 담고, 풀 목록이나 전체 개수는
 * 어떤 경우에도 내보내지 않는다. 브라우저 소스(F12)로는 풀을 볼 수 없다.
 *
 * 환경변수 예) SPONSOR_POOL_JSON=[{"name":"홍*동","abo":"1234567"}]
 */

const RESET_MS = 10 * 60 * 60 * 1000; // 첫 안내 기준 10시간
const COOKIE_LAST = 'last_abo';
const COOKIE_FIRST = 'first_seen_at';

function parsePool(raw) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: 'invalid_json' };
  }
  if (!Array.isArray(data)) return { error: 'invalid_shape' };

  const pool = [];
  for (const item of data) {
    if (!item || typeof item.name !== 'string') continue;
    if (item.abo === undefined || item.abo === null) continue;
    const name = item.name.trim();
    const abo = String(item.abo).trim();
    if (!name || !abo) continue;
    pool.push({ name: name, abo: abo });
  }
  if (!pool.length) return { error: 'empty_pool' };
  return { pool: pool };
}

function readCookies(header) {
  const out = {};
  if (!header) return out;
  String(header)
    .split(';')
    .forEach(function (part) {
      const i = part.indexOf('=');
      if (i < 0) return;
      const key = part.slice(0, i).trim();
      if (!key) return;
      const value = part.slice(i + 1).trim();
      try {
        out[key] = decodeURIComponent(value);
      } catch (e) {
        out[key] = value;
      }
    });
  return out;
}

function buildCookie(name, value, maxAgeSec) {
  return [
    name + '=' + encodeURIComponent(value),
    'Path=/',
    'Max-Age=' + maxAgeSec,
    'HttpOnly',
    'Secure',
    'SameSite=Lax'
  ].join('; ');
}

function sendJson(res, status, body, extraHeaders) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) {
      res.setHeader(k, extraHeaders[k]);
    });
  }
  res.end(payload);
}

module.exports = function handler(req, res) {
  const method = (req && req.method ? req.method : 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, {
      ok: false,
      error: 'method_not_allowed',
      message: '지원하지 않는 요청 방식입니다.'
    });
    return;
  }

  const parsed = parsePool(process.env.SPONSOR_POOL_JSON);

  if (!parsed || parsed.error) {
    const notConfigured = !parsed;
    sendJson(res, 503, {
      ok: false,
      error: notConfigured ? 'pool_not_configured' : 'pool_' + parsed.error,
      message:
        '회원번호 풀이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요. ' +
        '(관리자: Vercel 프로젝트 환경변수 SPONSOR_POOL_JSON 을 확인해 주세요.)'
    });
    return;
  }

  const pool = parsed.pool;
  const now = Date.now();
  const cookies = readCookies(req.headers && req.headers.cookie);

  // 10시간 창: 첫 안내 시각 기준으로 다음 갱신 시각을 정한다.
  let firstSeen = Number(cookies[COOKIE_FIRST]);
  if (!isFinite(firstSeen) || firstSeen <= 0) firstSeen = 0;

  const windowOver = !firstSeen || firstSeen + RESET_MS <= now;
  const windowStart = windowOver ? now : firstSeen;
  const nextResetAt = windowStart + RESET_MS;

  // 직전에 안내한 번호는 같은 창 안에서 다시 보여 주지 않는다.
  const lastAbo = cookies[COOKIE_LAST] || '';
  let candidates = pool;
  if (pool.length > 1 && lastAbo) {
    const filtered = pool.filter(function (item) {
      return item.abo !== lastAbo;
    });
    if (filtered.length) candidates = filtered;
  }

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const maxAge = Math.max(1, Math.round((nextResetAt - now) / 1000));

  res.setHeader('Set-Cookie', [
    buildCookie(COOKIE_LAST, picked.abo, maxAge),
    buildCookie(COOKIE_FIRST, String(windowStart), maxAge)
  ]);

  sendJson(res, 200, {
    ok: true,
    name: picked.name,
    abo: picked.abo,
    next_reset_at: nextResetAt // epoch ms
  });
};
