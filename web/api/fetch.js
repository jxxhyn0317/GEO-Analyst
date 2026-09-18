// Fetches one page's raw HTML server-side so the browser app can measure it.
// Raw HTML is deliberate: it is what AI crawlers that do not execute JavaScript see.

const dns = require('node:dns').promises;
const net = require('node:net');
const tls = require('node:tls');
const https = require('node:https');
const { X509Certificate } = require('node:crypto');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const HEADERS = {
  'user-agent': UA,
  'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9,ko;q=0.8'
};
const CHAIN_CODES = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);

// Every failure the user can see: what happened, what to do next, and whether
// AI crawlers would likely hit the same wall (which makes it a GEO finding too).
const FAIL = {
  BAD_URL: { status: 400, title: 'That is not a valid page URL', hint: 'Paste the full address, for example https://example.com/page.' },
  BAD_SCHEME: { status: 400, title: 'Only http and https pages can be analyzed', hint: 'Use the web address of the page, not a file or app link.' },
  PRIVATE: { status: 400, title: 'Local and private network addresses cannot be analyzed', hint: 'Use a page that is reachable on the public internet.' },
  DNS: { status: 502, title: 'This domain could not be found', hint: 'Check the address for typos. A brand-new domain may not be live yet.' },
  REFUSED: { status: 502, title: 'The site refused the connection', hint: 'The server may be down or open only to certain networks. Try again later.' },
  RESET: { status: 502, title: 'The site cut off the connection', hint: 'It may block automated or data-center traffic. If this repeats, AI crawlers are likely blocked too.', crawler: true },
  TIMEOUT: { status: 504, title: 'The site did not respond within 20 seconds', hint: 'The server is slow or unreachable from the analysis server. Try again later.', crawler: true },
  CERT_EXPIRED: { status: 502, title: "The site's security certificate has expired", hint: 'Browsers show a warning and crawlers skip the page. The site owner needs to renew the certificate.', crawler: true },
  CERT_SELF_SIGNED: { status: 502, title: "The site's certificate is not issued by a trusted authority", hint: 'Crawlers reject self-signed certificates. The site needs a certificate from a public certificate authority.', crawler: true },
  CERT_HOST: { status: 502, title: 'The security certificate does not match this domain', hint: 'The certificate was issued for a different address. Check the URL, or ask the site owner to fix the certificate.', crawler: true },
  CERT_CHAIN: { status: 502, title: "The site's certificate chain is incomplete", hint: 'The server does not send its intermediate certificate and it could not be recovered. Browsers may still open the page, but most crawlers cannot. The site owner needs to install the full chain.', crawler: true },
  TLS_OTHER: { status: 502, title: 'A secure connection to the site could not be established', hint: "The site's HTTPS setup is not accepted by standard clients.", crawler: true },
  REDIRECTS: { status: 502, title: 'The page redirects too many times', hint: 'It may be stuck in a redirect loop. Open it in a browser to see where it ends up.' },
  HTTP_401: { status: 200, title: 'The page requires a login', hint: 'Only public pages can be analyzed.' },
  HTTP_403: { status: 200, title: 'The site refused automated access (HTTP 403)', hint: 'It blocks bots or data-center traffic. AI crawlers are probably blocked as well, which is a GEO problem in itself.', crawler: true },
  HTTP_404: { status: 200, title: 'The page was not found (HTTP 404)', hint: 'Check the URL, or analyze the page it moved to.' },
  HTTP_410: { status: 200, title: 'The page has been removed (HTTP 410)', hint: 'Analyze the page that replaced it.' },
  HTTP_429: { status: 200, title: 'The site is limiting requests (HTTP 429)', hint: 'Wait a minute and try again.' },
  HTTP_451: { status: 200, title: 'The site blocks visitors from the analysis server region (HTTP 451)', hint: 'Most AI crawlers run from the same regions, so they are likely blocked too.', crawler: true },
  HTTP_5XX: { status: 200, title: "The site's server returned an error", hint: 'The problem is on the site. Try again later.' },
  HTTP_OTHER: { status: 200, title: 'The site answered with an unexpected status', hint: 'Open the page in a browser to check that it loads.' },
  NOT_HTML: { status: 200, title: 'This URL is not a web page', hint: 'It returns a file instead of HTML. Analyze the page that links to it.' },
  EMPTY: { status: 200, title: 'The page returned no content', hint: 'The server sent an empty response. Try again, or check the page in a browser.' },
  FORBIDDEN_ORIGIN: { status: 403, title: 'This endpoint only serves the GEO Analyst app', hint: '' },
  UNKNOWN: { status: 502, title: 'The site could not be reached', hint: 'Try again. If it keeps failing, open the page in a browser to check that it loads.' }
};

