// ===== GEO READINESS ENGINE =====
// Measures one page's raw HTML against the technical GEO checklist.
// Every point comes from a binary check or a stated band, so a person can re-verify it
// against the page source. Judgment items (heading quality, answer-first opening,
// concrete statements) start from heuristics and can be refined by judge.js.

const GEO = (() => {
  const WEIGHTS = { d1: 0.15, d2: 0.35, d3: 0.35, d4: 0.15 };
  const SCORE_CAP = 99;

  const CHROME_TAGS = new Set(['NAV', 'ASIDE']);
  const CHROME_ROLES = /^(navigation|banner|contentinfo|search|dialog|alertdialog)$/i;
  const CHROME_CLASS = /(^|[\s_-])(gnb|lnb|snb|navbar|nav|menu|megamenu|mega-menu|drawer|cookie|cookies|consent|onetrust|newsletter|subscribe|subscription|modal|popup|sitemap|skip|footer|global-header|site-header|site-footer)([\s_-]|$)/i;
  const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'BUTTON', 'SELECT', 'OPTION', 'IFRAME', 'CANVAS', 'OBJECT']);
  const BLOCK_TAGS = new Set(['P', 'LI', 'TD', 'TH', 'DD', 'DT', 'BLOCKQUOTE', 'FIGCAPTION', 'SUMMARY', 'PRE', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'BODY', 'FORM', 'FIELDSET', 'TABLE', 'UL', 'OL', 'DL', 'ADDRESS', 'LABEL']);
  const HEADING = /^H[1-6]$/;

  const GENERIC_HEADINGS = /^(overview|features?|key features|highlights?|introduction|intro|summary|more|learn more|read more|see more|see all|view all|discover( more)?|explore( more)?|details?|faqs?|related( articles| content| products| stories)?|resources|support|help|contact( us)?|news|blog|gallery|videos?|reviews?|shop( now)?|buy( now)?|care guide|guide|guides|menu|categories|tips?|why us|about( us)?|get started|next steps?|you may also like|recommended|share|follow us|newsletter|subscribe|개요|소개|특징|더보기|자세히 보기|관련 (콘텐츠|제품)|문의|고객센터|공지사항)$/i;
  const QUALIFIERS = /\b(appropriate|appropriately|right time|proper|properly|regular(ly)?|periodic(ally)?|great|excellent|outstanding|superior|optimal|optimum|ideal|significant(ly)?|severe(ly)?|adequate(ly)?|sufficient(ly)?|enhanced|improved|better|best|premium|advanced|exceptional|remarkable|reliable|perfect|smooth|comfortable|superb|unmatched|high[- ]quality|world[- ]class|cutting[- ]edge|state[- ]of[- ]the[- ]art|timely|as needed|when necessary|often|frequently|a while|some time)\b|적절한|적당한|주기적|정기적|충분한|뛰어난|우수한|최적|최고의|탁월한|안정적인|편안한/i;
  const UNIT = /(\d[\d,.]*\s?(%|percent|mm|cm|km|m\b|miles?|mi\b|mph|km\/h|kph|psi|kpa|bar\b|kg|lbs?|pounds?|g\b|°|℃|℉|degrees?|years?|yrs?|months?|weeks?|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|inch(es)?|in\.|["″]|\/32|kw|kwh|wh\b|w\b|v\b|mah|gb|tb|mb|mp\b|fps|hz|ghz|mhz|nm\b|ml|l\b|liters?|litres?|gallons?|mpg|times|x\b|원|년|개월|주|일|시간|분|초|개|번|회|배|만|억|킬로|미터|도)|[$€£₩¥]\s?\d|\b\d{1,2}\s?\/\s?\d{1,2}\b(?!\s?\/)|\b\d+(st|nd|rd|th)\b)/i;
  const PAGE_ENTITY = /^(Article|NewsArticle|BlogPosting|TechArticle|Report|ScholarlyArticle|HowTo|Product|ProductGroup|Recipe|Event|Course|Service|SoftwareApplication|MobileApplication|WebApplication|Book|Movie|JobPosting|MedicalWebPage|Vehicle|Car)$/;
  const ARTICLE_TYPES = /^(Article|NewsArticle|BlogPosting|TechArticle|Report|ScholarlyArticle)$/;
  const ORG_TYPES = /(Organization|Corporation|LocalBusiness|Store|AutomotiveBusiness|AutoDealer|FinancialService|InsuranceAgency|BankOrCreditUnion)$/;
  const WEBPAGE_TYPES = /^(WebSite|WebPage|AboutPage|ItemPage|FAQPage|CollectionPage|ContactPage|ProfilePage|SearchResultsPage|QAPage|MedicalWebPage|CheckoutPage|RealEstateListing)$/;
  const MODULE_TYPES = /^(HowTo|VideoObject|Recipe|Event|Review|AggregateRating|ItemList|SpeakableSpecification|ClaimReview)$/;
  const FAQ_HEADING = /\b(faqs?|frequently asked|common questions|questions and answers|q\s?&\s?a)\b|자주\s?묻는|질문과\s?답변|자주하는/i;
  const RELATED = /related|recommend|you may also|more (articles|guides|stories|tips)|see also|further reading|keep reading|explore more|관련|추천/i;
  const DEFER_LINK = /^(learn more|read more|see more|more|find out more|details|view more|자세히 보기|더보기|자세히)$/i;
  const REVIEW_TYPES = /^(Review|AggregateRating|UserReview|CriticReview)$/;
  const RATING_TEXT = /★|☆|\b[1-5](\.\d)?\s*(\/\s*5|out of 5|stars?)\b|\b\d[\d,]*\s*(reviews|ratings)\b|평점|별점|리뷰\s*\d|후기\s*\d/i;
  const AUTHOR_TEXT = /^(by|written by|reviewed by|medically reviewed by|fact[- ]checked by|author|posted by|edited by)\s*[:|]?\s*[A-Z][\w.'’-]+(\s+[A-Z][\w.'’-]+){0,3}|^(글|작성자|기자|에디터|저자|감수|필자)\s*[:|]?\s*[가-힣]{2,5}/;
  const DATE_TEXT = /(updated|published|last (updated|reviewed|modified)|posted( on)?|reviewed on|작성일|등록일|수정일|업데이트|게시일|최종 수정)\s*[:.]?\s*.{0,14}?(\d{4}[.\-/년]\s?\d{1,2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}|\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4})/i;
  const SOURCE_TEXT = /(^|\s)(sources?|references?|citations?|출처|참고\s?자료|참고\s?문헌)\s*[:：]|\baccording to (the |a )?[A-Z]/;
  const SOCIAL_HOST = /(^|\.)(facebook|fb|twitter|x|instagram|linkedin|youtube|youtu|pinterest|tiktok|kakao|band|line|whatsapp|t|reddit|threads|weibo|vk)\.(com|me|us|be|co|net|kr)$|(^|\.)naver\.me$|^apps\.apple\.com$|^play\.google\.com$/i;
  const EXPERIENCE = /\b(we tested|we test|we measured|our tests?|in (our )?testing|tested (by|in|on)|hands-on|in our lab|our lab|lab tests?|test results?|our engineers?|our experts?|certified|licensed|board-certified|years of experience|case stud(y|ies)|customer stor(y|ies)|we found|our research|research (center|centre|institute))\b|직접 (사용|테스트|측정|실험)|테스트 결과|실험 결과|시험 결과|연구소|전문가|엔지니어|자격증|년 경력|실제 사례/i;

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const squash = s => String(s || '').replace(/\s+/g, ' ').trim();
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const fmt = n => Number(n).toLocaleString('en-US');
  const hasHangul = s => /[가-힣]/.test(s);
  const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'how', 'what', 'when', 'why', 'are', 'our', 'from', 'this', 'that', 'into', 'about', 'www', 'com', 'html', 'htm', 'php', 'index', 'page']);
  function tokens(s) {
    const out = new Set();
    String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').split(' ').forEach(w => {
      if (!w || STOP.has(w)) return;
      if (/^[a-z]+$/.test(w) && w.length < 3) return;
      if (hasHangul(w) && w.length < 2) return;
      out.add(w.replace(/(ies)$/, 'y').replace(/(es|s|ing|ed)$/, '') || w);
    });
    return out;
  }
  const overlap = (a, b) => [...a].filter(x => b.has(x));

  function isChrome(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (CHROME_TAGS.has(n.tagName)) return true;
      if ((n.tagName === 'HEADER' || n.tagName === 'FOOTER') && !n.closest('main, article, [role="main"]')) return true;
      const role = n.getAttribute('role');
      if (role && CHROME_ROLES.test(role)) return true;
      const cls = (n.getAttribute('class') || '') + ' ' + (n.id || '');
      if (CHROME_CLASS.test(cls)) return true;
    }
    return false;
  }

  function sentencesOf(text) {
    return text.split(/(?<=[.!?。])\s+(?=[A-Z0-9"'“가-힣(])|(?<=다\.)\s*|\s{2,}|\s*[•·]\s+/).map(squash).filter(s => s.length >= 25);
  }

  // ---------- DOM walk ----------
  // Navigation, headers, footers and the usual furniture. Both passes use this one test so the
  // skeleton marks exactly what the scoring ignored.
  function isChromeSelf(n) {
    if (CHROME_TAGS.has(n.tagName)) return true;
    if ((n.tagName === 'HEADER' || n.tagName === 'FOOTER') && !n.closest('main, article, [role="main"]')) return true;
    const role = n.getAttribute('role');
    if (role && CHROME_ROLES.test(role)) return true;
    return CHROME_CLASS.test((n.getAttribute('class') || '') + ' ' + (n.id || ''));
  }

  function walk(doc) {
    const root = doc.body || doc.documentElement;
    const headings = [];
    const blocks = new Map();
    let pos = 0;

    function blockOf(node) {
      for (let n = node.parentElement; n; n = n.parentElement) if (BLOCK_TAGS.has(n.tagName)) return n;
      return root;
    }
    function visit(node, inHeading, chrome) {
      if (node.nodeType === 3) {
        if (inHeading) { inHeading.text += node.textContent; return; }
        const t = node.textContent;
        if (!t.trim()) return;
        const b = blockOf(node);
        let rec = blocks.get(b);
        if (!rec) { rec = { el: b, pos: pos++, text: '', chrome }; blocks.set(b, rec); }
        rec.text += ' ' + t;
        return;
      }
      if (node.nodeType !== 1 || SKIP_TEXT_TAGS.has(node.tagName)) return;
      if (node.hasAttribute('hidden')) return;
      const nowChrome = chrome || (node.tagName === 'BODY' ? false : isChromeSelf(node));
      if (HEADING.test(node.tagName) && !inHeading) {
        const h = { level: +node.tagName[1], text: '', pos: pos++, chrome: nowChrome, el: node };
        for (const c of node.childNodes) visit(c, h, nowChrome);
        h.text = squash(h.text);
        if (h.text) headings.push(h);
        return;
      }
      for (const c of node.childNodes) visit(c, inHeading, nowChrome);
    }
    visit(root, null, false);
    const blockList = [...blocks.values()].map(b => ({ ...b, text: squash(b.text) })).filter(b => b.text).sort((a, b) => a.pos - b.pos);
    return { headings, blocks: blockList };
  }

  // ---------- schema ----------
  function readSchema(doc) {
    const blocks = [];
    doc.querySelectorAll('script[type="application/ld+json" i]').forEach((s, i) => {
      const raw = (s.textContent || '').trim();
      const rec = { index: i + 1, raw, empty: !raw || raw === '{}' || raw === '[]', ok: false, error: '', data: null };
      if (!rec.empty) {
        try { rec.data = JSON.parse(raw); rec.ok = true; }
        catch (e) { rec.error = e.message; }
        if (rec.ok && rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data) && !Object.keys(rec.data).length) rec.empty = true;
      }
      blocks.push(rec);
    });
    const entities = [];
    const seen = new Set();
    function collect(node, blockIndex, depth) {
      if (!node || typeof node !== 'object' || depth > 12 || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) { node.forEach(n => collect(n, blockIndex, depth + 1)); return; }
      if (node['@type']) {
        const types = [].concat(node['@type']).map(t => String(t).replace(/^https?:\/\/schema\.org\//, ''));
        entities.push({ types, node, blockIndex, top: depth <= 2 });
      }
      Object.keys(node).forEach(k => { if (k !== '@context') collect(node[k], blockIndex, depth + 1); });
    }
    blocks.forEach(b => b.ok && collect(b.data, b.index, 0));
    const micro = [...doc.querySelectorAll('[itemtype]')].map(el => (el.getAttribute('itemtype') || '').split(/\s+/)).flat()
      .map(t => t.replace(/^https?:\/\/schema\.org\//, '')).filter(Boolean);
    const allTypes = new Set([...entities.flatMap(e => e.types), ...micro]);
    const hasPotentialAction = entities.some(e => e.node.potentialAction);
    return { blocks, entities, micro, allTypes, hasPotentialAction };
  }

  const hasType = (schema, re) => [...schema.allTypes].some(t => re.test(t));
  function findEntity(schema, re) { return schema.entities.find(e => e.types.some(t => re.test(t))); }
  function prop(node, key) {
    const v = node[key];
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? v : null;
    if (typeof v === 'string') return v.trim() ? v : null;
    return v;
  }
  function jsonExcerpt(obj, lines = 10) {
    let s;
    try { s = JSON.stringify(obj, null, 2); } catch { s = String(obj); }
    const arr = s.split('\n');
    return arr.slice(0, lines).map(l => clip(l, 110)).join('\n') + (arr.length > lines ? '\n  …' : '');
  }

  // ---------- builders ----------
  function check(pass, pts, text, meas, fix) { return { pass: !!pass, pts, text, meas: meas || '', fix: fix || '' }; }
  function checkGroup(name, checks, captures) {
    const max = checks.reduce((s, c) => s + c.pts, 0);
    const points = checks.reduce((s, c) => s + (c.pass ? c.pts : 0), 0);
    return { name, max, points, checks, captures: pickCaptures(points, max, captures) };
  }
  function bandGroup(name, max, bands, value, bandText, measured, fix, captures, extra) {
    let points = 0;
    for (const [min, pts] of bands) if (value >= min) { points = pts; break; }
    return { name, max, points, band: bandText, measured, fix, captures: pickCaptures(points, max, captures), ...(extra || {}) };
  }
  // Evidence rule: full marks = one good example; partial = one good + one bad; zero = bad only.
  function pickCaptures(points, max, c) {
    const out = [];
    if (points > 0 && c.good) out.push({ tone: 'good', ...c.good });
    if (points < max && c.bad) out.push({ tone: 'bad', ...c.bad });
    return out;
  }
  const code = (caption, lines) => ({ caption, code: lines });
  const ok = s => `<span class="ok">${s}</span>`;
  const hl = s => `<span class="hl">${s}</span>`;
  const quote = s => `"${esc(clip(s, 160))}"`;

  // ---------- what the page looks like to a reader that only gets the HTML ----------
  // A second pass, deliberately separate from the scoring walk so it cannot disturb it. It keeps
  // document order and records what each region actually offers an answer engine: text it can
  // quote, or nothing at all. An image without alt text is a hole. A block of links is a hole.
  // The head is the inverse: invisible to a person, and the richest thing on the page to a model.
  const OUTLINE_SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'SELECT', 'OPTION']);
  const MEDIA = new Set(['IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'FIGURE']);

  function outlineOf(doc, chromeTest) {
    const root = doc.body || doc.documentElement;
    const nodes = [];
    let id = 0;
    const push = n => { nodes.push({ id: id++, ...n }); };

    const BREAKS = n => BLOCK_TAGS.has(n.tagName) || HEADING.test(n.tagName) || MEDIA.has(n.tagName);
    const ownText = el => {
      let t = '';
      (function take(n) {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) { t += ' ' + c.textContent; continue; }
          if (c.nodeType !== 1 || OUTLINE_SKIP.has(c.tagName) || BREAKS(c)) continue;
          take(c);
        }
      })(el);
      return squash(t);
    };

    function visit(el, chrome) {
      for (const node of el.children) {
        if (OUTLINE_SKIP.has(node.tagName) || node.hasAttribute('hidden')) continue;
        const isChrome = chrome || chromeTest(node);

        if (HEADING.test(node.tagName)) {
          const text = squash(node.textContent);
          if (text) push({ kind: 'heading', level: +node.tagName[1], text: clip(text, 160), chars: text.length, chrome: isChrome });
          continue;
        }
        if (MEDIA.has(node.tagName)) {
          const img = node.tagName === 'IMG' ? node : node.querySelector('img');
          const alt = squash(img?.getAttribute('alt') || '');
          const cap = squash(node.querySelector?.('figcaption')?.textContent || '');
          push({ kind: 'media', tag: node.tagName.toLowerCase(), text: clip(alt || cap, 160), alt: !!alt, caption: !!cap, chars: (alt || cap).length, chrome: isChrome });
          continue;
        }
        if (node.tagName === 'TABLE') {
          const text = squash(node.textContent);
          push({ kind: 'table', text: clip(text, 160), chars: text.length, rows: node.querySelectorAll('tr').length, chrome: isChrome });
          continue;
        }
        if (node.tagName === 'UL' || node.tagName === 'OL') {
          const items = [...node.querySelectorAll(':scope > li')].map(li => squash(li.textContent)).filter(Boolean);
          const text = items.join(' · ');
          const linksOnly = items.length > 0 && items.every(t => t.length < 40);
          push({ kind: linksOnly ? 'links' : 'list', text: clip(text, 200), chars: text.length, items: items.length, chrome: isChrome });
          continue;
        }

        if (BLOCK_TAGS.has(node.tagName)) {
          const own = ownText(node);
          if (own) {
            const linky = node.querySelectorAll('a').length && own.length < 40;
            push({ kind: linky ? 'links' : 'text', text: clip(own, 300), chars: own.length, chrome: isChrome });
          }
        }
        if (node.children.length) visit(node, isChrome);
      }
    }
    visit(root, false);
    return nodes;
  }

  // What lives in the head: nothing a reader sees, everything a model reads first.
  function headOutline(doc, title, metaDesc, canonicalHref, schemaTypes) {
    const og = [...doc.querySelectorAll('meta[property^="og:" i]')].length;
    return [
      { key: 'title', label: 'title', text: title, present: !!title },
      { key: 'description', label: 'meta description', text: metaDesc, present: !!metaDesc },
      { key: 'canonical', label: 'canonical', text: canonicalHref, present: !!canonicalHref },
      { key: 'og', label: 'open graph', text: og ? `${og} tags` : '', present: og > 0 },
      { key: 'schema', label: 'structured data', text: (schemaTypes || []).join(', '), present: (schemaTypes || []).length > 0 }
    ];
  }

  // ---------- analysis ----------
  function analyze(html, pageUrl, fetched = {}) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const url = new URL(fetched.finalUrl || pageUrl);
    const { headings, blocks } = walk(doc);
    const schema = readSchema(doc);

    const content = headings.filter(h => !h.chrome);
    const h1s = headings.filter(h => h.level === 1);
    const h1 = h1s[0];
    const firstH1Pos = h1 ? h1.pos : -1;
    const contentH2 = content.filter(h => h.level === 2);
    const bodyBlocks = blocks.filter(b => !b.chrome);
    const substantive = bodyBlocks.filter(b => b.text.length >= 40);
    const substantiveChars = substantive.reduce((s, b) => s + b.text.length, 0);

    const title = squash(doc.querySelector('title')?.textContent);
    const metaDesc = squash(doc.querySelector('meta[name="description" i]')?.getAttribute('content'));
    const canonicalEl = doc.querySelector('link[rel="canonical" i]');
    const canonicalHref = canonicalEl ? new URL(canonicalEl.getAttribute('href') || '', url).href : '';
    const ogTags = [...doc.querySelectorAll('meta[property^="og:" i]')];

    const segments = url.pathname.split('/').filter(Boolean);
    const lastSeg = decodeURIComponent(segments[segments.length - 1] || '');
    const ext = (/\.([a-z0-9]{2,5})$/i.exec(lastSeg) || [])[1] || '';
    const slug = lastSeg.replace(/\.[a-z0-9]{2,5}$/i, '');
    const slugTokens = tokens(slug.replace(/[-_]+/g, ' '));
    const h1Tokens = tokens(h1?.text);
    const titleTokens = tokens(title);
    const idLike = segments.filter(s => /^\d{3,}$|\d{5,}|^[0-9a-f]{12,}$|[A-Z]{2,}[-_]?\d{2,}|;jsessionid|^[a-z]{1,3}\d{3,}$/i.test(decodeURIComponent(s)));
    const GENERIC_SLUG = /^(index|default|main|home|view|detail|details|page|list|content|contents|article|product|item|en|us|kr|ko|display|show|read)$/i;

    // ===== D1 URL & Page Context =====
    const normUrl = s => { try { const x = new URL(s); return (x.host.toLowerCase() + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch { return s; } };
    const canonSelf = canonicalHref && normUrl(canonicalHref) === normUrl(url.href);
    const canonQuery = (canonicalHref || url.href).includes('?');
    const d1a = checkGroup('A. URL Semantics', [
      check(!url.search && !idLike.length, 5, 'Human-readable slug, no IDs or params', url.search ? `query string ${clip(url.search, 40)}` : idLike.length ? `ID-like segment ${idLike[0]}` : url.pathname, 'Replace ID or parameter URLs with a readable topic slug'),
      check(slugTokens.size > 0 && !GENERIC_SLUG.test(slug) || hasHangul(slug), 5, 'Topic in slug', slug ? `"${slug}"` : 'root URL', 'Put the page topic in the last URL segment'),
      check(!canonQuery, 5, 'No query string in canonical URL', canonQuery ? 'query string present' : ''),
      check(segments.length <= 4, 5, 'Path depth of 4 segments or fewer', `${segments.length} segment${segments.length === 1 ? '' : 's'}`, 'Flatten the path to 4 segments or fewer'),
      check(!ext, 5, 'No file extension', ext ? `.${ext}` : '', 'Drop the file extension from the URL'),
      check(overlap(slugTokens, h1Tokens).length > 0 || (h1 && hasHangul(h1.text) && slug && h1.text.includes(slug)), 5, 'Slug matches H1 topic', h1 ? `H1 "${clip(h1.text, 50)}"` : 'no H1', 'Align the slug with the H1 topic')
    ], {
      good: code('A readable URL, as fetched.', `URL        ${ok(esc(url.href))}\nCanonical  ${esc(canonicalHref || 'none')}`),
      bad: code('The URL traits that cost points.', `${esc(url.pathname)}${esc(url.search)}\nsegments: ${hl(segments.length)} · extension: ${hl(ext ? '.' + esc(ext) : 'none')} · query: ${hl(url.search ? 'yes' : 'none')}${idLike.length ? ' · ID-like: ' + hl(esc(idLike.join(', '))) : ''}`)
    });

    const descExtra = [...tokens(metaDesc)].filter(t => !titleTokens.has(t)).length;
    const titleTopic = overlap(titleTokens, new Set([...h1Tokens, ...slugTokens])).length > 0 || (h1 && hasHangul(h1.text) && title.includes(h1.text.slice(0, 4)));
    const d1b = checkGroup('B. Metadata', [
      check(canonSelf, 5, 'Canonical present and self-referencing', canonicalHref ? (canonSelf ? '' : `points to ${clip(canonicalHref, 60)}`) : 'no canonical', 'Add a self-referencing canonical link'),
      check(title && titleTopic, 5, 'Title contains page topic', title ? '' : 'no title', 'Name the page topic in the title'),
      check(title && title.length <= 70, 5, 'Title length 70 chars or fewer', `${title.length} chars`, 'Shorten the title to 70 characters or fewer'),
      check(metaDesc.length > 0, 5, 'Meta description present', metaDesc ? '' : 'absent', 'Write a meta description'),
      check(descExtra >= 5, 5, 'Meta description adds info beyond title', `${descExtra} new terms`, 'Make the meta description say what the page covers beyond the title'),
      check(ogTags.length > 0, 5, 'Open Graph tags present', `${ogTags.length} og: tags`, 'Add Open Graph tags')
    ], {
      good: code('The page metadata, as served.', [
        title && `&lt;title&gt;${ok(esc(clip(title, 90)))}&lt;/title&gt;`,
        canonicalHref && `&lt;link rel="canonical" href="${ok(esc(clip(canonicalHref, 90)))}"&gt;`,
        metaDesc && `&lt;meta name="description" content="${ok(esc(clip(metaDesc, 120)))}"&gt;`
      ].filter(Boolean).join('\n') || 'title: none'),
      bad: code('The metadata gaps.', [
        !canonicalHref ? `&lt;link rel="canonical"&gt;: ${hl('not present')}` : !canonSelf ? `canonical: ${hl(esc(clip(canonicalHref, 90)))}` : '',
        !metaDesc ? `&lt;meta name="description"&gt;: ${hl('not present')}` : descExtra < 5 ? `description: ${hl(esc(clip(metaDesc, 100)))}` : '',
        title.length > 70 ? `title: ${hl(title.length + ' chars')}` : !title ? `&lt;title&gt;: ${hl('not present')}` : '',
        !ogTags.length ? `og: tags: ${hl('0')}` : ''
      ].filter(Boolean).join('\n') || `title: ${esc(clip(title, 90))}`)
    });

    const crumbEl = [...doc.querySelectorAll('[class*="bread" i], [id*="bread" i], [class*="crumb" i], [aria-label*="breadcrumb" i]')]
      .find(el => el.tagName !== 'SCRIPT' && (el.querySelectorAll('a').length >= 2 || el.querySelectorAll('li').length >= 2));
    const crumbTrail = crumbEl ? [...crumbEl.querySelectorAll('li, a')].map(n => squash(n.textContent)).filter((t, i, a) => t && t.length < 60 && a.indexOf(t) === i).slice(0, 6) : [];
    const hasCrumbSchema = hasType(schema, /^BreadcrumbList$/);
    const host = url.hostname.replace(/^www\./, '');
    const contextLinks = [...new Set([...doc.querySelectorAll('a[href]')].filter(a => !isChrome(a) && !a.closest('[class*="bread" i],[class*="crumb" i]')).map(a => {
      try {
        const x = new URL(a.getAttribute('href'), url);
        if (!/^https?:$/.test(x.protocol) || !x.hostname.endsWith(host) || normUrl(x.href) === normUrl(url.href)) return null;
        return x.origin + x.pathname;
      } catch { return null; }
    }).filter(Boolean))];
    const linkScope = el => { let n = el.parentElement; for (let i = 0; n && i < 3; i++, n = n.parentElement) if (n.querySelectorAll('a[href]').length >= 2) return n; return null; };
    const relatedEl = [...doc.querySelectorAll('h2, h3, h4, section, div, aside, ul')].find(el => {
      if (el.closest('nav, footer, [role="navigation"], [role="contentinfo"], [role="search"], [class*="search" i], [id*="search" i], [class*="autocomplete" i]')) return false;
      if (el.closest('header') && !el.closest('main, article')) return false;
      const label = HEADING.test(el.tagName) ? squash(el.textContent) : (el.getAttribute('class') || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('aria-label') || '');
      if (!RELATED.test(label) || label.length > 80) return false;
      return HEADING.test(el.tagName) ? !!linkScope(el) : el.querySelectorAll('a[href]').length >= 2;
    });
    const relatedLabel = relatedEl ? clip(HEADING.test(relatedEl.tagName) ? squash(relatedEl.textContent) : (relatedEl.getAttribute('class') || relatedEl.id), 50) : '';
    const d1c = checkGroup('C. Breadcrumb & Contextual Links', [
      check(!!crumbEl, 10, 'Visible breadcrumb trail', crumbTrail.length ? crumbTrail.join(' › ') : 'none found', 'Show a breadcrumb trail above the H1'),
      check(hasCrumbSchema, 10, 'BreadcrumbList structured data', hasCrumbSchema ? '' : '0 matches', 'Mirror the breadcrumb with BreadcrumbList JSON-LD'),
      check(contextLinks.length >= 5, 10, '5 or more in-content contextual links', `${contextLinks.length} links`, 'Link to related pages from inside the content'),
      check(!!relatedEl, 10, 'Related-content module', relatedEl ? `"${relatedLabel}"` : 'none found', 'Add a related-articles module below the content')
    ], {
      good: crumbTrail.length
        ? code('The breadcrumb trail rendered in the HTML.', `${ok(esc(crumbTrail.join(' › ')))}${hasCrumbSchema ? '\nBreadcrumbList JSON-LD: present' : ''}`)
        : code('In-content links to other pages on the site.', ok(contextLinks.slice(0, 5).map(l => esc(clip(l.replace(/^https?:\/\//, ''), 90))).join('\n') || 'none')),
      bad: code('The context signals that are missing.', [
        !crumbEl && `visible breadcrumb: ${hl('0')}`,
        !hasCrumbSchema && `BreadcrumbList JSON-LD: ${hl('0 occurrences')}`,
        contextLinks.length < 5 && `in-content links: ${hl(contextLinks.length)}`,
        !relatedEl && `related-content module: ${hl('0')}`
      ].filter(Boolean).join('\n'))
    });

    // ===== D2 Page Structure =====
    let skips = [];
    let prev = null;
    content.forEach(h => { if (prev && h.level > prev.level + 1) skips.push([prev, h]); prev = h; });
    const outline = content.slice(0, 9).map(h => `${'  '.repeat(Math.max(0, h.level - 1))}H${h.level}  ${esc(clip(h.text, 70))}`).join('\n');
    const d2a = checkGroup('A. Hierarchy & Sectioning', [
      check(h1s.length === 1, 10, 'Exactly one H1', String(h1s.length), h1s.length ? 'Keep exactly one H1 on the page' : 'Add one H1 naming the page topic'),
      check(content.length > 0 && skips.length === 0, 10, 'Zero heading-level skips', String(skips.length), 'Fix heading levels so none are skipped'),
      check(contentH2.length >= 4, 10, '4 or more topic sections', `${contentH2.length} content H2s`, 'Split the content into 4 or more H2 sections')
    ], {
      good: code('The heading outline, in source order.', ok(outline || 'none')),
      bad: code('The outline problems.', [
        h1s.length !== 1 && `H1 count: ${hl(h1s.length)}${h1s.length > 1 ? '\n' + h1s.slice(0, 3).map(h => `H1  ${esc(clip(h.text, 60))}`).join('\n') : ''}`,
        skips.length && skips.slice(0, 3).map(([a, b]) => `H${a.level} → ${hl('H' + b.level)}  ${esc(clip(b.text, 50))}`).join('\n'),
        contentH2.length < 4 && `content H2s: ${hl(contentH2.length)}`
      ].filter(Boolean).join('\n'))
    });

    const deep = content.filter(h => h.level >= 3);
    const d2b = bandGroup('B. Taxonomy Depth', 20, [[40, 20], [10, 12], [3, 6], [1, 3], [0, 0]], deep.length,
      'Content sub-headings (H3+): 40+ = 20 · 10 to 39 = 12 · 3 to 9 = 6 · 1 to 2 = 3 · none = 0',
      `${deep.length} content sub-heading${deep.length === 1 ? '' : 's'}`,
      'Break each section into labeled H3 sub-topics', {
        good: code('Sub-headings below the H2 layer.', ok(deep.slice(0, 6).map(h => `H${h.level}  ${esc(clip(h.text, 70))}`).join('\n'))),
        bad: code('Sections without a sub-heading layer.', `content H3+: ${hl(deep.length)}\n` + contentH2.filter(h2 => !deep.some(d => d.pos > h2.pos && d.pos < (contentH2.find(x => x.pos > h2.pos)?.pos ?? Infinity))).slice(0, 4).map(h => `H2  ${esc(clip(h.text, 60))}   ${hl('0 sub-headings')}`).join('\n'))
      });

    const labelSet = content.filter(h => h.level >= 2 && h.level <= 4).slice(0, 60);
    const informative = labelSet.map(h => ({ h, ok: isInformativeHeuristic(h.text) }));
    const d2c = headingBand(informative, 'heuristic');

    const faqSchema = hasType(schema, /^(FAQPage|QAPage)$/);
    const faqHeading = content.find(h => FAQ_HEADING.test(h.text));
    const qa = questionPairs(doc, headings, blocks, schema);
    const tables = [...doc.querySelectorAll('table')].filter(t => !isChrome(t) && t.getAttribute('role') !== 'presentation' && t.querySelectorAll('tr').length >= 2 && [...t.querySelectorAll('tr')].some(r => r.children.length >= 2));
    const lists = [...doc.querySelectorAll('ul, ol')].filter(l => !isChrome(l) && l.querySelectorAll(':scope > li').length >= 2 && !l.closest('[class*="bread" i],[class*="crumb" i]') && [...l.querySelectorAll(':scope > li')].some(li => squash(li.textContent).length >= 20));
    const faqPresent = faqSchema || !!faqHeading || qa.domPairs >= 3;
    const d2d = checkGroup('D. Structured Elements', [
      check(faqPresent, 10, 'FAQ block present', faqSchema ? 'FAQPage markup' : faqHeading ? `"${clip(faqHeading.text, 40)}"` : `${qa.domPairs} Q&A pairs`, 'Add an FAQ block answering the top questions'),
      check(tables.length > 0, 5, 'Data table present', `${tables.length} table element${tables.length === 1 ? '' : 's'}`, 'Present comparisons or thresholds in a real table'),
      check(lists.length >= 3, 5, '3 or more content lists', `${lists.length} lists`, 'Use list markup for steps and criteria')
    ], {
      good: tables.length
        ? code('A data table in the HTML (first rows).', ok([...tables[0].querySelectorAll('tr')].slice(0, 3).map(r => [...r.children].slice(0, 4).map(c => esc(clip(squash(c.textContent), 24))).join(' | ')).join('\n')))
        : lists.length
          ? code('List markup in the content (first items).', ok([...lists[0].querySelectorAll(':scope > li')].slice(0, 3).map(li => '· ' + esc(clip(squash(li.textContent), 90))).join('\n')))
          : code('The FAQ block found.', ok(faqHeading ? esc(faqHeading.text) : 'FAQPage markup')),
      bad: code('The structured elements that are missing.', [
        !faqPresent && `FAQ items: ${hl('0')}`,
        !tables.length && `&lt;table&gt; elements: ${hl('0')}`,
        lists.length < 3 && `content lists: ${hl(lists.length)}`
      ].filter(Boolean).join(' · '))
    });

    const seenH = new Map();
    content.forEach(h => { const k = h.text.toLowerCase(); seenH.set(k, (seenH.get(k) || 0) + 1); });
    const dups = [...seenH.entries()].filter(([, n]) => n > 1);
    const d2e = checkGroup('E. DOM Dedup Hygiene', [
      check(dups.length === 0, 5, 'Zero duplicated heading texts', String(dups.length), 'Remove headings that render twice in the HTML')
    ], {
      good: code('No heading text appears twice.', ok('Duplicated heading texts: 0')),
      bad: code('Heading texts that appear more than once.', hl(dups.slice(0, 4).map(([t, n]) => `"${esc(clip(t, 60))}" ×${n}`).join('\n')))
    });

    // ===== D3 Answerability & Content Depth =====
    const firstH2 = contentH2.find(h => h.pos > firstH1Pos);
    const introBlocks = bodyBlocks.filter(b => b.pos > firstH1Pos && (!firstH2 || b.pos < firstH2.pos) && b.text.length >= 20);
    const introText = introBlocks.map(b => b.text).join(' ');
    const sectionStats = contentH2.map((h2, i) => {
      const end = contentH2[i + 1]?.pos ?? Infinity;
      const chars = bodyBlocks.filter(b => b.pos > h2.pos && b.pos < end && b.text.length >= 20).reduce((s, b) => s + b.text.length, 0);
      return { h2, chars };
    });
    const richSections = sectionStats.filter(s => s.chars >= 200).length;
    const richShare = sectionStats.length ? richSections / sectionStats.length : 0;

    const allSentences = [];
    substantive.forEach(b => sentencesOf(b.text).forEach(s => allSentences.push(s)));
    const uniqSentences = [...new Set(allSentences)];
    const facts = uniqSentences.filter(s => UNIT.test(s) && !/©|copyright|all rights reserved/i.test(s));
    const qualifiers = uniqSentences.filter(s => QUALIFIERS.test(s) && !/\d/.test(s));
    const opening = firstSentences(introText || (substantive[0]?.text || ''), 2);
    const openingAnswers = heuristicOpening(opening);

    const d3a = checkGroup('A. Answer-first Structure', [
      check(introText.length >= 300, 10, 'Intro of 300+ chars between H1 and first content H2', `${fmt(introText.length)} chars`, 'Open with a 300+ character summary under the H1'),
      check(openingAnswers.pass, 10, 'Opening states the direct answer or definition', openingAnswers.meas, 'State the answer in the first two sentences'),
      check(sectionStats.length > 0 && richShare >= 0.7, 10, '70%+ of H2 sections carry 200+ chars of text', `${richSections} of ${sectionStats.length} sections`, 'Grow every H2 section past 200 characters')
    ], {
      good: code('The opening, as the first sentences under the H1.', ok(quote(opening || introText || '—'))),
      bad: code('Where the answer-first structure breaks.', [
        introText.length < 300 && `intro before first H2: ${hl(fmt(introText.length) + ' chars')}`,
        !openingAnswers.pass && opening && quote(opening),
        richShare < 0.7 && sectionStats.filter(s => s.chars < 200).slice(0, 3).map(s => `H2 "${esc(clip(s.h2.text, 44))}": ${hl(s.chars + ' chars')}`).join('\n')
      ].filter(Boolean).join('\n'))
    });
    d3a.checks[1].judged = openingAnswers.source;

    const d3b = factsBand(facts, qualifiers, 'heuristic');

    const deferLinks = [...doc.querySelectorAll('a[href]')].filter(a => !isChrome(a) && DEFER_LINK.test(squash(a.textContent))).length;
    const imgs = [...doc.querySelectorAll('img')].filter(i => !isChrome(i)).length;
    const longest = substantive.slice().sort((a, b) => b.text.length - a.text.length)[0];
    const d3c = bandGroup('C. Body Text Volume', 10, [[6000, 10], [3000, 6], [1000, 3], [1, 1], [0, 0]], substantiveChars,
      'Substantive text chars: 6,000+ = 10 · 3,000 to 5,999 = 6 · 1,000 to 2,999 = 3 · 1 to 999 = 1 · none = 0',
      `${fmt(substantiveChars)} chars in ${substantive.length} text blocks of 40+ chars (raw HTML, navigation and footer excluded)`,
      'Move the key explanations into this page as text', {
        good: code('The longest text block on the page.', `substantive text: ${ok(fmt(substantiveChars) + ' chars')}\n${ok(quote(longest?.text || ''))}`),
        bad: code('What the text count leaves out.', `substantive text: ${hl(fmt(substantiveChars) + ' chars')} · "Learn more"-type links: ${hl(deferLinks)} · content images: ${imgs}`)
      });

    const pairs = qa.pairs;
    const d3d = bandGroup('D. Question Coverage (Q&A pairs)', 15, [[10, 15], [4, 10], [1, 4], [0, 0]], pairs.length,
      'Q&A pairs: 10+ = 15 · 4 to 9 = 10 · 1 to 3 = 4 · 0 = 0',
      `${pairs.length} pair${pairs.length === 1 ? '' : 's'}${qa.schemaPairs ? ` (${qa.schemaPairs} in FAQPage markup)` : ''}`,
      'Answer 6 to 10 real user questions in Q&A form', {
        good: code('Question and answer pairs found.', ok(pairs.slice(0, 3).map(p => `Q  ${esc(clip(p.q, 90))}\nA  ${esc(clip(p.a, 90))}`).join('\n'))),
        bad: code('Question coverage.', `Q&A pairs: ${hl(pairs.length)} · question-form headings: ${hl(content.filter(h => /\?\s*$/.test(h.text)).length)}`)
      });

    // ===== D4 Schema Markup =====
    const org = hasType(schema, ORG_TYPES);
    const pageEnt = schema.entities.find(e => e.types.some(t => ARTICLE_TYPES.test(t))) || schema.entities.find(e => e.types.some(t => PAGE_ENTITY.test(t)));
    const crumb = hasCrumbSchema;
    const webpage = hasType(schema, WEBPAGE_TYPES);
    const typeList = [...schema.allTypes];
    const d4a = checkGroup('A. Core Coverage', [
      check(org, 10, 'Organization', org ? 'present' : '0 matches', 'Add an Organization entity'),
      check(!!pageEnt, 10, 'Page-type entity (Article, Product, HowTo…)', pageEnt ? pageEnt.types.join(', ') : '0 matches', 'Mark the page itself with a page-type entity such as Article or Product'),
      check(crumb, 10, 'BreadcrumbList', crumb ? '' : crumbEl ? '0, despite a visible trail' : '0 matches', 'Add BreadcrumbList structured data'),
      check(webpage, 10, 'WebSite or WebPage', webpage ? typeList.filter(t => WEBPAGE_TYPES.test(t)).join(', ') : '0 matches', 'Add WebSite and WebPage entities')
    ], {
      good: code('Structured data types found in the HTML.', `types: ${ok(esc(typeList.join(' · ') || 'none'))}\nJSON-LD blocks: ${schema.blocks.length}${schema.micro.length ? ` · microdata items: ${schema.micro.length}` : ''}`),
      bad: code('Core types that are missing.', [
        !org && 'Organization', !pageEnt && 'page-type entity', !crumb && 'BreadcrumbList', !webpage && 'WebSite / WebPage'
      ].filter(Boolean).map(t => `${esc(t)}: ${hl('0')}`).join(' · '))
    });

    const propChecks = entityPropChecks(pageEnt);
    const d4b = checkGroup('B. Page Entity Properties', propChecks.checks, {
      good: pageEnt ? code(`The ${esc(pageEnt.types[0])} entity, as served (first lines).`, ok(esc(jsonExcerpt(pageEnt.node)))) : null,
      bad: code(pageEnt ? `Properties missing from the ${esc(pageEnt.types[0])} entity.` : 'No page-type entity, so every property check fails.', pageEnt ? propChecks.checks.filter(c => !c.pass).map(c => `${esc(c.text)}: ${hl('absent')}`).join('\n') : `page-type entity: ${hl('0')}`)
    });

    const faqType = hasType(schema, /^(FAQPage|QAPage)$/);
    const modules = typeList.filter(t => MODULE_TYPES.test(t));
    if (schema.hasPotentialAction) modules.push('potentialAction');
    const faqEnt = findEntity(schema, /^(FAQPage|QAPage)$/);
    const d4c = checkGroup('C. Rich-Result Modules', [
      check(faqType, 10, 'FAQPage', faqType ? '' : qa.domPairs ? `absent, despite ${qa.domPairs} Q&A pairs in the HTML` : 'absent', 'Mark the Q&A content with FAQPage'),
      check(modules.length > 0, 5, 'Action or other module (HowTo, Video, Review…)', modules.length ? modules.join(', ') : 'absent', 'Add HowTo, VideoObject or Review markup where the content supports it')
    ], {
      good: faqEnt ? code('The FAQPage entity (first lines).', ok(esc(jsonExcerpt(faqEnt.node, 8)))) : code('Rich-result modules found.', ok(esc(modules.join(' · ')))),
      bad: code('Rich-result modules that are absent.', `${!faqType ? `FAQPage: ${hl('absent')}` : ''}${!faqType && !modules.length ? ' · ' : ''}${!modules.length ? `HowTo / VideoObject / Review / Action: ${hl('absent')}` : ''}`)
    });

    const parsed = schema.blocks.filter(b => b.ok);
    const empties = schema.blocks.filter(b => b.empty);
    const sig = e => `${e.types.join('+')}|${e.node.name || e.node['@id'] || e.node.url || ''}`;
    const topSigs = schema.entities.filter(e => e.top && !(e.types.includes('ListItem'))).map(sig);
    const dupSigs = [...new Set(topSigs.filter((s, i) => topSigs.indexOf(s) !== i))];
    const rawDup = schema.blocks.map(b => b.raw.replace(/\s+/g, '')).filter((r, i, a) => r && a.indexOf(r) !== i).length;
    const hasBlocks = schema.blocks.length > 0;
    const dupEnt = dupSigs.length ? schema.entities.find(e => sig(e) === dupSigs[0]) : null;
    const d4d = checkGroup('D. Validity & Hygiene', [
      check(hasBlocks && parsed.length === schema.blocks.length - empties.filter(b => !b.ok).length && schema.blocks.every(b => b.ok || b.empty), 5, 'All JSON-LD blocks parse', hasBlocks ? `${parsed.length}/${schema.blocks.length} valid` : 'no JSON-LD blocks', 'Fix the JSON syntax errors in the structured data'),
      check(hasBlocks && !empties.length, 5, 'No empty blocks', hasBlocks ? `${empties.length} empty` : 'no JSON-LD blocks', 'Remove empty JSON-LD blocks'),
      check(hasBlocks && !dupSigs.length && !rawDup, 5, 'No duplicate blocks', hasBlocks ? (dupSigs.length ? `${clip(dupSigs[0].split('|')[0], 30)} ×2` : rawDup ? 'identical block repeated' : '') : 'no JSON-LD blocks', 'Remove the duplicated structured-data block')
    ], {
      good: code('Structured-data validity, measured.', ok(`JSON-LD blocks: ${schema.blocks.length} · parse OK: ${parsed.length}/${schema.blocks.length} · empty: ${empties.length}`)),
      bad: code('The validity problems.', !hasBlocks ? `JSON-LD blocks: ${hl('0')}` : [
        schema.blocks.filter(b => !b.ok && !b.empty).slice(0, 2).map(b => `block ${b.index}: ${hl(esc(clip(b.error, 80)))}`).join('\n'),
        empties.length && `empty blocks: ${hl(empties.length)}`,
        dupEnt && `${esc(clip(JSON.stringify({ '@type': dupEnt.node['@type'], name: dupEnt.node.name }), 90))}\n${esc(clip(JSON.stringify({ '@type': dupEnt.node['@type'], name: dupEnt.node.name }), 90))}   ${hl('×2')}`
      ].filter(Boolean).join('\n'))
    });

    // ===== D3 E-E-A-T signals: counted from the HTML; first-hand experience is judged by Gemini =====
    const nameOf = v => { const x = Array.isArray(v) ? v[0] : v; return squash(typeof x === 'string' ? x : x && typeof x === 'object' && typeof x.name === 'string' ? x.name : ''); };
    const reviewEnt = schema.entities.find(e => e.types.some(t => REVIEW_TYPES.test(t))) || schema.entities.find(e => e.node.aggregateRating || e.node.review);
    const ratingNode = reviewEnt && [].concat(reviewEnt.types.includes('AggregateRating') ? reviewEnt.node : reviewEnt.node.aggregateRating || [])[0];
    const reviewEl = [...doc.querySelectorAll('[class*="review" i], [id*="review" i], [class*="rating" i], [class*="testimonial" i], [itemprop="review" i], [itemprop="aggregateRating" i]')]
      .find(el => el.tagName !== 'SCRIPT' && !isChrome(el) && !el.closest('a, button, form') && (squash(el.textContent).length >= 80 || RATING_TEXT.test(squash(el.textContent))));
    const reviews = reviewEnt
      ? (ratingNode && ratingNode.ratingValue ? `rating ${ratingNode.ratingValue}${ratingNode.reviewCount || ratingNode.ratingCount ? ` from ${ratingNode.reviewCount || ratingNode.ratingCount} reviews` : ''} in structured data` : `${reviewEnt.types[0]} in structured data`)
      : reviewEl ? `review block "${clip(squash(reviewEl.textContent), 50)}"` : '';
    const schemaAuthor = schema.entities.map(e => nameOf(e.node.author) || nameOf(e.node.reviewedBy)).find(Boolean) || '';
    const authorEl = [...doc.querySelectorAll('[itemprop="author" i], [rel~="author" i], [class*="author" i], [class*="byline" i], [class*="writer" i], [class*="reporter" i]')]
      .find(el => el.tagName !== 'SCRIPT' && !isChrome(el) && squash(el.textContent).length >= 2 && squash(el.textContent).length <= 80);
    const authorLine = bodyBlocks.find(b => b.text.length <= 120 && AUTHOR_TEXT.test(b.text));
    const author = schemaAuthor || squash(doc.querySelector('meta[name="author" i]')?.getAttribute('content')) || (authorEl ? squash(authorEl.textContent) : '') || (authorLine ? authorLine.text : '');
    const schemaDate = schema.entities.map(e => prop(e.node, 'dateModified') || prop(e.node, 'datePublished')).find(v => typeof v === 'string') || '';
    const metaDate = doc.querySelector('meta[property="article:modified_time" i], meta[property="article:published_time" i], meta[name="date" i], meta[itemprop="dateModified" i], meta[itemprop="datePublished" i]')?.getAttribute('content') || '';
    const timeEl = [...doc.querySelectorAll('time')].find(t => !isChrome(t) && (t.getAttribute('datetime') || /\d{4}/.test(t.textContent)));
    const dateLine = bodyBlocks.find(b => b.text.length <= 200 && DATE_TEXT.test(b.text));
    const pageDate = schemaDate ? `${schemaDate.slice(0, 10)} in structured data`
      : metaDate ? `${metaDate.slice(0, 10)} in meta tags`
      : timeEl ? `${clip(squash(timeEl.getAttribute('datetime') || timeEl.textContent), 25)} in a time element`
      : dateLine ? `"${clip(dateLine.text.match(DATE_TEXT)[0], 40)}"` : '';
    const outside = [...new Set([...doc.querySelectorAll('a[href]')].filter(a => !isChrome(a)).map(a => {
      try {
        const x = new URL(a.getAttribute('href'), url);
        if (!/^https?:$/.test(x.protocol)) return null;
        const hn = x.hostname.replace(/^www\./, '');
        const own = hn === host || hn.endsWith('.' + host) || host.endsWith('.' + hn);
        return own || SOCIAL_HOST.test(hn) ? null : hn;
      } catch { return null; }
    }).filter(Boolean))];
    const citeCount = doc.querySelectorAll('cite, blockquote[cite], q[cite]').length;
    const sourceLine = bodyBlocks.find(b => SOURCE_TEXT.test(b.text));
    const sources = outside.length ? outside : citeCount ? [`${citeCount} citation element${citeCount > 1 ? 's' : ''}`] : sourceLine ? [`"${clip(sourceLine.text, 40)}"`] : [];
    const expSentences = uniqSentences.filter(s => EXPERIENCE.test(s)).slice(0, 12);
    const eeat = { reviews, author: clip(author, 80), date: pageDate, sources };
    const d3e = eeatGroup(eeat, expSentences, 'heuristic');

    const crumbs = crumbEl ? [...crumbEl.querySelectorAll('a[href]')].map(a => {
      try { return { name: squash(a.textContent), url: new URL(a.getAttribute('href'), url).href }; } catch { return null; }
    }).filter((c, i, a) => c && c.name && c.name.length < 60 && a.findIndex(x => x && x.name === c.name) === i) : [];
    if (crumbs.length && normUrl(crumbs[crumbs.length - 1].url) !== normUrl(url.href)) crumbs.push({ name: h1?.text || title, url: url.href });

    const measure = {
      url: url.href, title, h1: h1?.text || '', metaDesc, introText, opening,
      headings: labelSet.map((h, i) => ({ id: i, level: h.level, text: h.text })),
      sentences: [...new Set([...expSentences, ...facts.slice(0, 40), ...qualifiers.slice(0, 30), ...uniqSentences.filter(s => !facts.includes(s) && !qualifiers.includes(s)).slice(0, 50)])]
        .map((s, i) => ({ id: i, text: clip(s, 300) })),
      substantiveChars, rawBytes: fetched.bytes || html.length,
      jsHeavy: substantiveChars < 400 && doc.querySelectorAll('script').length > 10,
      // Inputs for the suggested fixes: the page's own values, never invented ones.
      siteName: squash(doc.querySelector('meta[property="og:site_name" i]')?.getAttribute('content')) || nameOf(findEntity(schema, ORG_TYPES)?.node.name),
      ogImage: doc.querySelector('meta[property="og:image" i]')?.getAttribute('content') || '',
      lang: (doc.documentElement.getAttribute('lang') || '').slice(0, 10),
      author: eeat.author,
      crumbs,
      missingSchema: { organization: !org, pageEntity: !pageEnt, breadcrumb: !crumb, webpage: !webpage, faq: !faqType },
      schemaTypes: typeList.slice(0, 16),
      qaPairs: pairs.slice(0, 8).map(p => ({ q: clip(p.q, 200), a: clip(p.a, 400) })),
      weakHeadings: informative.filter(x => !x.ok).map(x => x.h.text).slice(0, 8),
      weakSentences: qualifiers.slice(0, 6).map(s => clip(s, 240)),
      // The page as an answer engine receives it, in document order.
      outline: outlineOf(doc, isChromeSelf),
      head: headOutline(doc, title, metaDesc, canonicalHref, typeList)
    };

    const result = {
      kind: 'platform',
      url: url.href,
      requestedUrl: pageUrl,
      fetchedAt: fetched.fetchedAt || new Date().toISOString(),
      redirects: fetched.redirects || [],
      title,
      measure,
      eeat,
      judged: { headings: 'heuristic', opening: openingAnswers.source, facts: 'heuristic', experience: 'heuristic' },
      dimensions: [
        dim('01', 'URL & Page Context', 'd1', [d1a, d1b, d1c]),
        dim('02', 'Page Structure', 'd2', [d2a, d2b, d2c, d2d, d2e]),
        dim('03', 'Answerability & Content Depth', 'd3', [d3a, d3b, d3c, d3d, d3e]),
        dim('04', 'Schema Markup', 'd4', [d4a, d4b, d4c, d4d])
      ],
      qualifierSamples: qualifiers.slice(0, 5)
    };
    finalize(result);
    return result;
  }

  function dim(num, title, key, breakdown) {
    return { num, key, title, weight: Math.round(WEIGHTS[key] * 100) + '%', breakdown };
  }

  function finalize(r) {
    r.dimensions.forEach(d => {
      const raw = d.breakdown.reduce((s, g) => s + g.points, 0);
      d.rawScore = raw;
      d.score = Math.min(raw, SCORE_CAP);
      d.capped = raw > SCORE_CAP;
    });
    const total = r.dimensions.reduce((s, d) => s + d.score * WEIGHTS[d.key], 0);
    r.overallScore = Math.min(Math.round(total), SCORE_CAP);
    r.templates = buildTemplates(r);
  }

  // ---------- judgment items (heuristic defaults, replaceable by judge.js) ----------
  function isInformativeHeuristic(text) {
    const t = squash(text).replace(/[:.!]+$/, '');
    if (GENERIC_HEADINGS.test(t)) return false;
    if (hasHangul(t)) return t.replace(/\s/g, '').length >= 5;
    const words = t.split(/\s+/).filter(Boolean);
    return words.length >= 2 && t.length >= 10;
  }

  function headingBand(list, source) {
    const n = list.length;
    const good = list.filter(x => x.ok).length;
    const share = n ? good / n : 0;
    const pct = Math.round(share * 100);
    const value = !n || !good ? -1 : share;
    const g = bandGroup('C. Heading Label Quality', 25, [[0.9, 25], [0.75, 17], [0.5, 10], [0.25, 5], [0, 3], [-1, 0]], value,
      'Informative share of content headings: 90%+ = 25 · 75 to 89 = 17 · 50 to 74 = 10 · 25 to 49 = 5 · under 25 = 3 · none informative = 0',
      n ? `${good} of ${n} content headings name their topic = ${pct}%` : 'no content headings',
      'Rename generic headings so each names its topic', {
        good: code('Headings that name their topic.', `<span class="ok">${list.filter(x => x.ok).slice(0, 5).map(x => `H${x.h.level}  ${esc(clip(x.h.text, 70))}`).join('\n')}</span>`),
        bad: code('Headings that do not name a topic.', `<span class="hl">${list.filter(x => !x.ok).slice(0, 5).map(x => `H${x.h.level}  ${esc(clip(x.h.text, 70))}`).join('\n') || 'no content headings'}</span>`)
      }, { judged: source });
    return g;
  }

  function factsBand(facts, qualifiers, source) {
    return bandGroup('B. Extractable Facts in Text', 25, [[15, 25], [8, 17], [3, 8], [1, 4], [0, 0]], facts.length,
      'Numeric or spec statements in HTML text: 15+ = 25 · 8 to 14 = 17 · 3 to 7 = 8 · 1 to 2 = 4 · none = 0',
      `${facts.length} statement${facts.length === 1 ? '' : 's'} with a number, unit or spec; ${qualifiers.length} qualifier sentence${qualifiers.length === 1 ? '' : 's'} without one`,
      'Replace qualifiers with the number behind them', {
        good: code('Statements an engine can cite as facts.', `<span class="ok">${facts.slice(0, 3).map(quote).join('\n')}</span>`),
        bad: code('Qualifier sentences standing where a number could be.', qualifiers.length ? `<span class="hl">${qualifiers.slice(0, 3).map(quote).join('\n')}</span>` : `numeric statements: <span class="hl">${facts.length}</span>`)
      }, { judged: source });
  }

  // Experience, expertise, authority and trust signals an engine can see in the HTML.
  function eeatGroup(sig, exp, source) {
    const found = [
      sig.reviews && `reviews     ${esc(sig.reviews)}`,
      sig.author && `author      ${esc(clip(sig.author, 70))}`,
      sig.date && `date        ${esc(sig.date)}`,
      sig.sources.length && `sources     ${esc(clip(sig.sources.slice(0, 4).join(', '), 90))}`,
      exp.length && `first-hand  ${quote(exp[0])}`
    ].filter(Boolean);
    const missing = [
      !sig.reviews && 'reviews or ratings', !sig.author && 'author byline', !sig.date && 'published or updated date',
      !sig.sources.length && 'outside sources', !exp.length && 'first-hand experience'
    ].filter(Boolean);
    const g = checkGroup('E. E-E-A-T Signals', [
      check(!!sig.reviews, 4, 'Reviews, ratings or testimonials', sig.reviews || 'none found', 'Show real customer reviews or ratings, and mark them up with Review'),
      check(!!sig.author, 4, 'Named author or expert byline', sig.author ? `"${clip(sig.author, 40)}"` : 'none found', 'Add a byline naming the author or expert reviewer'),
      check(!!sig.date, 4, 'Published or updated date', sig.date || 'none found', 'Show when the page was published or last updated'),
      check(sig.sources.length > 0, 4, 'Cites outside sources', sig.sources.length ? clip(sig.sources.slice(0, 3).join(', '), 60) : 'none found', 'Link the standards, studies or data behind key claims'),
      check(exp.length > 0, 4, 'First-hand experience or expertise shown', exp.length ? `${exp.length} statement${exp.length === 1 ? '' : 's'}` : 'none found', 'Show your own test results, expert credentials or real cases')
    ], {
      good: code('E-E-A-T signals found on the page.', `<span class="ok">${found.join('\n')}</span>`),
      bad: code('E-E-A-T signals that are missing.', missing.map(x => `${esc(x)}: <span class="hl">0</span>`).join('\n'))
    });
    g.checks[4].judged = source;
    return g;
  }

  function firstSentences(text, n) {
    const s = sentencesOf(text);
    return (s.length ? s.slice(0, n).join(' ') : squash(text).slice(0, 280));
  }

  function heuristicOpening(opening) {
    if (!opening) return { pass: false, meas: 'no opening text', source: 'heuristic' };
    const definitional = /\b(is|are|means|refers to|defined as|should|must|need to|needs to|recommend(ed|s)?|replace|choose|start (with|by)|begin (with|by)|check|look for|consider|use|required?|requires)\b|입니다|합니다|해야|하세요|권장/i.test(opening);
    const concrete = UNIT.test(opening);
    const vague = QUALIFIERS.test(opening) && !concrete;
    const pass = definitional && !vague;
    return { pass, meas: pass ? (concrete ? 'states a concrete answer' : 'states a direct instruction or definition') : vague ? 'qualifier instead of an answer' : 'framing only', source: 'heuristic' };
  }

  function questionPairs(doc, headings, blocks, schema) {
    const pairs = [];
    let schemaPairs = 0;
    schema.entities.filter(e => e.types.includes('Question')).forEach(e => {
      const q = squash(e.node.name || e.node.text);
      const ansNode = [].concat(e.node.acceptedAnswer || e.node.suggestedAnswer || [])[0];
      const a = squash(typeof ansNode === 'object' ? (ansNode?.text || '') : ansNode).replace(/<[^>]+>/g, '');
      if (q && a) { pairs.push({ q, a, src: 'schema' }); schemaPairs++; }
    });
    const qEls = [...doc.querySelectorAll('h2, h3, h4, h5, h6, dt, summary, button, [class*="question" i], [class*="faq" i] strong, [class*="accordion" i] a')]
      .filter(el => !isChrome(el))
      .map(el => ({ el, text: squash(el.textContent) }))
      .filter(x => x.text.length >= 10 && x.text.length <= 220 && /[?？]\s*$/.test(x.text));
    const uniq = [];
    qEls.forEach(x => { if (!uniq.some(u => u.text === x.text || u.el.contains(x.el) || x.el.contains(u.el))) uniq.push(x); });
    let domPairs = 0;
    uniq.forEach(x => {
      let a = '';
      const container = x.el.closest('details, [class*="accordion" i], [class*="faq" i] li, [class*="faq-item" i], [class*="question" i]');
      if (container && container !== x.el) a = squash(container.textContent.replace(x.text, ''));
      if (!a) {
        let n = x.el.nextElementSibling;
        for (let i = 0; n && i < 3 && a.length < 40; i++, n = n.nextElementSibling) {
          if (HEADING.test(n.tagName)) break;
          a += ' ' + squash(n.textContent);
        }
        a = squash(a);
      }
      if (a.length >= 40) {
        domPairs++;
        if (!pairs.some(p => p.q.toLowerCase() === x.text.toLowerCase())) pairs.push({ q: x.text, a, src: 'html' });
      }
    });
    return { pairs, schemaPairs, domPairs };
  }

  function entityPropChecks(ent) {
    const n = ent?.node || {};
    const t = ent?.types.find(x => PAGE_ENTITY.test(x)) || '';
    const has = k => !!prop(n, k);
    const named = k => { const v = prop(n, k); if (!v) return false; const x = Array.isArray(v) ? v[0] : v; return typeof x === 'string' ? !!x.trim() : !!(x && x.name); };
    let list;
    if (ARTICLE_TYPES.test(t)) list = [
      ['headline', has('headline') || has('name')], ['author with name', named('author')], ['datePublished', has('datePublished')],
      ['dateModified', has('dateModified')], ['publisher', has('publisher')], ['mainEntityOfPage or image', has('mainEntityOfPage') || has('image')]];
    else if (/^Product|ProductGroup|Vehicle|Car$/.test(t)) list = [
      ['name', has('name')], ['brand', has('brand')], ['offers', has('offers')],
      ['image', has('image')], ['description', has('description')], ['aggregateRating or review', has('aggregateRating') || has('review')]];
    else list = [
      ['name or headline', has('name') || has('headline')], ['description', has('description')], ['image', has('image')],
      ['url or mainEntityOfPage', has('url') || has('mainEntityOfPage')], ['datePublished or dateModified', has('datePublished') || has('dateModified')],
      ['publisher, provider or author', has('publisher') || has('provider') || has('author') || has('organizer')]];
    return { checks: list.map(([name, pass]) => check(ent && pass, 5, name, '', `Add ${name} to the ${t || 'page'} entity`)) };
  }

  // ---------- written output (templates; judge.js may replace) ----------
  function buildTemplates(r) {
    const lost = [];
    r.dimensions.forEach(d => d.breakdown.forEach(g => {
      const gap = g.max - g.points;
      if (!gap) return;
      if (g.checks) g.checks.filter(c => !c.pass).forEach(c => lost.push({ d, g, pts: c.pts * (d.key === 'd2' || d.key === 'd3' ? 0.35 : 0.15), text: c.text, meas: c.meas, fix: c.fix }));
      else lost.push({ d, g, pts: gap * (d.key === 'd2' || d.key === 'd3' ? 0.35 : 0.15), text: g.name.replace(/^[A-E]\.\s*/, ''), meas: g.measured, fix: g.fix });
    }));
    lost.sort((a, b) => b.pts - a.pts);
    const wins = [];
    r.dimensions.forEach(d => d.breakdown.forEach(g => { if (g.points === g.max) wins.push({ d, g }); }));

    const perDim = {};
    r.dimensions.forEach(d => {
      const dl = lost.filter(x => x.d === d);
      const full = d.breakdown.filter(g => g.points === g.max);
      const diagnosis = [];
      if (full.length) diagnosis.push(`Full marks on ${full.map(g => g.name.replace(/^[A-E]\.\s*/, '')).join(', ')}`);
      dl.slice(0, full.length ? 2 : 3).forEach(x => diagnosis.push(`${x.text}${x.meas ? ': ' + x.meas : ''}`));
      if (!diagnosis.length) diagnosis.push('Every check in this dimension passes');
      const todo = [...new Set(dl.map(x => x.fix).filter(Boolean))].slice(0, 3);
      perDim[d.key] = { diagnosis: diagnosis.slice(0, 3), todo: todo.length ? todo : ['Keep this template as the reference for other pages'] };
    });
    const weakest = r.dimensions.slice().sort((a, b) => (a.score * WEIGHTS[a.key] - 100 * WEIGHTS[a.key]) - (b.score * WEIGHTS[b.key] - 100 * WEIGHTS[b.key]))[0];
    return {
      headline: lost.length ? `${weakest.title} holds the score back; the biggest single gap is ${lost[0].text.toLowerCase()}` : 'Every checklist item passes on this page',
      strengths: wins.slice(0, 3).map(w => `${w.d.title}: ${w.g.name.replace(/^[A-E]\.\s*/, '')} earns ${w.g.points}/${w.g.max}`),
      weaknesses: lost.slice(0, 3).map(x => `${x.text}${x.meas ? ` (${x.meas})` : ''}`),
      perDim
    };
  }

  // ---------- apply model judgments ----------
  function applyJudgment(r, j) {
    const d2 = r.dimensions.find(d => d.key === 'd2');
    const d3 = r.dimensions.find(d => d.key === 'd3');
    if (Array.isArray(j.headings) && j.headings.length) {
      const map = new Map(j.headings.map(h => [h.id, !!h.informative]));
      const list = r.measure.headings.map(h => ({ h, ok: map.has(h.id) ? map.get(h.id) : isInformativeHeuristic(h.text) }));
      const i = d2.breakdown.findIndex(g => g.name.startsWith('C.'));
      d2.breakdown[i] = headingBand(list, 'gemini');
      r.judged.headings = 'gemini';
      r.measure.weakHeadings = list.filter(x => !x.ok).map(x => x.h.text).slice(0, 8);
    }
    if (typeof j.openingAnswers === 'boolean') {
      const c = d3.breakdown[0].checks[1];
      c.pass = j.openingAnswers;
      c.meas = squash(j.openingReason || (j.openingAnswers ? 'states the answer' : 'framing only')).slice(0, 80);
      c.judged = 'gemini';
      const g = d3.breakdown[0];
      g.points = g.checks.reduce((s, x) => s + (x.pass ? x.pts : 0), 0);
      r.judged.opening = 'gemini';
    }
    if (Array.isArray(j.factIds)) {
      const byId = new Map(r.measure.sentences.map(s => [s.id, s.text]));
      const facts = j.factIds.map(id => byId.get(id)).filter(Boolean);
      const quals = (j.qualifierIds || []).map(id => byId.get(id)).filter(Boolean);
      const i = d3.breakdown.findIndex(g => g.name.startsWith('B.'));
      d3.breakdown[i] = factsBand(facts, quals.length ? quals : r.qualifierSamples, 'gemini');
      r.judged.facts = 'gemini';
      r.measure.weakSentences = (quals.length ? quals : r.qualifierSamples).slice(0, 6);
    }
    if (Array.isArray(j.experienceIds) && r.eeat) {
      const byId = new Map(r.measure.sentences.map(s => [s.id, s.text]));
      const exp = j.experienceIds.map(id => byId.get(id)).filter(Boolean);
      const i = d3.breakdown.findIndex(g => g.name.startsWith('E.'));
      if (i >= 0) { d3.breakdown[i] = eeatGroup(r.eeat, exp, 'gemini'); r.judged.experience = 'gemini'; }
    }
    finalize(r);
    const t = r.templates;
    if (j.headline) t.headline = squash(j.headline);
    if (Array.isArray(j.strengths) && j.strengths.length) t.strengths = j.strengths.slice(0, 3).map(squash);
    if (Array.isArray(j.weaknesses) && j.weaknesses.length) t.weaknesses = j.weaknesses.slice(0, 3).map(squash);
    if (j.dimensions) ['d1', 'd2', 'd3', 'd4'].forEach(k => {
      const x = j.dimensions[k];
      if (!x) return;
      if (Array.isArray(x.diagnosis) && x.diagnosis.length) t.perDim[k].diagnosis = x.diagnosis.slice(0, 3).map(squash);
      if (Array.isArray(x.todo) && x.todo.length) t.perDim[k].todo = x.todo.slice(0, 3).map(squash);
    });
    t.source = 'gemini';
    return r;
  }

  return { analyze, applyJudgment, WEIGHTS, SCORE_CAP, esc };
})();

if (typeof module !== 'undefined') module.exports = GEO;
