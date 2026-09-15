// ===== GEO ANALYST v2 =====
let currentData = null;
const KEY_STORE = 'geoa_gemini_key';

// ===== SCREENS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
function showLanding() { showScreen('screen-landing'); }

function readStoredKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } }
function storeKey(k) { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch {} }

function normalizeInputUrl(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).href; } catch { return null; }
}

// ===== ANALYSIS =====
function startAnalysis() {
  const input = document.getElementById('url-input');
  const url = normalizeInputUrl(input.value);
  if (!url) { input.focus(); return; }
  const keyInput = document.getElementById('api-key-input');
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    keyInput.focus();
    keyInput.classList.add('input-error');
    keyInput.setAttribute('placeholder', 'Gemini API key required');
    setTimeout(() => { keyInput.classList.remove('input-error'); keyInput.setAttribute('placeholder', 'Gemini API Key'); }, 3000);
    return;
  }
  storeKey(apiKey);
  history.replaceState(null, '', `?url=${encodeURIComponent(url)}`);
  document.getElementById('loading-url').textContent = url;
  showScreen('screen-loading');
  runAnalysis(url, apiKey);
}

async function runAnalysis(url, apiKey) {
  const steps = document.querySelectorAll('.step-item');
  const fill = document.getElementById('progress-fill');
  const pct = document.getElementById('progress-pct');
  const feed = document.getElementById('insights-feed');
  steps.forEach(s => s.classList.remove('active', 'done'));
  fill.style.width = '0%';
  pct.textContent = '0%';
  feed.innerHTML = '';

  const progress = i => {
    steps.forEach((s, k) => { s.classList.toggle('done', k < i); s.classList.toggle('active', k === i); });
    const p = Math.round(((i + 1) / steps.length) * 100);
    fill.style.width = p + '%';
    pct.textContent = p + '%';
  };
  const note = (text, color = 'blue') => {
    const div = document.createElement('div');
    div.className = 'insight-item insight-enter';
    div.innerHTML = `<span class="insight-dot ${color}"></span>${GEO.esc(text)}`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
    requestAnimationFrame(() => div.classList.remove('insight-enter'));
  };
  const tick = () => new Promise(r => setTimeout(r, 260));

  let stage = 'fetch';
  try {
    progress(0);
    note(`Requesting ${new URL(url).hostname}`);
    const t0 = performance.now();
    const resp = await fetch(`api/fetch?url=${encodeURIComponent(url)}`).catch(e => { throw new AuditError('NETWORK', e.message); });
    const page = await resp.json().catch(() => { throw new AuditError('SERVICE', `HTTP ${resp.status}`); });
    if (!page.ok) throw new AuditError(page.code || 'UNKNOWN', page.detail || page.error || '', { crawlerImpact: page.crawlerImpact });
    (page.warnings || []).forEach(w => note(WARNING_COPY[w.code]?.short || w.text, 'yellow'));
    note(`HTTP ${page.status} · ${(page.bytes / 1024).toFixed(0)} KB of HTML in ${((performance.now() - t0) / 1000).toFixed(1)}s`, 'green');
    if (page.redirects?.length) note(`Followed ${page.redirects.length} redirect${page.redirects.length > 1 ? 's' : ''} to ${page.finalUrl}`, 'yellow');
    if (page.truncated) note('HTML larger than 4 MB; measured the first 4 MB', 'yellow');

    progress(1);
    stage = 'read';
    await tick();
    let result;
    try { result = GEO.analyze(page.html, url, page); }
    catch (e) { throw new AuditError('PARSE', e.message); }
    result.fetchWarnings = page.warnings || [];
    const [d1, d2, d3, d4] = result.dimensions;
    note(`${result.measure.headings.length} content headings · ${result.measure.substantiveChars.toLocaleString('en-US')} chars of substantive text`);
    if (result.measure.jsHeavy) note('Very little text in the raw HTML; the content likely renders with JavaScript', 'red');

    progress(2); await tick();
    note(`D1 URL & Page Context: ${d1.score}/100`, colorOf(d1.score));
    progress(3); await tick();
    note(`D2 Page Structure: ${d2.score}/100`, colorOf(d2.score));
    progress(4); await tick();
    note(`D3 Answerability & Content Depth: ${d3.score}/100`, colorOf(d3.score));
    progress(5); await tick();
    note(`D4 Schema Markup: ${d4.score}/100`, colorOf(d4.score));

    progress(6);
    stage = 'gemini';
    note(`Asking ${JUDGE.MODEL} to judge headings, the opening and citable facts`);
    const t1 = performance.now();
    const judgment = await JUDGE.judge(apiKey, result, note);
    GEO.applyJudgment(result, judgment);
    note(`Gemini judgment applied in ${((performance.now() - t1) / 1000).toFixed(1)}s`, 'green');

    progress(7);
    note(`GEO Readiness: ${result.overallScore}/100`, colorOf(result.overallScore));
    steps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
    fill.style.width = '100%';
    pct.textContent = '100%';
    currentData = result;
    setTimeout(() => { renderDashboard(result); showScreen('screen-dashboard'); }, 500);
  } catch (err) {
    console.error(err);
    const e = err instanceof AuditError ? err : new AuditError('UNKNOWN', err.message);
    note(copyFor(e).title, 'red');
    setTimeout(() => renderError(url, e, stage), 900);
  }
}

