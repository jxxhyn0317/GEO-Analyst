// Holds the Gemini key server-side and passes requests through, so the browser never sees it.
// The app used to ask every visitor for their own key; with a key in the environment it just
// works, and the key stays where only the deployment can read it.
//
// The body and the response are relayed untouched, because judge.js already knows how to speak
// to Google's Interactions API and how to read its errors. This only adds the credential.

const HOST = 'https://generativelanguage.googleapis.com';
const TIMEOUT_MS = 55000; // under Hobby's 60s ceiling, so we answer before Vercel cuts us off
const MAX_BODY = 2 * 1024 * 1024;

// Only this app may spend the key. The header is trivially forged, so this is a courtesy fence
// against casual reuse, not a security boundary: the real limits are Google's own quotas.
const ALLOWED = [/^https?:\/\/localhost(:\d+)?$/, /^https:\/\/([a-z0-9-]+\.)*geobench\.io$/, /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/];

const send = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const parts = [];
    req.on('data', c => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY || '';
  const url = new URL(req.url, 'http://x');

  // The app asks this on boot to decide whether it needs to prompt for a key at all.
  if (url.searchParams.get('health') === '1') return send(res, 200, { ok: !!key, maxSeconds: 55 });

  const origin = req.headers.origin || '';
  if (origin && !ALLOWED.some(re => re.test(origin))) return send(res, 403, { error: { code: 403, message: 'This deployment does not serve that origin.', status: 'PERMISSION_DENIED' } });
  if (!key) return send(res, 503, { error: { code: 503, message: 'No API key is configured on the server.', status: 'FAILED_PRECONDITION' } });

  // Three shapes, matching what judge.js asks for: the model list, the Interactions call, and
  // the older generateContent surface it falls back to.
  const legacy = url.searchParams.get('legacy');
  let target, method;
  if (url.searchParams.get('models') === '1') { target = `${HOST}/v1beta/models?pageSize=1000`; method = 'GET'; }
  else if (legacy) { target = `${HOST}/v1beta/models/${encodeURIComponent(legacy)}:generateContent`; method = 'POST'; }
  else { target = `${HOST}/v1beta/interactions`; method = 'POST'; }

  if (method === 'POST' && req.method !== 'POST') return send(res, 405, { error: { code: 405, message: 'POST only.', status: 'INVALID_ARGUMENT' } });

  let body;
  if (method === 'POST') {
    try { body = await readBody(req); } catch { return send(res, 413, { error: { code: 413, message: 'Request too large.', status: 'INVALID_ARGUMENT' } }); }
  }

  const ctl = new AbortController();
  const cut = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const up = await fetch(target, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
      signal: ctl.signal
    });
    const text = await up.text();
    res.statusCode = up.status;
    res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  } catch (e) {
    // A video the model watches for minutes outlives this function on the Hobby plan, so say
    // that plainly rather than reporting it as a Google failure.
    const cutOff = e.name === 'AbortError';
    send(res, cutOff ? 504 : 502, {
      error: {
        code: cutOff ? 504 : 502,
        message: cutOff
          ? 'The model took longer than this deployment is allowed to wait (55 seconds).'
          : `Could not reach Google: ${e.message}`,
        status: cutOff ? 'DEADLINE_EXCEEDED' : 'UNAVAILABLE'
      }
    });
  } finally {
    clearTimeout(cut);
  }
};
