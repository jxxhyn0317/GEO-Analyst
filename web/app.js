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
  if (keyState !== 'ok') {
    continueAfterKey = startAnalysis;
    openKeyPanel({ nudge: true });
    return;
  }
  const apiKey = readStoredKey();
  document.getElementById('loading-url').textContent = url;
  setSteps(PAGE_STEPS);
  showScreen('screen-loading');
  runAnalysis(url, apiKey);
}

// The loading screen lists the job being done, and watching a video is not the same job as
// reading a page. The list is rewritten before each run so the steps are honest.
const PAGE_STEPS = ['Reading the page the way AI crawlers do', 'Parsing headings, text and markup',
  'D1 \u00b7 URL and page context', 'D2 \u00b7 Page structure', 'D3 \u00b7 Answerability and content depth',
  'D4 \u00b7 Schema markup', 'Reading heading labels and the opening',
  'Weighing citable facts and first-hand experience', 'Writing the diagnosis and next steps', 'Report ready'];
const VIDEO_STEPS = ['Handing the video to the model', 'Walking the timeline and reading the transcript',
  'Listening for the opening and the direct answer', 'Following the spoken structure',
  'Collecting sentences that stand on their own', 'Collecting numbers, dates and names',
  'Checking who is speaking and what they cite', 'Scoring against the rubric',
  'Writing the diagnosis and next steps', 'Report ready'];
function setSteps(labels) {
  const list = document.getElementById('steps-list');
  list.innerHTML = labels.map((t, i) =>
    `<div class="step-item" data-step="${i}"><span class="step-indicator"></span><span class="step-text">${GEO.esc(t)}</span></div>`).join('');
}

function startVideoAnalysis() {
  const input = document.getElementById('video-input');
  const video = YTGEO.normalize(input.value);
  if (!video) { setVideoError('That is not a YouTube video address. Paste a link to one video.'); input.focus(); return; }
  setVideoError('');
  if (keyState !== 'ok') {
    continueAfterKey = startVideoAnalysis;
    openKeyPanel({ nudge: true });
    return;
  }
  document.getElementById('loading-url').textContent = video.url;
  setSteps(VIDEO_STEPS);
  showScreen('screen-loading');
  runVideoAnalysis(video.url, readStoredKey());
}

function setVideoError(msg) {
  const el = document.getElementById('video-msg');
  if (el) { el.textContent = msg; el.hidden = !msg; }
}

// ===== LOADING SCREEN =====
function resetLoading() {
  document.querySelectorAll('.step-item').forEach(s => s.classList.remove('active', 'done'));
  stopPct();
  pctNow = pctAim = 0;
  const fill = document.getElementById('progress-fill');
  fill.style.transition = '';
  fill.style.width = '0%';
  fill.classList.remove('done');
  document.getElementById('progress-pct')._count?.();
  document.getElementById('progress-pct').textContent = '0%';
  document.getElementById('insights-feed').innerHTML = '';
}
let currentStep = 0;

// ===== THE PROGRESS BAR =====
// A stalled bar feels slower than a slow one, so this one never stands still. Each step owns a
// band of the track and the fill eases across its band over that step's own expected time: a
// short measuring step crosses briskly, the long model step keeps inching for as long as it
// takes. It approaches the far edge without crossing it, so when the next step lands there is
// nothing to jump over and the motion simply picks up again. The number follows the fill rather
// than counting on its own, so the two can never disagree.
let pctNow = 0, pctAim = 0, pctTau = 400, pctRaf = 0, pctLast = 0;
function aimPct(target, seconds = 1) {
  pctAim = Math.max(pctAim, Math.min(100, target));
  // Not /3. Easing all the way to the edge inside the step leaves a long decelerating tail, and
  // the bar reads as fast-slow-fast-slow. At /1.6 it covers about four fifths of the band in the
  // step's own time and is still moving briskly when the next one lands, so the pace stays even.
  pctTau = Math.max(150, seconds * 1000 / 1.6);
  if (reducedMotion()) { pctNow = pctAim; drawPct(); return; }
  if (!pctRaf) { pctLast = performance.now(); pctRaf = requestAnimationFrame(pctFrame); }
}
function pctFrame(now) {
  const dt = Math.min(120, now - pctLast);
  pctLast = now;
  const gap = pctAim - pctNow;
  if (gap > 0.01) {
    pctNow += gap * (1 - Math.exp(-dt / pctTau));
    drawPct();
  }
  pctRaf = requestAnimationFrame(pctFrame);
}
function drawPct() {
  document.getElementById('progress-fill').style.width = pctNow.toFixed(2) + '%';
  const el = document.getElementById('progress-pct');
  const v = `${Math.floor(pctNow)}%`;
  if (el.textContent !== v) el.textContent = v;
}
function stopPct() { if (pctRaf) cancelAnimationFrame(pctRaf); pctRaf = 0; }

// Counts a figure up to its value instead of snapping to it. Reading the number climb is what
// makes a measurement feel measured rather than printed.
function countTo(el, to, fmt = String, ms = 520) {
  const from = parseFloat((el.textContent || '').replace(/[^\d.-]/g, '')) || 0;
  el._count?.();
  if (reducedMotion() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  let raf = 0;
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) raf = requestAnimationFrame(step);
    else { el.textContent = fmt(to); el._count = null; }
  };
  el._count = () => { cancelAnimationFrame(raf); el._count = null; };
  raf = requestAnimationFrame(step);
}

// Counts from nothing up to the figure the element already carries.
function countFromZero(el, ms) {
  const to = parseInt(el.textContent, 10);
  if (!Number.isFinite(to)) return;
  el.textContent = '0';
  countTo(el, to, String, ms);
}
// `seconds` is how long this step is expected to take, which is what sets the pace across its
// band. Guessing a little long is safe: the bar eases and keeps moving. Guessing short is what
// makes it arrive early and then sit there.
function progress(i, seconds = 1) {
  const steps = document.querySelectorAll('.step-item');
  currentStep = i;
  steps.forEach((s, k) => { s.classList.toggle('done', k < i); s.classList.toggle('active', k === i); s.querySelector('.step-time')?.remove(); });
  aimPct(((i + 1) / steps.length) * 100, seconds);
}
// The model answers in one reply, so while it works the bar keeps creeping toward the next
// step, the active step shows elapsed seconds, and the steps advance on a schedule.
function modelPacing() {
  const steps = document.querySelectorAll('.step-item');
  const t0 = performance.now();
  const timers = [
    setTimeout(() => progress(7, 5), 3000),
    setTimeout(() => { progress(8, 12); note('Writing the diagnosis and next steps'); }, 7500),
    setTimeout(() => note('Still working. Longer pages take more time.', 'yellow'), 18000),
    setTimeout(() => note('Almost there. Waiting for the model to finish.', 'yellow'), 40000)
  ];
  const ticker = setInterval(() => {
    // However long the model takes, the bar keeps reaching into the next band, slowly enough
    // that it never runs out of track before the answer arrives.
    aimPct(Math.min(((currentStep + 2) / steps.length) * 100 - 2, 96), 30);
    const active = steps[currentStep];
    if (!active) return;
    let t = active.querySelector('.step-time');
    if (!t) { t = document.createElement('span'); t.className = 'step-time'; active.appendChild(t); }
    t.textContent = Math.floor((performance.now() - t0) / 1000) + 's';
  }, 1000);
  return () => { timers.forEach(clearTimeout); clearInterval(ticker); };
}
function note(text, color = 'blue') {
  const feed = document.getElementById('insights-feed');
  const div = document.createElement('div');
  div.className = 'insight-item insight-enter';
  div.innerHTML = `<span class="insight-dot ${color}"></span>${GEO.esc(text)}`;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
  requestAnimationFrame(() => div.classList.remove('insight-enter'));
}
function finishLoading() {
  document.querySelectorAll('.step-item').forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
  // The ending is the part people remember, so the last stretch is one clean glide rather than
  // the easing tail, which would crawl the final few percent.
  stopPct();
  pctNow = pctAim = 100;
  const fill = document.getElementById('progress-fill');
  fill.style.transition = 'width .45s cubic-bezier(0.22, 1, 0.36, 1)';
  fill.style.width = '100%';
  fill.classList.add('done');
  countTo(document.getElementById('progress-pct'), 100, v => `${v}%`, 420);
}
// Pauses between steps so each measured score can be read as it lands.
const tick = (ms = 850) => new Promise(r => setTimeout(r, ms));