function fail(code, detail = '', extra = {}) {
  return Object.assign(new Error(code), { fail: code, detail }, extra);
}

function classifyNetwork(e) {
  if (e.fail) return e;
  const code = e.cause?.code || e.code || '';
  if (e.name === 'TimeoutError' || e.name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return fail('TIMEOUT', code || 'timeout');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NONAME') return fail('DNS', code);
  if (code === 'ECONNREFUSED') return fail('REFUSED', code);
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED' || code === 'UND_ERR_SOCKET') return fail('RESET', code);
  if (code === 'CERT_HAS_EXPIRED') return fail('CERT_EXPIRED', code);
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN') return fail('CERT_SELF_SIGNED', code);
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') return fail('CERT_HOST', code);
  if (CHAIN_CODES.has(code)) return fail('CERT_CHAIN', code);
  if (/^(ERR_SSL|ERR_TLS|CERT_)/.test(code)) return fail('TLS_OTHER', code);
  return fail('UNKNOWN', code || e.message);
}

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
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw fail('BAD_SCHEME', u.protocol);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else {
    try { addrs = await dns.lookup(host, { all: true }); }
    catch (e) { throw fail('DNS', e.code || 'ENOTFOUND'); }
  }
  if (!addrs.length) throw fail('DNS', 'ENOTFOUND');
  if (addrs.some(a => isPrivateIp(a.address))) throw fail('PRIVATE', host);
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

function wrapFetch(resp) {
  return {
    status: resp.status,
    header: n => resp.headers.get(n),
    read: () => readCapped(resp),
    discard: () => { resp.body?.cancel().catch(() => {}); }
  };
}

function wrapNode(res) {
  return {
    status: res.statusCode,
    header: n => { const v = res.headers[n.toLowerCase()]; return Array.isArray(v) ? v.join(', ') : (v ?? null); },
    read: () => new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      res.on('data', c => {
        if (total + c.length > MAX_BYTES) {
          chunks.push(c.subarray(0, MAX_BYTES - total));
          total = MAX_BYTES;
          res.destroy();
          resolve({ bytes: Buffer.concat(chunks, total), truncated: true });
          return;
        }
        chunks.push(c);
        total += c.length;
      });
      res.on('end', () => resolve({ bytes: Buffer.concat(chunks, total), truncated: false }));
      res.on('error', reject);
    }),
    discard: () => res.resume()
  };
}