// ===== ERROR COPY =====
// Plain-language copy for every failure: what happened, why, what the user can do,
// and what the tool cannot do. Technical codes stay in the collapsed details.
const GEO_WALL = 'AI search engines visit pages much like this audit does. If we cannot open the page, they most likely cannot either, so it will not appear in AI answers until this is fixed.';
const ERROR_COPY = {
  BAD_URL: { title: 'This doesn’t look like a web address', body: 'Check that the full address is there, starting with https://.', action: 'edit' },
  BAD_SCHEME: { title: 'We can only open web pages', body: 'Addresses that start with http:// or https:// work. Files and app links can’t be audited.', action: 'edit' },
  PRIVATE: { title: 'This page is on a private network', body: 'We audit pages anyone can open on the internet, the same way AI search engines see them. Internal or company-network pages can’t be checked.', action: 'edit' },
  DNS: { title: 'We couldn’t find this website', body: 'The address may have a typo, or the domain may not be live yet.', tips: ['Check the spelling of the address.', 'Open it in your browser to make sure it loads.'], action: 'edit' },
  REFUSED: { title: 'The website isn’t accepting visitors right now', body: 'Its server may be down, or open only to certain networks.', tips: ['Try again in a few minutes.'], action: 'retry' },
  RESET: { title: 'The website ended the connection', body: 'Some sites turn away automated visits partway through.', tips: ['Try again. If it keeps happening, the site is likely blocking automated visitors.'], geo: true, action: 'retry' },
  TIMEOUT: { title: 'The website took too long to respond', body: 'We waited 20 seconds without an answer. The site may be slow, or hard to reach from our server.', tips: ['Try again in a moment.'], geo: true, action: 'retry' },
  CERT_EXPIRED: { title: 'This website’s security certificate has expired', body: 'Browsers show a warning for this site, and AI search engines usually skip it.', tips: ['Let the site owner know the certificate needs renewing.'], geo: true, action: 'edit' },
  CERT_SELF_SIGNED: { title: 'This website’s security certificate isn’t trusted', body: 'It wasn’t issued by a recognized authority, so standard tools refuse to open the page.', tips: ['The site owner needs a certificate from a trusted authority.'], geo: true, action: 'edit' },
  CERT_HOST: { title: 'The security certificate belongs to another address', body: 'The site shows a certificate made for a different domain, so the connection can’t be trusted.', tips: ['Check the address. If it’s correct, let the site owner know.'], geo: true, action: 'edit' },
  CERT_CHAIN: { title: 'This website’s security setup is incomplete', body: 'Part of its security certificate is missing. Browsers fill the gap on their own, but most AI search engines don’t.', tips: ['Ask the site owner to install the full certificate chain.'], geo: true, action: 'edit' },
  TLS_OTHER: { title: 'We couldn’t open a secure connection', body: 'The site’s HTTPS settings aren’t accepted by standard tools.', tips: ['Let the site owner know their HTTPS setup needs a check.'], geo: true, action: 'edit' },
  REDIRECTS: { title: 'This page keeps redirecting', body: 'It sends visitors from one address to another in a loop.', tips: ['Open it in your browser to see where it ends up, then audit that address.'], action: 'edit' },
  HTTP_401: { title: 'This page needs a login', body: 'We can only audit pages anyone can see without signing in, the same pages AI search engines can read.', action: 'edit' },
  HTTP_403: { title: 'This website blocked our visit', body: 'It turns away automated visitors.', tips: ['If this is your site, check its bot and firewall settings.'], geo: true, action: 'edit' },
  HTTP_404: { title: 'We couldn’t find this page', body: 'It may have moved or been deleted.', tips: ['Check the address, or audit the page it moved to.'], action: 'edit' },
  HTTP_410: { title: 'This page has been removed', body: 'The site says it’s gone for good.', tips: ['Audit the page that replaced it.'], action: 'edit' },
  HTTP_429: { title: 'The website asked us to slow down', body: 'It received too many requests in a short time.', tips: ['Wait a minute, then try again.'], action: 'retry' },
  HTTP_451: { title: 'This website isn’t available in our server’s region', body: 'It limits visitors by location, and our audit server runs in the United States, where many AI search engines also run.', geo: true, action: 'edit' },
  HTTP_5XX: { title: 'The website is having trouble right now', body: 'Its server returned an error. This is on the site’s side.', tips: ['Try again in a few minutes.'], action: 'retry' },
  HTTP_OTHER: { title: 'The website sent an unexpected response', body: 'We didn’t receive the page we expected.', tips: ['Open it in your browser to make sure it loads.'], action: 'retry' },
  NOT_HTML: { title: 'This address opens a file, not a web page', body: 'We audit web pages written in HTML.', tips: ['Audit the page that links to this file instead.'], action: 'edit' },
  EMPTY: { title: 'The page came back empty', body: 'The website sent no content.', tips: ['Try again, or open it in your browser to check.'], action: 'retry' },
  UNKNOWN: { title: 'We couldn’t open this page', body: 'Something went wrong while connecting to the website.', tips: ['Try again. If it keeps failing, check that the page opens in your browser.'], action: 'retry' },
  NETWORK: { title: 'You seem to be offline', body: 'We couldn’t reach the audit service.', tips: ['Check your internet connection, then try again.'], action: 'retry' },
  SERVICE: { title: 'Our audit service isn’t responding', body: 'This is a problem on our side, not yours.', tips: ['Try again in a moment.'], action: 'retry' },
  PARSE: { title: 'We couldn’t read this page’s content', body: 'The page opened, but its HTML couldn’t be analyzed.', tips: ['Try again, or try another page.'], action: 'retry' },
  KEY_INVALID: { title: 'This Gemini API key doesn’t work', body: 'Google didn’t accept the key. It may have a typo, or it may have been deleted.', tips: ['Copy the key again from Google AI Studio and paste it in.'], action: 'key' },
  KEY_PERMISSION: { title: 'This key can’t use Gemini yet', body: 'The Gemini API isn’t turned on for the project this key belongs to.', tips: ['Create a new key in Google AI Studio. New keys work right away.'], action: 'key' },
  QUOTA: { title: 'You’ve reached your Gemini usage limit', body: 'Free keys allow only a set number of requests per minute and per day.', tips: ['Wait a minute and try again.', 'If it keeps happening, try again tomorrow or use a key with a higher limit.'], action: 'retry' },
  GEMINI_BUSY: { title: 'Gemini is busy right now', body: 'Google’s service is temporarily overloaded.', tips: ['Try again in a minute.'], action: 'retry' },
  GEMINI_TIMEOUT: { title: 'Gemini took too long to answer', body: 'We waited 90 seconds. Longer pages take more time.', tips: ['Try again.'], action: 'retry' },
  GEMINI_NETWORK: { title: 'We couldn’t reach Gemini', body: 'Your network may be blocking Google’s API.', tips: ['Check your connection, or try a different network.'], action: 'retry' },
  GEMINI_BLOCKED: { title: 'Gemini couldn’t finish this analysis', body: 'It stopped without giving a result. This sometimes happens with certain page content.', tips: ['Try again. If it repeats, try a different page.'], action: 'retry' },
  GEMINI_BAD_OUTPUT: { title: 'Gemini’s answer came back incomplete', body: 'We couldn’t read the result it sent.', tips: ['Try again.'], action: 'retry' },
  GEMINI_OTHER: { title: 'Gemini couldn’t process the request', body: 'Google returned an error.', tips: ['Try again in a moment.'], action: 'retry' }
};
const WARNING_COPY = {
  TLS_CHAIN_INCOMPLETE: {
    short: 'Security certificate incomplete; recovered it to continue',
    text: 'This site’s security setup is incomplete: part of its certificate is missing. We filled the gap to run this audit, but most AI search engines won’t, so they may not be able to open this page at all. Ask the site owner to install the full certificate chain.'
  }
};
const STAGE_LABEL = { fetch: 'Opening the page', read: 'Reading the page', gemini: 'Asking Gemini' };
const ACTION_LABEL = { retry: 'Try again', edit: 'Change the address', key: 'Change the API key' };
let lastAudit = { url: '' };