async function runAnalysis(url, apiKey) {
  resetLoading();
  lastAudit = { url, result: null, stage: 'fetch' };
  let stage = 'fetch';
  try {
    progress(0, 2.5);
    note(`Requesting ${new URL(url).hostname}`);
    const t0 = performance.now();
    const resp = await fetch(`api/fetch?url=${encodeURIComponent(url)}`).catch(e => { throw new AuditError('NETWORK', e.message); });
    const page = await resp.json().catch(() => { throw new AuditError('SERVICE', `HTTP ${resp.status}`); });
    if (!page.ok) throw new AuditError(page.code || 'UNKNOWN', page.detail || page.error || '', { crawlerImpact: page.crawlerImpact });
    (page.warnings || []).forEach(w => note(WARNING_COPY[w.code]?.short || w.text, 'yellow'));
    note(`HTTP ${page.status} · ${(page.bytes / 1024).toFixed(0)} KB of HTML in ${((performance.now() - t0) / 1000).toFixed(1)}s`, 'green');
    if (page.redirects?.length) note(`Followed ${page.redirects.length} redirect${page.redirects.length > 1 ? 's' : ''} to ${page.finalUrl}`, 'yellow');
    if (page.truncated) note('HTML larger than 4 MB; measured the first 4 MB', 'yellow');

    progress(1, 0.6);
    stage = 'read';
    await tick(500);
    let result;
    try { result = GEO.analyze(page.html, url, page); }
    catch (e) { throw new AuditError('PARSE', e.message); }
    result.fetchWarnings = page.warnings || [];
    const [d1, d2, d3, d4] = result.dimensions;
    note(`${result.measure.headings.length} content headings · ${result.measure.substantiveChars.toLocaleString('en-US')} chars of substantive text`);
    if (result.measure.jsHeavy) note('Very little text in the raw HTML; the content likely renders with JavaScript', 'red');

    progress(2, 0.85); await tick();
    note(`D1 URL & Page Context: ${d1.score}/100`, colorOf(d1.score));
    progress(3, 0.85); await tick();
    note(`D2 Page Structure: ${d2.score}/100`, colorOf(d2.score));
    progress(4, 0.85); await tick();
    note(`D3 Answerability & Content Depth: ${d3.score}/100`, colorOf(d3.score));
    progress(5, 0.85); await tick();
    note(`D4 Schema Markup: ${d4.score}/100`, colorOf(d4.score));

    stage = 'gemini';
    lastAudit.result = result;
    await geminiStage(result, apiKey);
  } catch (err) {
    console.error(err);
    const e = err instanceof AuditError ? err : new AuditError('UNKNOWN', err.message);
    note(copyFor(e).title, 'red');
    setTimeout(() => renderError(url, e, stage), 900);
  }
}

async function geminiStage(result, apiKey) {
  progress(6, 4);
  note('Reading the page like an answer engine: heading labels, the opening, citable facts');
  const t1 = performance.now();
  const stopPacing = modelPacing();
  let judgment;
  try { judgment = await JUDGE.judge(apiKey, result, note); }
  finally { stopPacing(); }
  GEO.applyJudgment(result, judgment);
  note(`AI judgment applied in ${((performance.now() - t1) / 1000).toFixed(1)}s`, 'green');
  progress(9);
  note(`GEO Readiness: ${result.overallScore}/100`, colorOf(result.overallScore));
  finishLoading();
  currentData = result;
  setTimeout(() => { renderDashboard(result); showScreen('screen-dashboard'); requestAnimationFrame(animateResults); }, 500);
}

// ===== VIDEO RUN =====
// One long call does the whole job, so the steps advance on a schedule rather than on real
// events, and the bar keeps moving underneath them. Watching a video takes minutes, not seconds.
function videoPacing() {
  const t0 = performance.now();
  const steps = document.querySelectorAll('.step-item');
  const timers = [
    setTimeout(() => progress(1, 30), 2500),
    setTimeout(() => progress(2, 25), 25000),
    setTimeout(() => progress(3, 25), 50000),
    setTimeout(() => progress(4, 25), 75000),
    setTimeout(() => progress(5, 25), 100000),
    setTimeout(() => progress(6, 25), 125000),
    setTimeout(() => { progress(7, 30); note('Scoring against the rubric'); }, 150000),
    setTimeout(() => note('Still watching. A long video takes longer.', 'yellow'), 90000),
    setTimeout(() => note('Nearly there. Waiting for the model to finish.', 'yellow'), 200000)
  ];
  const ticker = setInterval(() => {
    aimPct(Math.min(((currentStep + 2) / steps.length) * 100 - 2, 96), 40);
    const active = steps[currentStep];
    if (!active) return;
    let t = active.querySelector('.step-time');
    if (!t) { t = document.createElement('span'); t.className = 'step-time'; active.appendChild(t); }
    t.textContent = Math.floor((performance.now() - t0) / 1000) + 's';
  }, 1000);
  return () => { timers.forEach(clearTimeout); clearInterval(ticker); };
}

async function runVideoAnalysis(url, apiKey) {
  resetLoading();
  lastAudit = { url, result: null, stage: 'gemini' };
  try {
    progress(0, 3);
    // oEmbed is YouTube's own public endpoint and needs no key. It is the only part of the page
    // we can read for ourselves, and handing the model the real title saves it guessing at one.
    let known = null;
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (r.ok) { const j = await r.json(); known = { title: j.title, channel: j.author_name }; }
    } catch {}
    if (known?.title) note(known.title, 'green');
    else note('YouTube did not return the title, so the model is asked to read it', 'yellow');

    note(`Sending ${url} to the model`);
    note('The model watches the video and opens the watch page for what is written around it', 'blue');
    const t0 = performance.now();
    const stop = videoPacing();
    let obs;
    try { obs = await JUDGE.watchVideo(apiKey, url, YTGEO.OBS_SCHEMA, YTGEO.prompt(url, known), note); }
    finally { stop(); }

    const result = YTGEO.build(obs, url, known);
    note(`Watched in ${((performance.now() - t0) / 1000).toFixed(1)}s`, 'green');
    note(`${YTGEO.fmt(obs.durationSeconds)} long \u00b7 ${(obs.quotable || []).length} quotable lines \u00b7 ${(obs.citableFacts || []).length} citable facts`);
    if (!obs.chaptersKnown) note('Chapter markers were not visible, so that group is not scored', 'yellow');
    if (!obs.metadataSeen) note('The description could not be read, so those groups are not scored', 'yellow');
    progress(8, 1);
    progress(9);
    note(`GEO Readiness: ${result.overallScore}/100`, colorOf(result.overallScore));
    finishLoading();
    currentData = result;
    lastAudit.result = result;
    setTimeout(() => { renderDashboard(result); showScreen('screen-dashboard'); requestAnimationFrame(animateResults); }, 500);
  } catch (err) {
    console.error(err);
    const e = err instanceof AuditError ? err : new AuditError('UNKNOWN', err.message);
    note(copyFor(e).title, 'red');
    setTimeout(() => renderError(url, e, 'gemini'), 900);
  }
}

// Re-runs only the Gemini step; the page was already fetched and measured.
async function resumeGemini() {
  const { url, result } = lastAudit;
  document.getElementById('loading-url').textContent = url;
  showScreen('screen-loading');
  resetLoading();
  progress(5);
  note('Page measurements kept from the last run', 'green');
  try {
    await geminiStage(result, readStoredKey());
  } catch (err) {
    const e = err instanceof AuditError ? err : new AuditError('UNKNOWN', err.message);
    note(copyFor(e).title, 'red');
    setTimeout(() => renderError(url, e, 'gemini'), 900);
  }
}

