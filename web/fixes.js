// ===== AI SUGGESTED FIXES =====
// Sits in each dimension card where "What to do" used to be. Collapsed by default: a person asks
// for drafts with "Generate", and only then does the second Gemini request run. One request
// drafts every dimension, so the other cards open instantly afterwards. Drafts never change a
// score and are labeled as generated. Structured data is assembled in code from the page's own
// values, so it is always valid JSON; only FAQ answers inside it can come from the model.
const FIXES = (() => {
  const SPARK = '<svg class="ai-spark" width="16" height="16" viewBox="2 0 20 20" aria-hidden="true"><path d="M12 2c.8 5.6 2.4 7.2 8 8-5.6.8-7.2 2.4-8 8-.8-5.6-2.4-7.2-8-8 5.6-.8 7.2-2.4 8-8z" fill="url(#aiSpark)"/></svg>';
  const SPARK_SM = '<svg class="ai-spark-sm" width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.8 5.6 2.4 7.2 8 8-5.6.8-7.2 2.4-8 8-.8-5.6-2.4-7.2-8-8 5.6-.8 7.2-2.4 8-8z" fill="url(#aiSpark)"/></svg>';
  const SPARK_BTN = '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.8 5.6 2.4 7.2 8 8-5.6.8-7.2 2.4-8 8-.8-5.6-2.4-7.2-8-8 5.6-.8 7.2-2.4 8-8z" fill="currentColor"/></svg>';
  const CHEVRON = up => `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="${up ? 'M3 7.5 6 4.5l3 3' : 'M3 4.5 6 7.5l3-3'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const COPY_ICON = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 3.2A1.8 1.8 0 0 0 8.8 2H4a2 2 0 0 0-2 2v4.8c0 .8.5 1.5 1.2 1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const DIM_KEYS = ['d1', 'd2', 'd3', 'd4'];
  // Each draft lives under the dimension whose check it fixes.
  const DIM_OF = { title: 'd1', metaDescription: 'd1', slug: 'd1', h1: 'd2', headings: 'd2', opening: 'd3', trustLine: 'd3', facts: 'd3' };
  const DISCLAIMER = 'Drafts from this page’s own text. They don’t change the score. Replace anything in [brackets] with your real values.';

  const esc = s => GEO.esc(s);
  const squash = s => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  // Placeholders the model could not fill stand out, so they are hard to publish by mistake.
  const ph = s => esc(s).replace(/\[[^\]\n]{1,80}\]/g, '<mark class="ai-ph">$&</mark>');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const texts = new Map();
  let seq = 0;

  function findCheck(r, key, text) {
    for (const g of r.dimensions.find(d => d.key === key).breakdown) for (const c of g.checks || []) if (c.text === text) return c;
    return null;
  }
  const groupOf = (r, key, prefix) => r.dimensions.find(d => d.key === key).breakdown.find(g => g.name.startsWith(prefix));
  const dimOf = (k, items) => (k === 'faq' ? (items.faq.some(x => x.key === 'd3') ? 'd3' : 'd2') : DIM_OF[k]);

  // Which drafts this page needs, each tied to the checks it answers.
  function plan(r) {
    const m = r.measure;
    const fails = (key, list) => list.map(t => findCheck(r, key, t)).filter(c => c && !c.pass).map(c => ({ key, text: c.text, meas: c.meas }));
    const gap = (key, prefix) => { const g = groupOf(r, key, prefix); return g && g.points < g.max ? [{ key, text: g.name.replace(/^[A-E]\.\s*/, ''), meas: g.measured || '' }] : []; };
    const items = {
      title: fails('d1', ['Title contains page topic', 'Title length 70 chars or fewer']),
      metaDescription: fails('d1', ['Meta description present', 'Meta description adds info beyond title']),
      slug: fails('d1', ['Human-readable slug, no IDs or params', 'Topic in slug', 'Slug matches H1 topic']),
      h1: fails('d2', ['Exactly one H1']),
      headings: m.weakHeadings.length ? gap('d2', 'C.') : [],
      opening: fails('d3', ['Opening states the direct answer or definition', 'Intro of 300+ chars between H1 and first content H2']),
      trustLine: fails('d3', ['Named author or expert byline', 'Published or updated date']),
      facts: m.weakSentences.length ? gap('d3', 'B.') : [],
      faq: [...fails('d2', ['FAQ block present']), ...gap('d3', 'D.')]
    };
    const needed = Object.keys(items).filter(k => items[k].length);
    const dims = [...new Set(needed.map(k => dimOf(k, items)))];
    if (Object.values(m.missingSchema).some(Boolean)) dims.push('d4');
    return { items, needed, dims };
  }

  // Structured data alone can be built without a request, unless it needs a page type or FAQ text.
  function needsRequest(r, p) {
    const miss = r.measure.missingSchema;
    return p.needed.length > 0 || miss.pageEntity || (miss.faq && !r.measure.qaPairs.length);
  }

  function payload(r, p) {
    const m = r.measure;
    return {
      needed: p.needed,
      page: {
        url: m.url, language: m.lang || undefined, siteName: m.siteName || undefined,
        title: m.title, h1: m.h1, metaDescription: m.metaDesc, opening: m.opening, intro: (m.introText || '').slice(0, 900),
        headings: m.headings.map(h => h.text), sentences: m.sentences.map(s => s.text).slice(0, 90),
        existingQA: m.qaPairs, author: m.author || undefined,
        WEAK_HEADINGS: m.weakHeadings.slice(0, 6), WEAK_SENTENCES: m.weakSentences.slice(0, 4),
        failedChecks: Object.values(p.items).flat().map(x => `${x.text}${x.meas ? ` (${x.meas})` : ''}`)
      }
    };
  }

  // Assembles JSON-LD for the missing types from values measured on the page.
  function buildJsonLd(r, p, ai) {
    const m = r.measure;
    const miss = m.missingSchema;
    const origin = new URL(m.url).origin;
    const site = m.siteName || new URL(m.url).hostname.replace(/^www\./, '');
    const desc = (p.items.metaDescription.length && squash(ai.metaDescription)) || m.metaDesc || '[page description]';
    const name = m.h1 || m.title || '[page name]';
    let image = '[image URL]';
    try { if (m.ogImage) image = new URL(m.ogImage, m.url).href; } catch {}
    const orgId = `${origin}/#organization`;
    const graph = [];
    if (miss.organization) graph.push({ '@type': 'Organization', '@id': orgId, name: site, url: `${origin}/`, logo: '[logo image URL]' });
    if (miss.webpage) graph.push({ '@type': 'WebPage', '@id': `${m.url}#webpage`, url: m.url, name: m.title || name, description: desc, isPartOf: { '@type': 'WebSite', url: `${origin}/`, name: site } });
    if (miss.pageEntity) {
      const publisher = miss.organization ? { '@id': orgId } : { '@type': 'Organization', name: site };
      const byType = {
        Article: { '@type': 'Article', headline: name, description: desc, image, author: { '@type': 'Person', name: m.author || '[author name]' }, datePublished: '[YYYY-MM-DD]', dateModified: '[YYYY-MM-DD]', publisher, mainEntityOfPage: m.url },
        Product: { '@type': 'Product', name, description: desc, image, brand: { '@type': 'Brand', name: site }, offers: { '@type': 'Offer', url: m.url, price: '[price]', priceCurrency: '[currency code]', availability: 'https://schema.org/InStock' } },
        HowTo: { '@type': 'HowTo', name, description: desc, image, step: [1, 2, 3].map(n => ({ '@type': 'HowToStep', position: n, text: `[step ${n}]` })) },
        Service: { '@type': 'Service', name, description: desc, provider: publisher, areaServed: '[area served]', url: m.url }
      };
      graph.push(byType[ai.pageType] || byType.Article);
    }
    if (miss.breadcrumb && m.crumbs.length >= 2) graph.push({ '@type': 'BreadcrumbList', itemListElement: m.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) });
    let aiFaq = false;
    if (miss.faq) {
      let qa = m.qaPairs.map(x => ({ q: x.q, a: x.a }));
      if (!qa.length && Array.isArray(ai.faq)) { qa = ai.faq.map(x => ({ q: squash(x?.q), a: squash(x?.a) })).filter(x => x.q && x.a); aiFaq = qa.length > 0; }
      if (qa.length) graph.push({ '@type': 'FAQPage', mainEntity: qa.slice(0, 8).map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) });
    }
    if (!graph.length) return null;
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/<\//g, '<\\/');
    return { code: `<script type="application/ld+json">\n${json}\n</script>`, types: graph.map(g => g['@type']), aiFaq };
  }

  function copyBtn(text) {
    const id = `fx${++seq}`;
    texts.set(id, text);
    return `<button type="button" class="ai-copy" data-fx="${id}" onclick="FIXES.copy(this)">${COPY_ICON}<span>Copy</span></button>`;
  }

  function block(name, fixes, body, copyText, meta = '') {
    const all = fixes.map(f => `${f.key.toUpperCase()} · ${f.text}${f.meas ? ` (${f.meas})` : ''}`).join('\n');
    const more = fixes.length > 1 ? ` <span class="ai-more">+${fixes.length - 1}</span>` : '';
    return `<div class="ai-draft">
      <div class="ai-draft-head"><span class="ai-draft-name">${esc(name)}</span><span class="ai-fixes-tag" title="${esc(all)}">Fixes ${esc(fixes[0].text)}${more}</span>${meta ? `<span class="ai-count">${esc(meta)}</span>` : ''}</div>
      ${body}
      ${copyBtn(copyText)}
    </div>`;
  }

  function currentSlug(u) {
    try { return decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || '/'); } catch { return ''; }
  }
  const cleanSlug = s => squash(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  // AS-IS above TO-BE: what the page has now, then the drafted replacement.
  const NOT_ON_PAGE = '<span class="ai-empty">Not on the page</span>';
  const cmp = (asis, tobe, wide = false) => `
        <div class="ai-cmp${wide ? ' ai-cmp-wide' : ''}">
          <div class="ai-asis"><span class="ai-lbl">AS-IS</span><div class="ai-val">${asis}</div></div>
          <div class="ai-tobe"><span class="ai-lbl">${SPARK_SM}TO-BE</span><div class="ai-val">${tobe}</div></div>
        </div>`;

  // Drafts for one dimension, in the order a person would fix them.
  function draftsFor(r, p, ai, key) {
    const m = r.measure;
    const eeat = r.eeat || {};
    const out = [];
    const on = k => p.items[k].length > 0 && dimOf(k, p.items) === key;
    const single = (k, name, now, next, count) => {
      next = squash(next);
      if (!on(k) || !next) return;
      out.push(block(name, p.items[k], cmp(now ? esc(now) : NOT_ON_PAGE, ph(next)), next, count ? `${[...next].length} chars` : ''));
    };
    // Lists read as a two-column AS-IS / TO-BE table.
    const pairs = (k, name, rows) => {
      rows = (Array.isArray(rows) ? rows : []).map(x => ({ current: squash(x?.current), suggested: squash(x?.suggested) }))
        .filter(x => x.suggested && x.suggested !== x.current).slice(0, 6);
      if (!on(k) || !rows.length) return;
      out.push(block(name, p.items[k], `
        <div class="ai-table">
          <div class="ai-tr ai-th"><span class="ai-lbl">AS-IS</span><span class="ai-lbl">${SPARK_SM}TO-BE</span></div>
          ${rows.map(x => `<div class="ai-tr"><p>${esc(x.current)}</p><p>${ph(x.suggested)}</p></div>`).join('')}
        </div>`, rows.map(x => x.suggested).join('\n')));
    };

    if (key === 'd1') {
      single('title', 'Title tag', m.title, ai.title, true);
      single('metaDescription', 'Meta description', m.metaDesc, ai.metaDescription, true);
      single('slug', 'URL slug', currentSlug(m.url), cleanSlug(ai.slug));
    }
    if (key === 'd2') {
      single('h1', 'H1 heading', m.h1, ai.h1);
      pairs('headings', 'Headings that name their topic', ai.headings);
    }
    if (key === 'd3') {
      single('opening', 'Opening answer', m.opening, ai.opening);
      single('trustLine', 'Author and date line', [eeat.author && `Author: ${eeat.author}`, eeat.date && `Date: ${eeat.date}`].filter(Boolean).join(' · '), ai.trustLine);
      pairs('facts', 'Vague sentences, made specific', ai.facts);
    }
    if (on('faq')) {
      const faq = (Array.isArray(ai.faq) ? ai.faq : []).map(x => ({ q: squash(x?.q), a: squash(x?.a) })).filter(x => x.q && x.a).slice(0, 5);
      const n = m.qaPairs.length;
      if (faq.length) out.push(block('FAQ drafts', p.items.faq, cmp(
        n ? esc(`${n} question-and-answer pair${n === 1 ? '' : 's'} on the page`) : '<span class="ai-empty">No FAQ or Q&amp;A on the page</span>',
        `<ul class="ai-faq">${faq.map(x => `<li><b>${ph(x.q)}</b><p>${ph(x.a)}</p></li>`).join('')}</ul>`, true),
        faq.map(x => `Q. ${x.q}\nA. ${x.a}`).join('\n\n')));
    }
    if (key === 'd4') {
      const ld = buildJsonLd(r, p, ai);
      if (ld) {
        const found = (m.schemaTypes || []).filter(t => !/^(ListItem|Question|Answer|ImageObject|Thing)$/.test(t));
        out.push(block('Structured data to add (JSON-LD)', [{ key: 'd4', text: ld.types.join(', '), meas: '' }], cmp(
          `${found.length ? esc(`Found: ${found.join(', ')}`) : '<span class="ai-empty">No structured data on the page</span>'}<br>${esc(`Missing: ${ld.types.join(', ')}`)}`,
          `<p class="ai-note">Built from this page’s own values${ld.aiFaq ? '. The FAQ answers are drafts, so add the same questions to the page before you publish this markup' : ''}. Paste it inside the page’s &lt;head&gt;.</p>
          <pre class="ai-code"><code>${ph(ld.code)}</code></pre>`, true), ld.code));
      }
    }
    return out;
  }

  function errorHtml(e) {
    return `<div class="ai-error" role="alert"><div><b>We couldn’t write the drafts this time.</b><span>${esc(copyFor(e).title)}. Your scores are not affected.</span></div>
      <button type="button" class="btn-outline ai-retry" onclick="FIXES.retry()">Try again</button></div>`;
  }

  // One dimension's box. Closed: the header, one line, and a button. Open: next steps and drafts.
  function boxHtml(r, key, exporting = false) {
    const f = r.fixes;
    const planned = f.plan.dims.includes(key);
    const open = exporting || f.open.has(key);
    const loading = planned && f.status === 'loading';
    const steps = r.templates.perDim[key]?.todo || [];
    const drafts = f.status === 'done' ? draftsFor(r, f.plan, f.data, key) : [];

    let sub = '';
    if (!open) {
      sub = drafts.length ? `${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'} ready to review.`
        : planned && f.status !== 'done' ? 'Gemini writes AS-IS → TO-BE drafts for the checks this dimension missed.'
        : 'Next steps for this dimension.';
    } else if (drafts.length || (loading && !exporting)) sub = DISCLAIMER;

    let button = '';
    if (!exporting) {
      if (loading) button = '<button type="button" class="ai-gen" disabled><span class="ai-gen-spin" aria-hidden="true"></span>Generating…</button>';
      else if (!open) button = `<button type="button" class="ai-gen primary" onclick="FIXES.toggle('${key}')" aria-expanded="false">${SPARK_BTN}Generate solutions</button>`;
      else button = `<button type="button" class="ai-gen" onclick="FIXES.toggle('${key}')" aria-expanded="true">Hide${CHEVRON(true)}</button>`;
    }

    let body = '';
    if (open) {
      let d = '';
      if (loading && !exporting) d = `<p class="ai-status" role="status"><span class="ai-dot" aria-hidden="true"></span><span class="ai-shimmer">${esc(f.msg)}</span></p><div class="ai-skel" aria-hidden="true"><i></i><i></i><i></i></div>`;
      else if (planned && f.status === 'error' && !exporting) d = errorHtml(f.error);
      else d = drafts.join('');
      body = `<div class="ai-body">${steps.length ? `<ol class="ai-steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${d ? `<div class="ai-drafts">${d}</div>` : ''}</div>`;
    }
    return `<div class="ai-box-top">
        <div class="ai-box-text">
          <div class="ai-box-head">${SPARK}<span class="ai-box-title">AI Suggested Fixes</span></div>
          ${sub ? `<p class="ai-box-sub">${sub}</p>` : ''}
        </div>${button}
      </div>${body}`;
  }

  // Height follows the content, so opening, closing and filling in all glide.
  function morph(el, change) {
    const from = el.offsetHeight;
    el._m?.cancel();
    change();
    const to = el.offsetHeight;
    if (from === to || !el.animate || reduced()) return;
    el.style.overflow = 'hidden';
    const a = el._m = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 300, easing: EASE });
    const done = () => { if (el._m === a) { el.style.overflow = ''; el._m = null; } };
    a.onfinish = done;
    a.oncancel = done;
    setTimeout(done, 650);
  }

  function paint(r, animate = true) {
    if (currentData !== r || !r.fixes) return;
    texts.clear();
    DIM_KEYS.forEach(key => {
      const el = document.getElementById(`ai-${key}`);
      if (!el) return;
      const hadDrafts = !!el.querySelector('.ai-draft');
      const apply = () => { el.innerHTML = boxHtml(r, key); };
      if (animate) morph(el, apply); else apply();
      if (animate && !hadDrafts && !reduced()) {
        el.querySelectorAll('.ai-steps, .ai-draft').forEach((c, i) => c.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 40 + i * 45, easing: EASE, fill: 'backwards' }));
        el.querySelectorAll('.ai-draft').forEach((d, i) => d.querySelectorAll('.ai-tobe .ai-val, .ai-tr:not(.ai-th) > :last-child').forEach(t => {
          t.style.animationDelay = `${140 + i * 90}ms`;
          t.classList.add('ai-stream');
          setTimeout(() => { t.classList.remove('ai-stream'); t.style.animationDelay = ''; }, 1500 + i * 90);
        }));
      }
    });
  }

  function init(r) {
    if (!r.fixes) {
      const p = plan(r);
      r.fixes = { plan: p, status: needsRequest(r, p) ? 'idle' : 'done', data: {}, open: new Set(), msg: '' };
    }
    paint(r, false);
  }

  async function generate(r) {
    const f = r.fixes;
    f.status = 'loading';
    f.msg = 'Writing drafts from this page’s own text…';
    paint(r);
    try {
      const data = await JUDGE.suggest(readStoredKey(), payload(r, f.plan), msg => { if (f.status === 'loading') { f.msg = msg; paint(r, false); } });
      f.data = data || {};
      f.status = 'done';
    } catch (err) {
      console.error(err);
      f.error = err instanceof AuditError ? err : new AuditError('UNKNOWN', err.message);
      f.status = 'error';
    }
    paint(r);
  }

  function toggle(key) {
    const r = currentData;
    if (!r || !r.fixes || r.fixes.status === 'loading') return;
    const f = r.fixes;
    if (f.open.has(key)) { f.open.delete(key); paint(r); return; }
    f.open.add(key);
    if (f.plan.dims.includes(key) && (f.status === 'idle' || f.status === 'error')) { generate(r); return; }
    paint(r);
  }

  function retry() {
    const r = currentData;
    if (r?.fixes && r.fixes.status !== 'loading') generate(r);
  }

  // Expanded content for the PDF: next steps and any drafts, without buttons.
  function exportHtml(key) {
    return currentData?.fixes ? boxHtml(currentData, key, true) : '';
  }

  async function copy(btn) {
    const text = texts.get(btn.dataset.fx) || '';
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
    }
    const label = btn.querySelector('span');
    btn.classList.add('done');
    label.textContent = 'Copied';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('done'); label.textContent = 'Copy'; }, 1600);
  }

  return { init, toggle, retry, copy, exportHtml, plan, buildJsonLd };
})();