function copyFor(e) { return ERROR_COPY[e.code] || ERROR_COPY.UNKNOWN; }

function renderError(url, e, stage) {
  const c = copyFor(e);
  lastAudit = { url };
  const geo = c.geo || e.crawlerImpact;
  showScreen('screen-dashboard');
  document.getElementById('dash-content').innerHTML = `
    <section class="err-card" role="alert">
      <div class="err-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>
      </div>
      <h2 class="err-title">${c.title}</h2>
      <p class="err-body">${c.body}</p>
      ${c.tips?.length ? `<ul class="err-tips">${c.tips.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
      ${geo ? `<div class="err-geo"><b>Why this matters for GEO</b><p>${GEO_WALL}</p></div>` : ''}
      <div class="err-actions">
        <button class="btn-primary err-btn" onclick="errorAction('${c.action}')">${ACTION_LABEL[c.action]}</button>
        ${c.action !== 'edit' ? `<button class="btn-ghost err-btn" onclick="errorAction('edit')">Audit another page</button>` : ''}
      </div>
      <p class="err-url">${GEO.esc(url)}</p>
      <details class="err-tech">
        <summary>Technical details</summary>
        <pre>stage   ${GEO.esc(STAGE_LABEL[stage] || stage)}\ncode    ${GEO.esc(e.code)}${e.detail ? `\ndetail  ${GEO.esc(String(e.detail).slice(0, 200))}` : ''}</pre>
      </details>
    </section>`;
}

function errorAction(action) {
  const urlInput = document.getElementById('url-input');
  const keyInput = document.getElementById('api-key-input');
  urlInput.value = lastAudit.url;
  if (action === 'retry') { startAnalysis(); return; }
  showLanding();
  const target = action === 'key' ? keyInput : urlInput;
  target.focus();
  target.select();
}

// ===== DASHBOARD =====
function colorOf(score) { return score >= 60 ? 'green' : score >= 40 ? 'yellow' : 'red'; }
function statusLabelFor(c) { return c === 'green' ? 'Reasonably Prepared' : c === 'yellow' ? 'Needs Improvement' : 'Needs Significant Improvement'; }
function dimLabelFor(c) { return c === 'green' ? 'Sufficient' : c === 'yellow' ? 'Needs Improvement' : 'Weak'; }
const HEX = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };

function scoreRingSVG(score, size = 100, stroke = 8) {
  const r = (size - stroke) / 2;
  const c = Math.PI * 2 * r;
  const color = colorOf(score);
  const bg = color === 'green' ? '#DCFCE7' : color === 'yellow' ? '#FEF3C7' : '#FEE2E2';
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${bg}" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${HEX[color]}" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${c * score / 100} ${c}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
}

function renderCapture(c) {
  const badge = c.tone === 'good' ? '<span class="cap-badge good">WELL DONE</span>' : '<span class="cap-badge bad">PENALIZED</span>';
  return `<div class="cap cap-${c.tone}"><div class="cap-head">${badge}<span class="cap-caption">${c.caption}</span></div><pre>${c.code}</pre></div>`;
}

function judgedTag(g) {
  return g.judged === 'heuristic' ? '<span class="judged-tag">heuristic</span>' : '';
}

function renderCheckGroup(g) {
  const color = colorOf(Math.round(g.points / g.max * 100));
  const rows = (g.checks || []).map(c => `
    <div class="check-row">
      <span class="check-ic ${c.pass ? 'p' : 'f'}">${c.pass ? '✓' : '✗'}</span>
      <span class="check-txt">${GEO.esc(c.text)}${c.meas ? ` <span class="meas">· ${GEO.esc(c.meas)}</span>` : ''}${c.judged ? judgedTag(c) : ''}</span>
      <span class="check-pts ${c.pass ? 'p' : 'f'}">${c.pass ? c.pts : 0}/${c.pts}</span>
    </div>`).join('');
  const band = g.band ? `<div class="band-note"><b>Band:</b> ${GEO.esc(g.band)}<br><b>Measured:</b> ${GEO.esc(g.measured)}</div>` : '';
  const evi = g.captures.length ? `
    <details class="evi">
      <summary>EVIDENCE (${g.captures.length})</summary>
      <div class="evi-wrap"><div class="evi-body">${g.captures.map(renderCapture).join('')}</div></div>
    </details>` : '';
  return `
    <div class="check-group">
      <div class="check-group-head">
        <span class="check-group-name">${GEO.esc(g.name)}${g.band ? judgedTag(g) : ''}</span>
        <span class="check-group-pts">${g.points}<span class="mx"> / ${g.max}</span></span>
      </div>
      <div class="group-gauge"><div class="group-gauge-fill" style="width:${g.points / g.max * 100}%;background:${HEX[color]}"></div></div>
      ${rows}${band}${evi}
    </div>`;
}

function renderDashboard(d) {
  const sc = colorOf(d.overallScore);
  const t = d.templates;
  const when = new Date(d.fetchedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const notices = [
    ...(d.fetchWarnings || []).map(w => `<div class="notice warn">${WARNING_COPY[w.code]?.text || GEO.esc(w.text)}</div>`),
    d.measure.jsHeavy && `<div class="notice warn">The raw HTML carries very little text (${d.measure.substantiveChars.toLocaleString('en-US')} chars). The page most likely renders its content with JavaScript, which AI crawlers that do not run scripts never see. The scores below reflect that crawler view.</div>`,
    d.redirects.length && `<div class="notice info">The requested URL redirected; the audit measures the final page.</div>`
  ].filter(Boolean).join('');

  document.getElementById('dash-content').innerHTML = `
    ${notices}
    <section class="hero-section">
      <div class="hero-top">
        <div class="hero-score-area">
          <div class="hero-score-ring">
            ${scoreRingSVG(d.overallScore, 100, 8)}
            <div class="hero-score-value score-${sc}">${d.overallScore}</div>
          </div>
          <div class="hero-score-label">GEO Readiness</div>
        </div>
        <div class="hero-meta hero-meta-right">
          <div class="hero-url-label">Audited URL</div>
          <a class="hero-url-link" href="${GEO.esc(d.url)}" target="_blank" rel="noopener" title="${GEO.esc(d.url)}">${GEO.esc(d.url)}</a>
          <div class="hero-timestamp">Analyzed ${GEO.esc(when)} · single page, raw HTML</div>
        </div>
      </div>
      <div class="hero-badge-row"><span class="hero-badge badge-${sc}">${statusLabelFor(sc)}</span></div>
      <h2 class="hero-headline">${GEO.esc(t.headline)}</h2>
      <div class="hero-strengths-weaknesses">
        <div class="sw-column"><h4>Strengths</h4>
          ${(t.strengths.length ? t.strengths : ['No checklist group earns full marks yet']).map(s => `<div class="sw-item"><span class="sw-icon green">✓</span><span>${GEO.esc(s)}</span></div>`).join('')}
        </div>
        <div class="sw-column"><h4>Weaknesses</h4>
          ${(t.weaknesses.length ? t.weaknesses : ['No failed checks']).map(w => `<div class="sw-item"><span class="sw-icon red">✗</span><span>${GEO.esc(w)}</span></div>`).join('')}
        </div>
      </div>
      <p class="hero-method">Weights: D1 15% · D2 35% · D3 35% · D4 15%. Every point is a binary check or a stated band; judgment items and diagnosis text by ${JUDGE.MODEL}.</p>
    </section>

    <h3 class="section-title">Score Breakdown</h3>
    <div class="scores-grid">
      ${d.dimensions.map(dim => {
        const dc = colorOf(dim.score);
        const pd = t.perDim[dim.key];
        return `
          <div class="score-card">
            <div class="score-card-header">
              <span class="score-card-num">Dimension ${dim.num}</span>
              <span class="weight-chip">weight ${dim.weight}</span>
            </div>
            <h4 class="score-card-title">${dim.title}</h4>
            <div class="score-card-score"><span class="num score-${dc}">${dim.score}</span><span class="total">/ 100</span><span class="score-card-badge badge-${dc}">${dimLabelFor(dc)}</span></div>
            ${dim.capped ? `<div class="cap-note">Checks sum to ${dim.rawScore}; shown as ${dim.score} because no score reaches 100 (headroom above best practice is reserved).</div>` : ''}
            <ul class="diag-list">${pd.diagnosis.map(x => `<li>${GEO.esc(x)}</li>`).join('')}</ul>
            <div class="score-breakdown">
              <div class="breakdown-header"><span class="breakdown-label">SCORING BREAKDOWN</span></div>
              ${dim.breakdown.map(renderCheckGroup).join('')}
            </div>
            <div class="todo-box">
              <div class="todo-label">WHAT TO DO</div>
              <ol>${pd.todo.map(x => `<li>${GEO.esc(x)}</li>`).join('')}</ol>
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="method-box">
      <b>How this audit works.</b> The page is fetched once as raw HTML, the view of AI crawlers that do not execute JavaScript. Navigation, header and footer are excluded from content measures.
      Overall = D1×0.15 + D2×0.35 + D3×0.35 + D4×0.15, rounded. Evidence follows one rule: a full-mark group shows one passing example, a partial group shows one passing and one penalized example, a zero group shows the penalized evidence only.
      Heading quality, the opening answer and citable facts need reading comprehension and are judged by Gemini on the same bands; all other items are counted directly from the HTML. E-E-A-T content quality is out of scope and needs a human review.
    </div>`;
}

// ===== EVIDENCE DISCLOSURE MOTION =====
// Animates <details class="evi"> open and close; a click mid-animation reverses from the current height.
const EVI_MS = 280;
const EVI_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
document.addEventListener('click', e => {
  const summary = e.target.closest('details.evi > summary');
  if (!summary) return;
  const details = summary.parentElement;
  const wrap = details.querySelector('.evi-wrap');
  if (!wrap || !wrap.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  e.preventDefault();

  const inner = wrap.firstElementChild;
  const from = details.open ? wrap.getBoundingClientRect().height : 0;
  const closing = details.open && !details.classList.contains('closing');
  details._anims?.forEach(a => a.cancel());
  wrap.style.overflow = 'hidden';
  const reset = () => {
    wrap.style.overflow = '';
    details._anims?.forEach(a => a.cancel());
    details._anims = null;
  };

  if (closing) {
    details.classList.add('closing');
    details._anims = [
      wrap.animate([{ height: `${from}px` }, { height: '0px' }], { duration: EVI_MS * 0.8, easing: EVI_EASE, fill: 'forwards' }),
      inner.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: EVI_MS * 0.5, easing: 'ease-out', fill: 'forwards' })
    ];
    details._anims[0].onfinish = () => { details.open = false; details.classList.remove('closing'); reset(); };
  } else {
    details.classList.remove('closing');
    details.open = true;
    const to = inner.getBoundingClientRect().height;
    details._anims = [
      wrap.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: EVI_MS, easing: EVI_EASE, fill: 'forwards' }),
      inner.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: EVI_MS, delay: 40, easing: EVI_EASE, fill: 'backwards' })
    ];
    details._anims[0].onfinish = reset;
  }
});

// ===== BOOT =====
document.getElementById('url-input').addEventListener('keydown', e => { if (e.key === 'Enter') startAnalysis(); });
document.getElementById('api-key-input').value = readStoredKey();
(() => {
  const q = new URLSearchParams(location.search).get('url');
  if (q) {
    document.getElementById('url-input').value = q;
    if (readStoredKey()) startAnalysis();
  }
})();