// ===== ERROR COPY =====
// Plain-language copy for every failure: what happened, why, what the user can do,
// and what the tool cannot do. Technical codes stay in the collapsed details.
const GEO_WALL = 'AI search engines visit pages much like this analysis does. If we cannot open the page, they most likely cannot either, so it will not appear in AI answers until this is fixed.';
const ERROR_COPY = {
  BAD_URL: { title: 'This doesn’t look like a web address', body: 'Check that the full address is there, starting with https://.', action: 'edit' },
  BAD_SCHEME: { title: 'We can only open web pages', body: 'Addresses that start with http:// or https:// work. Files and app links can’t be analyzed.', action: 'edit' },
  PRIVATE: { title: 'This page is on a private network', body: 'We analyze pages anyone can open on the internet, the same way AI search engines see them. Internal or company-network pages can’t be checked.', action: 'edit' },
  DNS: { title: 'We couldn’t find this website', body: 'The address may have a typo, or the domain may not be live yet.', tips: ['Check the spelling of the address.', 'Open it in your browser to make sure it loads.'], action: 'edit' },
  REFUSED: { title: 'The website isn’t accepting visitors right now', body: 'Its server may be down, or open only to certain networks.', tips: ['Try again in a few minutes.'], action: 'retry' },
  RESET: { title: 'The website ended the connection', body: 'Some sites turn away automated visits partway through.', tips: ['Try again. If it keeps happening, the site is likely blocking automated visitors.'], geo: true, action: 'retry' },
  TIMEOUT: { title: 'The website took too long to respond', body: 'We waited 20 seconds without an answer. The site may be slow, or hard to reach from our server.', tips: ['Try again in a moment.'], geo: true, action: 'retry' },
  CERT_EXPIRED: { title: 'This website’s security certificate has expired', body: 'Browsers show a warning for this site, and AI search engines usually skip it.', tips: ['Let the site owner know the certificate needs renewing.'], geo: true, action: 'edit' },
  CERT_SELF_SIGNED: { title: 'This website’s security certificate isn’t trusted', body: 'It wasn’t issued by a recognized authority, so standard tools refuse to open the page.', tips: ['The site owner needs a certificate from a trusted authority.'], geo: true, action: 'edit' },
  CERT_HOST: { title: 'The security certificate belongs to another address', body: 'The site shows a certificate made for a different domain, so the connection can’t be trusted.', tips: ['Check the address. If it’s correct, let the site owner know.'], geo: true, action: 'edit' },
  CERT_CHAIN: { title: 'This website’s security setup is incomplete', body: 'Part of its security certificate is missing. Browsers fill the gap on their own, but most AI search engines don’t.', tips: ['Ask the site owner to install the full certificate chain.'], geo: true, action: 'edit' },
  TLS_OTHER: { title: 'We couldn’t open a secure connection', body: 'The site’s HTTPS settings aren’t accepted by standard tools.', tips: ['Let the site owner know their HTTPS setup needs a check.'], geo: true, action: 'edit' },
  REDIRECTS: { title: 'This page keeps redirecting', body: 'It sends visitors from one address to another in a loop.', tips: ['Open it in your browser to see where it ends up, then analyze that address.'], action: 'edit' },
  HTTP_401: { title: 'This page needs a login', body: 'We can only analyze pages anyone can see without signing in, the same pages AI search engines can read.', action: 'edit' },
  HTTP_403: { title: 'This website blocked our visit', body: 'It turns away automated visitors.', tips: ['If this is your site, check its bot and firewall settings.'], geo: true, action: 'edit' },
  HTTP_404: { title: 'We couldn’t find this page', body: 'It may have moved or been deleted.', tips: ['Check the address, or analyze the page it moved to.'], action: 'edit' },
  HTTP_410: { title: 'This page has been removed', body: 'The site says it’s gone for good.', tips: ['Analyze the page that replaced it.'], action: 'edit' },
  HTTP_429: { title: 'The website asked us to slow down', body: 'It received too many requests in a short time.', tips: ['Wait a minute, then try again.'], action: 'retry' },
  HTTP_451: { title: 'This website isn’t available in our server’s region', body: 'It limits visitors by location, and our analysis server runs in the United States, where many AI search engines also run.', geo: true, action: 'edit' },
  HTTP_5XX: { title: 'The website is having trouble right now', body: 'Its server returned an error. This is on the site’s side.', tips: ['Try again in a few minutes.'], action: 'retry' },
  HTTP_OTHER: { title: 'The website sent an unexpected response', body: 'We didn’t receive the page we expected.', tips: ['Open it in your browser to make sure it loads.'], action: 'retry' },
  NOT_HTML: { title: 'This address opens a file, not a web page', body: 'We analyze web pages written in HTML.', tips: ['Analyze the page that links to this file instead.'], action: 'edit' },
  EMPTY: { title: 'The page came back empty', body: 'The website sent no content.', tips: ['Try again, or open it in your browser to check.'], action: 'retry' },
  UNKNOWN: { title: 'We couldn’t open this page', body: 'Something went wrong while connecting to the website.', tips: ['Try again. If it keeps failing, check that the page opens in your browser.'], action: 'retry' },
  NETWORK: { title: 'You seem to be offline', body: 'We couldn’t reach the analysis service.', tips: ['Check your internet connection, then try again.'], action: 'retry' },
  SERVICE: { title: 'Our analysis service isn’t responding', body: 'This is a problem on our side, not yours.', tips: ['Try again in a moment.'], action: 'retry' },
  PARSE: { title: 'We couldn’t read this page’s content', body: 'The page opened, but its HTML couldn’t be analyzed.', tips: ['Try again, or try another page.'], action: 'retry' },
  KEY_INVALID: { title: 'This Gemini API key doesn’t work', body: 'Google didn’t accept the key. It may have a typo, or it may have been deleted.', tips: ['Copy the key again from Google AI Studio and paste it in.'], action: 'key' },
  KEY_PERMISSION: { title: 'This key can’t use Gemini yet', body: 'The Gemini API isn’t turned on for the project this key belongs to.', tips: ['Create a new key in Google AI Studio. New keys work right away.'], action: 'key' },
  QUOTA: { title: 'You’ve reached your Gemini usage limit', body: 'Free keys allow only a set number of requests per minute and per day.', tips: ['Wait a minute and try again.', 'If it keeps happening, try again tomorrow or use a key with a higher limit.'], action: 'retry' },
  GEMINI_BUSY: { title: 'Gemini is busy right now', body: 'Google’s service is temporarily overloaded.', tips: ['Try again in a minute.'], action: 'retry' },
  GEMINI_TIMEOUT: { title: 'Gemini took too long to answer', body: 'We waited 90 seconds. Longer pages take more time.', tips: ['Try again.'], action: 'retry' },
  GEMINI_NETWORK: { title: 'We couldn’t reach Gemini', body: 'Your network may be blocking Google’s API.', tips: ['Check your connection, or try a different network.'], action: 'retry' },
  GEMINI_BLOCKED: { title: 'Gemini couldn’t finish this analysis', body: 'It stopped without giving a result. This sometimes happens with certain page content.', tips: ['Try again. If it repeats, try a different page.'], action: 'retry' },
  GEMINI_BAD_OUTPUT: { title: 'Gemini’s answer came back incomplete', body: 'We couldn’t read the result it sent.', tips: ['Try again.'], action: 'retry' },
  MODEL_MISSING: { title: 'That Gemini model is no longer available', body: 'Google retires model names over time. We look up the models your key can run and switch automatically, so this usually clears on a retry.', tips: ['Try again.', 'If it repeats, remove and re-enter your key so we can pick a fresh model.'], action: 'retry' },
  GEMINI_OTHER: { title: 'Gemini couldn’t process the request', body: 'Google returned an error.', tips: ['Try again in a moment.'], action: 'retry' },
  VIDEO_UNSUPPORTED: { title: 'This key can’t watch videos', body: 'Video analysis needs the current Gemini API, and this key connected through the older one.', tips: ['Remove and re-enter your key so it connects again.', 'If it repeats, create a new key in Google AI Studio.'], action: 'key' }
};
const WARNING_COPY = {
  TLS_CHAIN_INCOMPLETE: {
    short: 'Security certificate incomplete; recovered it to continue',
    text: 'This site’s security setup is incomplete: part of its certificate is missing. We filled the gap to run this analysis, but most AI search engines won’t, so they may not be able to open this page at all. Ask the site owner to install the full certificate chain.'
  }
};
const STAGE_LABEL = { fetch: 'Opening the page', read: 'Reading the page', gemini: 'Asking Gemini' };
const ACTION_LABEL = { retry: 'Try again', edit: 'Change the address', key: 'Change the API key' };
let lastAudit = { url: '', result: null, stage: '' };