function httpsGet(u, ca) {
  return new Promise((resolve, reject) => {
    const req = https.request(u, { method: 'GET', ca, headers: { ...HEADERS, 'accept-encoding': 'identity' } }, res => resolve(wrapNode(res)));
    req.setTimeout(TIMEOUT_MS, () => req.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    req.on('error', reject);
    req.end();
  });
}

// Reads the certificate the server presents, without trusting it; only used to find
// where its issuer can be downloaded. The page itself is always fetched with verification.
function peerCertificate(u) {
  return new Promise((resolve, reject) => {
    const s = tls.connect({
      host: u.hostname,
      port: Number(u.port) || 443,
      servername: net.isIP(u.hostname) ? undefined : u.hostname,
      rejectUnauthorized: false
    });
    s.setTimeout(10000, () => s.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    s.once('secureConnect', () => { const c = s.getPeerCertificate(false); s.end(); resolve(c); });
    s.once('error', reject);
  });
}

// Servers with an incomplete chain omit the intermediate certificate. Browsers fetch it
// from the "CA Issuers" address inside the certificate (AIA); Node does not. Do the same,
// adding intermediates only: a root fetched over the network is never trusted.
async function recoverChain(u) {
  const leaf = await peerCertificate(u);
  let uri = (leaf.infoAccess?.['CA Issuers - URI'] || [])[0];
  const pems = [];
  for (let i = 0; uri && i < 3; i++) {
    const cu = new URL(uri);
    await assertPublicUrl(cu);
    const r = await fetch(cu, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) break;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 65536) break;
    let x;
    try { x = new X509Certificate(buf); } catch { break; }
    if (x.issuer === x.subject) break;
    pems.push(x.toString());
    uri = (/CA Issuers - URI:(\S+)/.exec(x.infoAccess || '') || [])[1];
  }
  return pems;
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

function httpFailCode(s) {
  if (s === 401 || s === 403 || s === 404 || s === 410 || s === 429 || s === 451) return `HTTP_${s}`;
  return s >= 500 ? 'HTTP_5XX' : 'HTTP_OTHER';
}

module.exports = async function handler(req, res) {
  let u;
  try {
    if (!isSameOrigin(req)) throw fail('FORBIDDEN_ORIGIN');
    const target = new URL(req.url, 'http://localhost').searchParams.get('url');
    if (!target) throw fail('BAD_URL', 'missing url');
    try { u = new URL(target); } catch { throw fail('BAD_URL', target); }

    const redirects = [];
    const warnings = [];
    let extraCa = null;
    let resp;
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(u);
      let r;
      try {
        r = extraCa && u.protocol === 'https:'
          ? await httpsGet(u, extraCa)
          : wrapFetch(await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: HEADERS }));
      } catch (e) {
        const code = e.cause?.code || e.code;
        if (u.protocol !== 'https:' || extraCa || !CHAIN_CODES.has(code)) throw classifyNetwork(e);
        const pems = await recoverChain(u).catch(() => []);
        if (!pems.length) throw fail('CERT_CHAIN', code);
        extraCa = [...tls.rootCertificates, ...pems];
        try { r = await httpsGet(u, extraCa); } catch (e2) { throw classifyNetwork(e2); }
        warnings.push({
          code: 'TLS_CHAIN_INCOMPLETE',
          text: `${u.hostname} does not send its intermediate security certificate. The analysis recovered it to read the page, but many crawlers and HTTP clients reject the connection instead, so AI engines may never see this page. The site owner should install the full certificate chain.`
        });
      }
      const loc = r.header('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        r.discard();
        if (hop >= MAX_REDIRECTS) throw fail('REDIRECTS', `${hop + 1} redirects`, { finalUrl: u.href });
        redirects.push({ status: r.status, url: u.href });
        u = new URL(loc, u);
        continue;
      }
      resp = r;
      break;
    }

    if (resp.status < 200 || resp.status >= 300) {
      resp.discard();
      throw fail(httpFailCode(resp.status), `HTTP ${resp.status}`, { httpStatus: resp.status, finalUrl: u.href });
    }
    const contentType = resp.header('content-type') || '';
    if (contentType && !/html|xml/i.test(contentType)) {
      resp.discard();
      throw fail('NOT_HTML', contentType.split(';')[0], { httpStatus: resp.status, finalUrl: u.href });
    }
    const { bytes, truncated } = await resp.read();
    if (!bytes.length) throw fail('EMPTY', '0 bytes', { httpStatus: resp.status, finalUrl: u.href });

    send(res, 200, {
      ok: true,
      status: resp.status,
      finalUrl: u.href,
      redirects,
      warnings,
      contentType,
      bytes: bytes.length,
      truncated,
      fetchedAt: new Date().toISOString(),
      headers: {
        xRobotsTag: resp.header('x-robots-tag'),
        lastModified: resp.header('last-modified')
      },
      html: decode(bytes, contentType)
    });
  } catch (e) {
    const f = classifyNetwork(e);
    const info = FAIL[f.fail] || FAIL.UNKNOWN;
    send(res, info.status, {
      ok: false,
      code: f.fail,
      title: info.title,
      hint: info.hint,
      crawlerImpact: !!info.crawler,
      detail: f.detail || '',
      error: info.title,
      status: f.httpStatus,
      finalUrl: f.finalUrl || u?.href
    });
  }
};
