// Fetches one page's raw HTML server-side so the browser app can measure it.
// Raw HTML is deliberate: it is what AI crawlers that do not execute JavaScript see.

const dns = require('node:dns').promises;
const net = require('node:net');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublicUrl(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw httpError(400, 'Only http and https URLs can be analyzed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw httpError(400, `Could not resolve ${host}.`);
  if (addrs.some(a => isPrivateIp(a.address))) throw httpError(400, 'Local or private network addresses cannot be analyzed.');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function isSameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin';
  const ref = req.headers.referer || req.headers.origin;
  if (!ref) return false;
  try { return new URL(ref).host === req.headers.host; } catch { return false; }
}

async function readCapped(resp) {
  const reader = resp.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > MAX_BYTES) {
      chunks.push(value.subarray(0, MAX_BYTES - total));
      total = MAX_BYTES;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  return { bytes: Buffer.concat(chunks, total), truncated };
}

function decode(bytes, contentType) {
  let charset = (/charset=([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!charset) {
    const head = bytes.subarray(0, 4096).toString('latin1');
    charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  try { return new TextDecoder(charset || 'utf-8').decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  try {
    if (!isSameOrigin(req)) throw httpError(403, 'This endpoint only serves the GEO Analyst app.');
    const target = new URL(req.url, 'http://localhost').searchParams.get('url');
    if (!target) throw httpError(400, 'Missing url parameter.');
    let u;
    try { u = new URL(target); } catch { throw httpError(400, 'That does not look like a valid URL.'); }

    const redirects = [];
    let resp;
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(u);
      resp = await fetch(u, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'user-agent': UA,
          'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9,ko;q=0.8'
        }
      });
      const loc = resp.headers.get('location');
      if (resp.status >= 300 && resp.status < 400 && loc) {
        if (hop >= MAX_REDIRECTS) throw httpError(502, 'Too many redirects.');
        redirects.push({ status: resp.status, url: u.href });
        u = new URL(loc, u);
        continue;
      }
      break;
    }

    const contentType = resp.headers.get('content-type') || '';
    const { bytes, truncated } = await readCapped(resp);
    const html = decode(bytes, contentType);

    if (!resp.ok) {
      return send(res, 200, {
        ok: false, status: resp.status, finalUrl: u.href, redirects,
        error: resp.status === 403 || resp.status === 429 || resp.status === 503
          ? `The site refused the request (HTTP ${resp.status}). It may block automated visitors.`
          : `The site answered HTTP ${resp.status}.`
      });
    }
    if (contentType && !/html|xml/i.test(contentType)) {
      return send(res, 200, { ok: false, status: resp.status, finalUrl: u.href, redirects, error: `Not an HTML page (${contentType}).` });
    }

    send(res, 200, {
      ok: true,
      status: resp.status,
      finalUrl: u.href,
      redirects,
      contentType,
      bytes: bytes.length,
      truncated,
      fetchedAt: new Date().toISOString(),
      headers: {
        xRobotsTag: resp.headers.get('x-robots-tag'),
        lastModified: resp.headers.get('last-modified')
      },
      html
    });
  } catch (e) {
    const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError';
    send(res, e.status || (timedOut ? 504 : 502), {
      ok: false,
      error: e.status ? e.message : timedOut ? 'The site did not respond within 20 seconds.' : `Could not reach the site (${e.cause?.code || e.message}).`
    });
  }
};