function copyFor(e) {
  const c = ERROR_COPY[e.code] || ERROR_COPY.UNKNOWN;
  return JUDGE.provider() === 'gemini' ? c : { ...c, title: brand(c.title), body: brand(c.body), tips: c.tips?.map(t => brand(t)) };
}

function renderError(url, e, stage) {
  const c = copyFor(e);
  lastAudit.url = url;
  lastAudit.stage = stage;
  if (e.code === 'KEY_INVALID' || e.code === 'KEY_PERMISSION') {
    storeKeyOk(false);
    setKeyUi('error', brand(KEY_STATUS_COPY[e.code]));
  }
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
      ${stage === 'gemini' && c.action === 'retry' && lastAudit.result ? '<p class="err-keep">Your page is already measured, so only the Gemini step will run again.</p>' : ''}
      ${geo ? `<div class="err-geo"><b>Why this matters for GEO</b><p>${GEO_WALL}</p></div>` : ''}
      <div class="err-actions">
        <button class="btn-primary err-btn" onclick="errorAction('${c.action}')">${ACTION_LABEL[c.action]}</button>
        ${c.action !== 'edit' ? `<button class="btn-ghost err-btn" onclick="errorAction('edit')">Analyze another page</button>` : ''}
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
  urlInput.value = lastAudit.url;
  if (action === 'retry') {
    if (lastAudit.stage === 'gemini' && lastAudit.result) resumeGemini();
    else startAnalysis();
    return;
  }
  if (action === 'key') { openKeyStep(); return; }
  showLanding();
  urlInput.focus();
  urlInput.select();
}

// ===== DASHBOARD =====
function colorOf(score) { return score >= 60 ? 'green' : score >= 40 ? 'yellow' : 'red'; }
function statusLabelFor(c) { return c === 'green' ? 'Reasonably Prepared' : c === 'yellow' ? 'Needs Improvement' : 'Needs Significant Improvement'; }
function dimLabelFor(c) { return c === 'green' ? 'Sufficient' : c === 'yellow' ? 'Needs Improvement' : 'Weak'; }
const HEX = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };

// The band is passed in, not worked out again here: the ring and the figure inside it read from
// one decision, so they can never end up in different colours.
function scoreRingSVG(score, size = 100, stroke = 8, band = colorOf(score)) {
  const r = (size - stroke) / 2;
  const c = Math.PI * 2 * r;
  const color = band;
  const bg = color === 'green' ? '#DCFCE7' : color === 'yellow' ? '#FEF3C7' : '#FEE2E2';
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${bg}" stroke-width="${stroke}" fill="none"/>
      <circle class="ring-arc" data-arc="${c * score / 100}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${HEX[color]}" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${c * score / 100} ${c}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
}

function renderCapture(c) {
  const badge = c.tone === 'good' ? '<span class="cap-badge good">WELL DONE</span>' : '<span class="cap-badge bad">WEAK</span>';
  return `<div class="cap cap-${c.tone}"><div class="cap-head">${badge}<span class="cap-caption">${c.caption}</span></div><pre>${c.code}</pre></div>`;
}

// Where a group's standard comes from. A reader weighing a score deserves to know which lines
// are Google's own words and which are ours, rather than having them all look equally settled.
function srcTag(g) {
  if (!g.src) return '';
  const official = g.src === 'Google guidance';
  const unseen = g.assessed === false ? '<span class="src-tag src-unseen">not assessed</span>' : '';
  return `<span class="src-tag${official ? ' src-official' : ''}">${GEO.esc(g.src)}</span>${unseen}`;
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
        <span class="check-group-name">${GEO.esc(g.name)}${g.band ? judgedTag(g) : ''}${srcTag(g)}</span>
        <span class="check-group-pts">${g.points}<span class="mx"> / ${g.max}</span></span>
      </div>
      <div class="group-gauge"><div class="group-gauge-fill" style="width:${g.points / g.max * 100}%;background:${HEX[color]}"></div></div>
      ${rows}${band}${evi}
    </div>`;
}

function renderDashboard(d) {
  const video = d.kind === 'youtube';
  const sc = colorOf(d.overallScore);
  const t = d.templates;
  const when = new Date(d.fetchedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const notices = [
    ...(d.fetchWarnings || []).map(w => `<div class="notice warn">${WARNING_COPY[w.code]?.text || GEO.esc(w.text)}</div>`),
    d.measure.jsHeavy && `<div class="notice warn">The raw HTML carries very little text (${d.measure.substantiveChars.toLocaleString('en-US')} chars). The page most likely renders its content with JavaScript, which AI crawlers that do not run scripts never see. The scores below reflect that crawler view.</div>`,
    d.redirects.length && `<div class="notice info">The requested URL redirected; the analysis measures the final page.</div>`
  ].filter(Boolean).join('');

  document.getElementById('dash-content').innerHTML = `
    ${notices}
    <section class="hero-section">
      <div class="hero-top">
        <div class="hero-score-area">
          <div class="hero-score-ring">
            ${scoreRingSVG(d.overallScore, 100, 8, sc)}
            <div class="hero-score-value score-${sc}">${d.overallScore}</div>
          </div>
          <div class="hero-score-label">GEO Readiness</div>
        </div>
        <div class="hero-meta hero-meta-right">
          <div class="hero-url-label">Analyzed URL</div>
          <a class="hero-url-link" href="${GEO.esc(d.url)}" target="_blank" rel="noopener" title="${GEO.esc(d.url)}">${GEO.esc(d.url)}</a>
          <div class="hero-timestamp">Analyzed ${GEO.esc(when)}</div>
        </div>
      </div>
      <div class="hero-badge-row"><span class="hero-badge badge-${sc}">${statusLabelFor(sc)}</span></div>
      <h2 class="hero-headline">${GEO.esc(t.headline)}</h2>
      <div class="hero-strengths-weaknesses">
        <div class="sw-column"><h4 class="sw-good">Strengths</h4>
          ${(t.strengths.length ? t.strengths : ['No checklist group earns full marks yet']).map(s => `<div class="sw-item"><span class="sw-icon green">✓</span><span>${GEO.esc(s)}</span></div>`).join('')}
        </div>
        <div class="sw-column"><h4 class="sw-bad">Weaknesses</h4>
          ${(t.weaknesses.length ? t.weaknesses : ['No failed checks']).map(w => `<div class="sw-item"><span class="sw-icon red">✗</span><span>${GEO.esc(w)}</span></div>`).join('')}
        </div>
      </div>
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
            ${dim.assessedPoints === 0
              ? `<div class="score-card-score"><span class="num num-unscored">Not assessed</span></div>
                 <div class="cap-note">Nothing in this dimension could be looked at, so it is left out of the overall score rather than counted as a failure.</div>`
              : `<div class="score-card-score"><span class="num score-${dc}">${dim.score}</span><span class="total">/ 100</span><span class="score-card-badge badge-${dc}">${dimLabelFor(dc)}</span></div>`}
            ${dim.capped ? `<div class="cap-note">Checks sum to ${dim.rawScore}; shown as ${dim.score} because no score reaches 100 (headroom above best practice is reserved).</div>` : ''}
            <ul class="diag-list">${pd.diagnosis.map(x => `<li>${GEO.esc(x)}</li>`).join('')}</ul>
            <div class="score-breakdown">
              <div class="breakdown-header"><span class="breakdown-label">SCORING BREAKDOWN</span></div>
              ${dim.breakdown.map(renderCheckGroup).join('')}
            </div>
            ${video ? '' : `<div class="ai-box" id="ai-${dim.key}"></div>`}
          </div>`;
      }).join('')}
    </div>

    ${video ? `<details class="err-tech vid-tech">
      <summary>What the model reported</summary>
      <pre>model            ${GEO.esc(JUDGE.MODEL)}
duration         ${GEO.esc(YTGEO.fmt(d.observed?.durationSeconds))}  (${GEO.esc(String(d.observed?.durationSeconds))}s)
metadata seen    ${d.observed?.metadataSeen ? 'yes' : 'no'}
title            ${GEO.esc(d.knownTitle || '(none)')}${d.knownTitle ? '  (from YouTube oEmbed)' : ''}
answer bar       within ${GEO.esc(YTGEO.fmt(d.bars?.answerBy))}, scaled to this video's length
intro bar        within ${GEO.esc(YTGEO.fmt(d.bars?.startBy))}
description      ${GEO.esc(String(d.observed?.descriptionWords))} words
chapters seen    ${d.observed?.chaptersKnown ? `yes, ${(d.observed?.chapterTitles || []).length}` : 'no'}
quotable lines   ${(d.observed?.quotable || []).length}
citable facts    ${(d.observed?.citableFacts || []).length}
first quote      ${GEO.esc(((d.observed?.quotable || [])[0]?.quote || '(none)')).slice(0, 90)}
at               ${GEO.esc((d.observed?.quotable || [])[0]?.at || '-')}</pre>
      <p class="tech-note">If the duration is wrong, or a timestamp falls outside the video, the model did not watch it and nothing above can be trusted.</p>
    </details>` : ''}
    <div class="method-box">
      ${video ? `<b>How this analysis works.</b> YouTube serves an automated fetch an empty shell, and a video's transcript is not available for a video you do not own, so nothing here is scraped. The model is given the public YouTube URL and watches the video itself, walking the timeline and reading the transcript as it goes.
      It reports only observations, each with a quote and a timestamp you can jump to. The rubric on this page turns those observations into points; the model never sets a score.
      ${d.assessedPoints < d.totalPoints ? `Of ${d.totalPoints} points in the rubric, ${d.assessedPoints} could be looked at in this video. Anything the model could not see is left out of the total rather than counted as a failure.` : ''}
      The weighting follows Google. YouTube's own help puts title and description at the top of what matters for discovery, Search Central names the description's timestamp list as the way key moments are found, and the generative AI guide says the only technical requirement is that a page be indexed and able to show a snippet. Those carry ${d.officialPoints} of the ${d.totalPoints} points, and each group on this page says whether its standard is Google's or ours.
      Overall = D1×0.30 + D2×0.30 + D3×0.25 + D4×0.15, rounded. Because a video is judged by watching rather than by counting markup, these readings are less independently checkable than a page audit; the timestamps are there so you can check them yourself.` : `<b>How this analysis works.</b> The page is fetched once as raw HTML, the view of AI crawlers that do not execute JavaScript. Navigation, header and footer are excluded from content measures.
      Overall = D1×0.15 + D2×0.35 + D3×0.35 + D4×0.15, rounded. Evidence follows one rule: a full-mark group shows one passing example, a partial group shows one passing and one weak example, a zero group shows the weak evidence only.
      Heading quality, the opening answer, citable facts and first-hand experience need reading comprehension and are judged by Gemini on the same bands; all other items are counted directly from the HTML. E-E-A-T signals (reviews, author, dates, outside sources) are detected in the HTML; a full review of the expertise itself still needs a person. AI suggested fixes are drafts and never change the score.`}
    </div>`;
  if (!video) FIXES.init(d);

  // The skeleton belongs to a page, not a video: there is no HTML behind a video to draw.
  const rail = document.getElementById('dash-rail');
  if (rail) {
    rail.hidden = video;
    rail.innerHTML = video ? '' : SKEL.build(d);
    document.getElementById('dash-split')?.classList.toggle('has-rail', !video);
    if (!video) { requestAnimationFrame(() => SKEL.fit()); }
  }
}

// ===== RESULTS MOTION =====
// The figures arrive the way they were measured: the ring sweeps round, the gauges fill and the
// numbers climb. A card below the fold waits until it is on screen, so nothing is missed.
function animateResults() {
  const root = document.getElementById('dash-content');
  if (!root || reducedMotion() || !root.animate) return;

  const ring = root.querySelector('.ring-arc');
  if (ring) ring.animate([{ strokeDashoffset: +ring.dataset.arc }, { strokeDashoffset: 0 }], { duration: 1100, easing: EASE });
  const hero = root.querySelector('.hero-score-value');
  if (hero) countFromZero(hero, 1100);

  const fill = card => {
    if (card.dataset.filled) return;
    card.dataset.filled = '1';
    const num = card.querySelector('.score-card-score .num:not(.num-unscored)');
    if (num) countFromZero(num, 900);
    card.querySelectorAll('.group-gauge-fill').forEach((g, i) => {
      g.animate([{ width: '0%' }, { width: g.style.width }], { duration: 760, delay: 80 + i * 70, easing: EASE, fill: 'backwards' });
    });
  };

  // Whatever is already on screen starts in this frame; the observer would cost a frame, and the
  // figure would be read before it climbed.
  const cards = [...root.querySelectorAll('.score-card')];
  cards.forEach(c => { const r = c.getBoundingClientRect(); if (r.top < innerHeight * 0.88 && r.bottom > 0) fill(c); });
  const rest = cards.filter(c => !c.dataset.filled);
  if (!rest.length) return;
  if (!window.IntersectionObserver) { rest.forEach(fill); return; }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => { if (e.isIntersecting) { fill(e.target); obs.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px' });
  rest.forEach(c => io.observe(c));
}

// ===== EVIDENCE DISCLOSURE MOTION =====
// Animates <details class="evi"> open and close; a click mid-animation reverses from the current height.
const EVI_MS = 280;
const EVI_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
// Opening a piece of evidence points at where it came from, so "the model read this" has a place
// on the page rather than being a claim on its own.
document.addEventListener('click', e => {
  const sum = e.target.closest('details.evi > summary');
  if (sum && typeof SKEL !== 'undefined') {
    const det = sum.parentElement;
    if (det.open) SKEL.clear();
    else {
      const group = det.closest('.check-group')?.querySelector('.check-group-name')?.textContent || '';
      SKEL.light(group, det.querySelector('.evi-body')?.textContent || '');
    }
  }
}, true);

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

// ===== GEMINI KEY =====
// No audit can run without a Gemini key, so the key comes first: the first touch on the URL
// field opens a dialog over a blurred landing. Once the key is confirmed the dialog closes,
// and an audit that was already requested continues on its own.
const KEY_OK_STORE = 'geoa_key_ok';
const KEY_STATUS_COPY = {
  checking: 'Checking your key with Google…',
  ok: 'Connected. Starting the analysis…',
  nudge: 'Enter your API key to run the analysis.',
  KEY_INVALID: 'This key doesn’t work. Try copying it again.',
  KEY_PERMISSION: 'This key can’t use Gemini yet. Create a new one in Google AI Studio.',
  QUOTA: 'This key has reached its limit for now. Try again in a minute.',
  GEMINI_NETWORK: 'We couldn’t check the key. Check your connection, then try again.',
  GEMINI_TIMEOUT: 'Checking took too long. Try again.',
  MODEL_MISSING: 'No Gemini model is available for this key right now. Try again.',
  other: 'We couldn’t check this key. Try again.'
};
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
let keyState = 'empty';
let keyCheck = null;
let continueAfterKey = null;
let awaitingKeyTrip = false;
const panelEl = () => document.getElementById('key-panel');
const cardEl = () => panelEl().querySelector('.key-modal-card');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function readKeyOk() { try { return localStorage.getItem(KEY_OK_STORE) === '1'; } catch { return false; } }
function storeKeyOk(v) { try { v ? localStorage.setItem(KEY_OK_STORE, '1') : localStorage.removeItem(KEY_OK_STORE); } catch {} }

// The line under the URL bar always says where the key stands: which model is connected, or none yet.
function syncConnected() {
  const ok = keyState === 'ok';
  document.querySelectorAll('.key-connected').forEach(line => {
    line.hidden = !panelEl().hidden;
    line.dataset.state = ok ? 'ok' : 'off';
    line.querySelector('.key-connected-label').textContent = ok ? `${JUDGE.modelLabel()} connected` : 'No API key connected';
    line.querySelector('.key-connected-action').textContent = ok ? 'Change' : 'Connect';
  });
}
function keyLineAction() {
  if (keyState === 'ok') { changeKey(); return; }
  continueAfterKey = null;
  openKeyPanel({ nudge: true });
}
// Copy is written for Gemini. Other providers get their own names in the same sentences.
function brand(s, key) {
  const provider = key ? JUDGE.detect(key) : JUDGE.provider();
  if (provider === 'gemini' || !s) return s;
  const p = key ? JUDGE.providerNameFor(key) : JUDGE.providerName();
  return String(s).replace(/Google AI Studio/g, JUDGE.consoleName()).replace(/Google[’']s/g, p + '’s').replace(/Google/g, p).replace(/Gemini/g, p);
}

function setKeyUi(state, message = '') {
  const prev = keyState;
  keyState = state;
  const panel = panelEl();
  const input = document.getElementById('api-key-input');
  // The key is checked automatically, so the button reports state rather than asking for a click.
  const btn = document.getElementById('kp-continue');
  const hasKey = !!input.value.trim();
  const label = { empty: hasKey ? 'Check key' : 'Paste a key', checking: 'Checking…', error: 'Key not valid', ok: 'Connected' };
  // Every state change glides: the card eases to its new height while changed text rolls in.
  morphHeight(cardEl(), () => {
    panel.dataset.state = state;
    input.classList.toggle('input-error', state === 'error');
    swapText(document.getElementById('key-msg'), message || (state === 'checking' ? KEY_STATUS_COPY.checking : ''));
    btn.disabled = state !== 'empty' || !hasKey;
    swapText(btn.querySelector('.kp-btn-label'), label[state] || 'Check key');
  });
  if (state === 'error' && prev !== 'error') nudge(panel.querySelector('.kp-row'));
  syncConnected();
}

function openKeyPanel({ changing = false, nudge = false } = {}) {
  if (!document.getElementById('screen-landing').classList.contains('active')) showLanding();
  const panel = panelEl();
  panel.dataset.changing = changing ? '1' : '';
  swapText(document.getElementById('kp-title'), changing ? 'Change your API key' : 'Enter API key to continue');
  if (panel.hidden) {
    panel.hidden = false;
    if (!reducedMotion() && panel.animate) {
      panel.querySelector('.key-modal-backdrop').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      cardEl().animate([{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE });
    }
  }
  if (changing) setKeyUi(keyState, 'Your current key works. Paste a new one to replace it.');
  else if (nudge && keyState === 'empty') setKeyUi('empty', KEY_STATUS_COPY.nudge);
  syncConnected();
  const input = document.getElementById('api-key-input');
  input.focus({ preventScroll: true });
  input.select();
}

function closeKeyPanel(then) {
  const panel = panelEl();
  if (panel.hidden) { if (then) then(); return; }
  const anims = [];
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    anims.forEach(a => a.cancel());
    panel.hidden = true;
    panel.dataset.changing = '';
    settleMorph(cardEl());
    setStepsOpen(false);
    syncConnected();
    if (then) then();
  };
  if (reducedMotion() || !panel.animate) { finish(); return; }
  anims.push(panel.querySelector('.key-modal-backdrop').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }));
  anims.push(cardEl().animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.98)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }));
  anims[1].onfinish = finish;
  // Animations pause in background tabs; complete the step regardless.
  setTimeout(finish, 350);
}

// Closing without a key is allowed; the next attempt to audit opens the dialog again.
function dismissKeyPanel() {
  continueAfterKey = null;
  awaitingKeyTrip = false;
  if (keyState === 'ok') document.getElementById('api-key-input').value = readStoredKey();
  // Focusing the URL field would reopen the dialog, so leave focus on the page itself.
  closeKeyPanel(() => document.activeElement?.blur());
}

// No motion for reduced-motion users, old browsers, or anything not on screen.
function quietMotion(el) { return reducedMotion() || !el.animate || !!el.closest('[hidden]'); }

// Replaces an element's text and lets the new text rise into place.
function swapText(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  if (!text || quietMotion(el)) return;
  el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE });
}

// A small sideways settle marks a rejected key without alarm.
function nudge(el) {
  if (quietMotion(el)) return;
  el.animate([{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-1.5px)' }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
}

// Animates an element's height across a DOM change. A change that lands mid-animation
// continues from the current height instead of snapping.
function morphHeight(el, change) {
  const from = el.offsetHeight;
  settleMorph(el);
  change();
  const to = el.offsetHeight;
  if (from !== to && !quietMotion(el)) startMorph(el, from, to);
}

function startMorph(el, from, to, after = null) {
  const anim = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 280, easing: EASE });
  el._morph = anim;
  el._afterMorph = after;
  el.style.overflow = 'hidden';
  const done = () => { if (el._morph === anim) settleMorph(el); };
  anim.onfinish = done;
  // Animations pause in background tabs; settle regardless.
  setTimeout(done, 600);
}

function settleMorph(el) {
  const anim = el._morph;
  const after = el._afterMorph;
  el._morph = el._afterMorph = null;
  if (anim) { anim.cancel(); el.style.overflow = ''; }
  if (after) after();
}

function setStepsOpen(open) {
  document.getElementById('kp-steps').hidden = !open;
  const btn = document.getElementById('kp-help-btn');
  btn.setAttribute('aria-expanded', String(open));
  swapText(btn, open ? 'Hide steps' : 'Don’t have one?');
}

// "Don't have one?" reveals the step-by-step guide only for people who ask for it.
// Opening slides the steps in as the card grows; closing lets the card close over them as they fade.
function toggleKeySteps() {
  const card = cardEl();
  const steps = document.getElementById('kp-steps');
  const stepsOpen = () => document.getElementById('kp-help-btn').getAttribute('aria-expanded') === 'true';
  if (!stepsOpen()) {
    morphHeight(card, () => setStepsOpen(true));
    if (!quietMotion(steps)) steps.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 280, delay: 40, easing: EASE, fill: 'backwards' });
    return;
  }
  const from = card.offsetHeight;
  settleMorph(card);
  setStepsOpen(false);
  const to = card.offsetHeight;
  if (from === to || quietMotion(card)) return;
  steps.hidden = false;
  const fade = steps.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
  startMorph(card, from, to, () => { fade.cancel(); steps.hidden = !stepsOpen(); });
}

function keyTripStarted() { awaitingKeyTrip = true; }

function returnedFromKeyTrip() {
  if (!awaitingKeyTrip || panelEl().hidden || keyState === 'ok') return;
  awaitingKeyTrip = false;
  setKeyUi(keyState === 'error' ? 'error' : 'empty', 'Welcome back. Paste your key here.');
  document.getElementById('api-key-input').focus({ preventScroll: true });
}

function connectKey() {
  const input = document.getElementById('api-key-input');
  if (!input.value.trim()) { setKeyUi('error', 'Paste your API key first.'); input.focus(); return; }
  checkKey(input.value);
}

async function checkKey(raw, { silent = false } = {}) {
  const key = raw.trim();
  if (!key) { setKeyUi('empty'); return false; }
  if (!silent) setKeyUi('checking', `Checking your key with ${JUDGE.vendorFor(key)}…`);
  const run = keyCheck = JUDGE.verifyKey(key);
  const res = await run;
  if (run !== keyCheck) return false;
  keyCheck = null;
  if (res.ok) {
    storeKey(key);
    storeKeyOk(true);
    if (silent) {
      setKeyUi('ok');
      if (!panelEl().hidden && panelEl().dataset.changing !== '1') closeKeyPanel();
      return true;
    }
    const next = continueAfterKey;
    continueAfterKey = null;
    swapText(document.getElementById('kp-title'), 'API key connected');
    setKeyUi('ok', next ? 'Starting the analysis…' : 'You’re all set. Paste a page URL to analyze.');
    // Leave right after the success mark finishes (about 0.7s) so there is no idle pause.
    setTimeout(() => closeKeyPanel(() => {
      if (next) next();
      else document.getElementById('url-input').focus({ preventScroll: true });
    }), 950);
    return true;
  }
  if (silent && (res.code === 'GEMINI_NETWORK' || res.code === 'GEMINI_TIMEOUT')) return keyState === 'ok';
  storeKeyOk(false);
  const stale = silent && (res.code === 'KEY_INVALID' || res.code === 'KEY_PERMISSION');
  setKeyUi('error', stale ? 'Your saved key no longer works. Paste a new one.' : brand(KEY_STATUS_COPY[res.code] || KEY_STATUS_COPY.other, key));
  return false;
}

// From the error screen: fix the key, then pick up where the audit stopped.
function openKeyStep() {
  continueAfterKey = lastAudit.stage === 'gemini' && lastAudit.result ? resumeGemini : startAnalysis;
  openKeyPanel();
}

function changeKey() {
  continueAfterKey = null;
  openKeyPanel({ changing: true });
}


// Keeps keyboard focus inside the dialog while it is open.
function onDialogKey(e) {
  if (e.key === 'Escape') { dismissKeyPanel(); return; }
  if (e.key !== 'Tab') return;
  const items = [...cardEl().querySelectorAll('button, input, a[href]')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ===== AUDIT TYPES =====
// One motion for everything that changes with the type: what leaves fades out where it stands,
// what arrives rises a few pixels into place. The two never share the screen.
const SWAP_OUT = { duration: 110, easing: 'ease-in', fill: 'forwards' };
const SWAP_IN = { duration: 320, delay: 120, easing: EASE, fill: 'backwards' };
const SWAP_RISE = [{ opacity: 0, transform: 'translate3d(0, 7px, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }];
const SWAP_FADE = [{ opacity: 1 }, { opacity: 0 }];

// Platform is live; Social and YouTube are announced. Switching slides the panel sideways in
// tab order and re-keys the landing colors through body[data-mode].
const MODES = ['platform', 'social', 'youtube'];
// The sub-brand is the platform's own wordmark. Drop the official file at brand/<type>.svg
// (see brand/README.md) and it is used as is; until then the name stands in as text.
// ratio is the file's own aspect, so the box width is known before the image decodes.
const TYPE_BRAND = {
  social: { name: 'Instagram', height: 17, navHeight: 15, ratio: 148.36 / 32.8 },
  youtube: { name: 'YouTube', height: 14, navHeight: 12, ratio: 381 / 86 }
};
let landingMode = 'platform';
let modeToken = 0;
function setMode(mode) {
  if (!MODES.includes(mode) || mode === landingMode) return;
  const prev = document.querySelector(`.mode-slide[data-mode="${landingMode}"]`);
  const next = document.querySelector(`.mode-slide[data-mode="${mode}"]`);
  const nextOnTop = MODES.indexOf(mode) > MODES.indexOf(landingMode);
  landingMode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => {
    const on = t.dataset.mode === mode;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  positionModeIndicator();
  setSubBrand(mode);

  // Subtree, so a half-finished swap from a quick switch is cleared too.
  const token = ++modeToken;
  document.querySelectorAll('.mode-slide').forEach(s => s.getAnimations({ subtree: true }).forEach(an => an.cancel()));
  next.inert = false;
  next.setAttribute('aria-hidden', 'false');
  prev.inert = true;
  prev.setAttribute('aria-hidden', 'true');
  if (reducedMotion() || !prev.animate) return;

  // The two lines of copy never share the screen: the old one is gone before the new one
  // arrives, so there is no doubled text and nothing slides under the reader's eye.
  // Text travels the way the tabs do: a step to the right arrives from the right. Nine pixels,
  // so it reads as direction rather than movement, and on the wordmark's timing so the whole
  // title area settles at once.
  const dir = nextOnTop ? 1 : -1;
  const at = x => `translate3d(${x}px, 0, 0)`;
  ['.product-tagline', 'input'].forEach(sel => {
    prev.querySelector(sel)?.animate([{ opacity: 1, transform: at(0) }, { opacity: 0, transform: at(-9 * dir) }], SWAP_OUT);
    next.querySelector(sel)?.animate([{ opacity: 0, transform: at(9 * dir) }, { opacity: 1, transform: at(0) }], SWAP_IN);
  });

  // The button is one pill throughout: both copies take the same width, and the one underneath
  // stays solid while the one on top crosses it, so it never thins or shows the bar through.
  const pBtn = prev.querySelector('.btn-primary'), nBtn = next.querySelector('.btn-primary');
  if (pBtn && nBtn) {
    const from = pBtn.offsetWidth, to = nBtn.offsetWidth;
    const top = nextOnTop ? nBtn : pBtn, under = nextOnTop ? pBtn : nBtn;
    const opts = { duration: 260, easing: EASE, fill: 'forwards' };
    top.animate([{ width: `${from}px`, opacity: nextOnTop ? 0 : 1 }, { width: `${to}px`, opacity: nextOnTop ? 1 : 0 }], opts);
    under.animate([{ width: `${from}px`, opacity: 1 }, { width: `${to}px`, opacity: 1 }], opts);
  }

  // Animations pause in background tabs, so clear the held end states on a timer either way.
  setTimeout(() => {
    if (token !== modeToken) return;
    [prev, next].forEach(s => s.getAnimations({ subtree: true }).forEach(an => an.cancel()));
  }, 420);
}

// The type's own wordmark under the title. The mark cross-fades and the box glides to the new
// width, so switching types reads as one movement instead of a swap.
// The same "for Instagram" mark the landing shows, beside the name on the inner screens, so the
// report looks like it belongs to the thing that was chosen.
function setAppBrand(mode) {
  const brand = TYPE_BRAND[mode];
  ['loading-for', 'dash-for'].forEach(id => {
    const slot = document.getElementById(id);
    if (!slot) return;
    slot.hidden = !brand;
    if (!brand) return;
    const mark = slot.querySelector('.app-for-mark');
    if (mark.dataset.mode === mode) return;
    mark.dataset.mode = mode;
    mark.innerHTML = '';
    const img = new Image();
    img.className = 'app-for-logo';
    img.alt = brand.name;
    img.height = brand.navHeight;
    img.onerror = () => { mark.textContent = brand.name; };
    img.src = `brand/${mode}.svg`;
    mark.appendChild(img);
  });
}

function setSubBrand(mode) {
  setAppBrand(mode);
  const line = document.getElementById('sub-brand');
  const mark = document.getElementById('sub-mark');
  const word = line.querySelector('.sub-for');
  const brand = TYPE_BRAND[mode];
  line.setAttribute('aria-hidden', String(!brand));

  const old = mark.lastElementChild;
  if (old && old.dataset.mode === mode) return;
  // "for" and the mark arrive and leave together, on the same curve: the line itself never fades,
  // or the word would be there before the logo it belongs to.
  if (!brand) {
    fadeWord(word, false, () => line.classList.remove('on'));
    fadeMark(old, false, () => { markWidth(mark, '0px', false); });
    return;
  }
  if (!old) { line.classList.add('on'); fadeWord(word, true); }

  // The files are preloaded, so the new mark is already there as the old one fades out.
  const img = new Image();
  img.className = 'sub-logo';
  img.dataset.mode = mode;
  img.alt = brand.name;
  img.height = brand.height;
  img.onerror = () => {
    const word = document.createElement('span');
    word.className = `sub-word ${mode}`;
    word.dataset.mode = mode;
    word.textContent = brand.name;
    img.replaceWith(word);
    mark.style.width = '';
  };
  img.src = `brand/${mode}.svg`;
  mark.appendChild(img);
  // Coming from Platform there is no old width to glide from, so the box takes its size at once
  // and the mark rises straight up instead of drifting in from the right.
  markWidth(mark, `${Math.round(brand.height * brand.ratio)}px`, !!old, `${brand.height}px`);
  fadeMark(old, false);
  fadeMark(img, true);
}

// Moves "for" exactly as the mark beside it moves. It stays put between two types: there it only
// glides sideways as the box changes width.
function fadeWord(el, show, after) {
  if (reducedMotion() || !el.animate) { after?.(); return; }
  // The fade out is held, so clear it before fading back in or the word snaps away at the end.
  el.getAnimations().forEach(a => a.cancel());
  const a = el.animate(show ? SWAP_RISE : SWAP_FADE, show ? SWAP_IN : SWAP_OUT);
  if (!after) return;
  let done = false;
  const once = () => { if (!done) { done = true; after(); } };
  a.onfinish = once;
  setTimeout(once, 400);
}

// Sets the wordmark box's width. It glides only when there are two marks to glide between, and
// then only for as long as the old mark takes to fade, so the new one arrives at a settled spot.
function markWidth(mark, width, glide, height) {
  if (!glide) mark.style.transition = 'none';
  mark.style.width = width;
  if (height !== undefined) mark.style.height = height;
  if (!glide) { mark.getBoundingClientRect(); mark.style.transition = ''; }
}

// Fades one wordmark in, rising into place, or out and away. The timeout stands in for onfinish
// when the tab is hidden and animations are paused.
function fadeMark(el, show, after) {
  if (!el) { after?.(); return; }
  if (show) {
    if (!reducedMotion() && el.animate) el.animate(SWAP_RISE, SWAP_IN);
    return;
  }
  const drop = () => { el.remove(); after?.(); };
  if (reducedMotion() || !el.animate) { drop(); return; }
  let done = false;
  const once = () => { if (!done) { done = true; drop(); } };
  el.animate(SWAP_FADE, SWAP_OUT).onfinish = once;
  setTimeout(once, 400);
}

// Keeps the tint pill on the active tab. Measured, so it survives font loads and resizes.
function positionModeIndicator(animate = true) {
  const tabs = document.querySelector('.mode-tabs');
  const ind = tabs?.querySelector('.mode-ind');
  const act = tabs?.querySelector('.mode-tab.active');
  if (!ind || !act) return;
  if (!animate || reducedMotion()) ind.style.transition = 'none';
  ind.style.width = `${act.offsetWidth}px`;
  ind.style.height = `${act.offsetHeight}px`;
  ind.style.transform = `translate(${act.offsetLeft}px, ${act.offsetTop}px)`;
  if (!animate || reducedMotion()) { ind.getBoundingClientRect(); ind.style.transition = ''; }
}

// ===== COMING SOON =====
// Social and YouTube are announced, not open: touching their bar explains what is coming.
const SOON_COPY = {
  social: 'The Social audit isn’t open yet. It will check profiles, posts and captions the same way, and your API key will work here too.',
  youtube: 'The YouTube audit isn’t open yet. It will check titles, chapters, descriptions and transcripts the same way, and your API key will work here too.'
};
const soonEl = () => document.getElementById('soon-panel');
function openSoonPanel(mode) {
  const panel = soonEl();
  document.getElementById('sp-sub').textContent = SOON_COPY[mode] || SOON_COPY.social;
  if (panel.hidden) {
    panel.hidden = false;
    if (!reducedMotion() && panel.animate) {
      panel.querySelector('.key-modal-backdrop').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      panel.querySelector('.key-modal-card').animate([{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE });
    }
  }
  panel.querySelector('.sp-cta').focus({ preventScroll: true });
}
function closeSoonPanel() {
  const panel = soonEl();
  if (panel.hidden) return;
  const anims = [];
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    // The fade out is held, so clear it here: otherwise the dialog reopens at nothing.
    anims.forEach(a => a.cancel());
    panel.hidden = true;
    document.activeElement?.blur();
  };
  if (reducedMotion() || !panel.animate) { finish(); return; }
  anims.push(panel.querySelector('.key-modal-backdrop').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }));
  anims.push(panel.querySelector('.key-modal-card').animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.98)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }));
  anims[1].onfinish = finish;
  // Animations pause in background tabs; complete the step regardless.
  setTimeout(finish, 350);
}

// ===== BOOT =====
(() => {
  document.querySelectorAll('.soon-bar').forEach(bar => {
    const mode = bar.closest('.mode-slide').dataset.mode;
    bar.addEventListener('pointerdown', e => { e.preventDefault(); openSoonPanel(mode); });
    bar.querySelector('input').addEventListener('focus', () => openSoonPanel(mode));
    bar.querySelector('.btn-soon').addEventListener('click', () => openSoonPanel(mode));
  });
  soonEl().addEventListener('keydown', e => { if (e.key === 'Escape') closeSoonPanel(); });
  const urlInput = document.getElementById('url-input');
  const keyInput = document.getElementById('api-key-input');
  document.querySelectorAll('.mode-tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  Object.keys(TYPE_BRAND).forEach(m => { const i = new Image(); i.src = `brand/${m}.svg`; });
  positionModeIndicator(false);
  document.fonts?.ready.then(() => positionModeIndicator(false));
  new ResizeObserver(() => positionModeIndicator(false)).observe(document.querySelector('.mode-tabs'));
  addEventListener('resize', () => { if (typeof SKEL !== 'undefined') SKEL.fit(); });
  document.querySelector('.mode-tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const m = MODES[(MODES.indexOf(landingMode) + (e.key === 'ArrowRight' ? 1 : -1) + MODES.length) % MODES.length];
    setMode(m);
    document.querySelector(`.mode-tab[data-mode="${m}"]`).focus();
    e.preventDefault();
  });
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) startAnalysis(); });
  urlInput.addEventListener('pointerdown', e => {
    if (keyState === 'ok') return;
    e.preventDefault();
    openKeyPanel();
  });
  urlInput.addEventListener('focus', () => { if (keyState !== 'ok') openKeyPanel(); });

  const videoInput = document.getElementById('video-input');
  videoInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) startVideoAnalysis(); });
  videoInput.addEventListener('input', () => setVideoError(''));
  videoInput.addEventListener('pointerdown', e => { if (keyState === 'ok') return; e.preventDefault(); openKeyPanel(); });
  videoInput.addEventListener('focus', () => { if (keyState !== 'ok') openKeyPanel(); });

  panelEl().addEventListener('keydown', onDialogKey);

  let keyTimer = null;
  let pasted = false;
  keyInput.addEventListener('paste', () => { pasted = true; });
  keyInput.addEventListener('input', () => {
    clearTimeout(keyTimer);
    const v = keyInput.value.trim();
    if (!v) { keyCheck = null; setKeyUi('empty'); return; }
    if (pasted) { pasted = false; checkKey(v); return; }
    setKeyUi('empty');
    keyTimer = setTimeout(() => checkKey(keyInput.value), 900);
  });
  keyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { clearTimeout(keyTimer); connectKey(); }
  });
  window.addEventListener('focus', returnedFromKeyTrip);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) returnedFromKeyTrip(); });

  const stored = readStoredKey();
  if (stored) JUDGE.prime(stored);
  const q = new URLSearchParams(location.search).get('url');
  keyInput.value = stored;
  // A shared ?url= link runs once; the address is cleared so a refresh returns to the landing.
  if (q) { urlInput.value = q; history.replaceState(null, '', location.pathname); }
  if (stored && readKeyOk()) {
    setKeyUi('ok');
    // A shared ?url= link only auto-runs once the saved key is confirmed again.
    checkKey(stored, { silent: true }).then(ok => { if (ok && q) startAnalysis(); });
  } else if (stored) checkKey(stored, { silent: true });
  else setKeyUi('empty');
  // Fills the line under every audit type, including the ones no key check touches.
  syncConnected();
})();
