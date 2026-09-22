// ===== THE PAGE AS A MODEL RECEIVES IT =====
// A reader sees a designed page. An answer engine gets whatever survives in the HTML, in document
// order, and nothing else. This draws that second page: every block sized by how much text it
// actually offers, everything it cannot read left as a hole, and the head, which a reader never
// sees, drawn first because it is the first thing a model reads.
const SKEL = (() => {
  let nodes = [];
  let secs = [];
  let opened = new Set();

  // Every part of the drawing is an address into the score panel. Without this the red boxes are
  // the loudest thing on screen and lead nowhere.
  const LINKS = {
    title: 'd1:B. Metadata',
    description: 'd1:B. Metadata',
    canonical: 'd1:B. Metadata',
    og: 'd1:B. Metadata',
    schema: 'd4:A. Core Coverage',
    structure: 'd2:A. Hierarchy & Sectioning',
    'FAQ block': 'd2:D. Structured Elements',
    'Review or rating': 'd3:E. E-E-A-T Signals',
    'Named author': 'd3:E. E-E-A-T Signals',
    'Date': 'd3:E. E-E-A-T Signals',
    'Outside sources': 'd3:E. E-E-A-T Signals',
    'Organization schema': 'd4:A. Core Coverage',
    'Page entity schema': 'd4:B. Page Entity Properties',
    'Breadcrumb': 'd1:C. Breadcrumb & Contextual Links'
  };

  const HOLE = new Set(['media', 'links']);

  function build(d) {
    const m = d.measure || {};
    nodes = m.outline || [];
    const ee = d.eeat || {};
    const ms = m.missingSchema || {};
    opened = new Set();
    const host = (() => { try { return new URL(d.url).host; } catch { return ''; } })();

    // ---- 1. what was pulled out of the head ----
    const meta = (m.head || []).map(h => ({ key: h.key, label: h.label, value: h.text, has: h.present }));

    // ---- 2. the page split from the top heading down ----
    secs = sectionsOf(nodes.filter(n => !n.chrome));
    // A section's parent is the nearest heading above it that outranks it. Knowing that is what
    // lets a branch be folded away and opened again without losing where it belonged.
    secs.forEach((sec, i) => {
      let p = -1;
      for (let k = i - 1; k >= 0; k--) if (secs[k].level < sec.level) { p = secs[k].id; break; }
      sec.parent = p;
      sec.kids = false;
    });
    secs.forEach((sec, i) => { if (secs[i + 1] && secs[i + 1].level > sec.level) sec.kids = true; });

    // ---- 3. the named things the rubric looks for ----
    const wanted = [
      { label: 'FAQ block', has: (m.qaPairs || []).length > 0 || !ms.faq },
      { label: 'Review or rating', has: !!ee.reviews },
      { label: 'Named author', has: !!ee.author, value: ee.author },
      { label: 'Date', has: !!ee.date, value: ee.date },
      { label: 'Outside sources', has: !!ee.sources },
      { label: 'Organization schema', has: !ms.organization },
      { label: 'Page entity schema', has: !ms.pageEntity },
      { label: 'Breadcrumb', has: !ms.breadcrumb }
    ];

    const missingMeta = meta.filter(x => !x.has).length;
    const missingWanted = wanted.filter(x => !x.has).length;
    // A model is handed the navigation and the footer too. They are not drawn, because they are
    // not what the page is about, but saying how much was set aside keeps the title honest.
    const chrome = nodes.filter(n => n.chrome).length;
    const body = nodes.length - chrome;

    return `
      <div class="skel">
        <div class="skel-head">
          <div class="skel-title">The page, as a model receives it</div>
          <div class="skel-hint">Click any part of this drawing to open the check behind it</div>
          <div class="skel-key">
            <span class="skel-key-item"><i class="kb kb-has"></i>found</span>
            <span class="skel-key-item"><i class="kb kb-none"></i>not found</span>
            <span class="skel-key-item sk-aside">${fmtNum(body)} blocks drawn \u00b7 ${fmtNum(chrome)} in nav and footer, set aside</span>
          </div>
          <div class="skel-note" id="skel-note" hidden></div>
        </div>

        <div class="skel-stage" id="skel-stage">
          <div class="skel-fit" id="skel-fit">

            <section class="sk-sec" data-anchor="head">
              <h4 class="sk-sec-t">Metadata <span class="sk-host">${GEO.esc(host)}</span></h4>
              <div class="sk-chips">
                ${meta.map(x => `<span class="sk-chip ${x.has ? 'has' : 'none'}" role="button" tabindex="0"
                  data-gkey="${GEO.esc(LINKS[x.key] || '')}"${x.value ? ` title="${GEO.esc(x.value)}"` : ''}>
                  <b>${x.has ? '\u2713' : '\u2715'}</b>${GEO.esc(x.label)}${x.has && x.value ? `<em>${GEO.esc(clipText(x.value, 30))}</em>` : ''}</span>`).join('')}
              </div>
            </section>

            <section class="sk-sec" data-anchor="structure">
              <h4 class="sk-sec-t">Structure <span class="sk-depth" id="sk-depth"></span></h4>
              ${secs.length ? secs.map(sec => `
                <div class="sk-node lvl${sec.level}" data-lvl="${sec.level}" data-sec="${sec.id}" data-parent="${sec.parent}">
                  <div class="sk-row">
                    <div class="sk-head" data-node="${sec.id}" data-gkey="${GEO.esc(LINKS.structure)}" role="button" tabindex="0">
                      <span class="sk-tag">${sec.lead ? '\u2014' : `H${sec.level}`}</span>
                      <span class="sk-htext">${GEO.esc(clipText(sec.text, 48))}</span>
                    </div>
                    ${sec.blocks.length ? `<div class="sk-blocks">${blockChips(sec.blocks)}</div>`
                      : '<div class="sk-blocks"><span class="sk-blk none">nothing under this heading</span></div>'}
                    ${sec.kids ? `<button type="button" class="sk-fold" data-fold="${sec.id}" hidden aria-label="Show the headings under this one">\u25be</button>` : ''}
                  </div>
                </div>`).join('')
                : '<div class="sk-blank">No headings. A model has no way to tell what this page is about.</div>'}
            </section>

            <section class="sk-sec" data-anchor="wanted">
              <h4 class="sk-sec-t">Structured information</h4>
              <div class="sk-grid">
                ${wanted.map(x => `<div class="sk-card ${x.has ? 'has' : 'none'}" role="button" tabindex="0"
                  data-gkey="${GEO.esc(LINKS[x.label] || '')}"${x.value ? ` title="${GEO.esc(x.value)}"` : ''}>
                  <b>${x.has ? '\u2713' : '\u2715'}</b>
                  <span>${GEO.esc(x.label)}</span>
                  ${x.has && x.value ? `<em>${GEO.esc(clipText(x.value, 26))}</em>` : ''}
                </div>`).join('')}
              </div>
            </section>

          </div>
        </div>

        <div class="skel-foot-note">
          <span class="fn ${missingMeta ? 'none' : 'has'}">${missingMeta ? `${missingMeta} metadata missing` : 'metadata complete'}</span>
          <span class="fn ${missingWanted ? 'none' : 'has'}">${missingWanted ? `${missingWanted} of ${wanted.length} not found` : 'all found'}</span>
        </div>
      </div>`;
  }

  // Document order already carries the shape: a heading opens a section and everything until the
  // next heading belongs to it. Nesting it by level is what shows the page splitting from the top
  // heading downwards, which is the thing a reader of this drawing is trying to see.
  function sectionsOf(body) {
    const out = [];
    let cur = null;
    for (const n of body) {
      if (n.kind === 'heading') {
        cur = { id: n.id, level: Math.min(n.level, 4), text: n.text, blocks: [] };
        out.push(cur);
      } else if (cur) {
        cur.blocks.push(n);
      } else {
        // content before any heading still belongs to the page
        if (!out.length) out.push({ id: -1, level: 1, lead: true, text: 'Text before any heading', blocks: [] });
        out[0].blocks.push(n);
      }
    }
    return out;
  }

  // One chip per kind, not per block. A section with nine paragraphs said "text" nine times,
  // which reads as noise: what matters is that it has body copy at all, and where it has nothing.
  const KINDS = [
    { label: 'text',            has: true,  match: n => n.kind === 'text' },
    { label: 'list',            has: true,  match: n => n.kind === 'list' },
    { label: 'table',           has: true,  match: n => n.kind === 'table' },
    { label: 'image, described',has: true,  match: n => n.kind === 'media' && n.alt },
    { label: 'image, no alt',   has: false, match: n => n.kind === 'media' && !n.alt },
    { label: 'links only',      has: false, match: n => n.kind === 'links' }
  ];

  function blockChips(blocks) {
    return KINDS.map(k => {
      const hit = blocks.filter(k.match);
      if (!hit.length) return '';
      const ids = hit.map(n => n.id).join(' ');
      return `<span class="sk-blk ${k.has ? 'has' : 'none'}" data-nodes="${ids}">${k.label}</span>`;
    }).join('');
  }

  // Which branches are open, and which heading levels are drawn at all. A long page cannot be
  // made to fit by shrinking it: at thirty-four headings the type lands at seven pixels and the
  // drawing stops being readable, which defeats the point of it fitting. So depth goes first and
  // size goes last, and anything folded away says so rather than vanishing.
  function visibleAt(depth) {
    return secs.filter(sec => {
      if (sec.level <= depth) return true;
      for (let p = sec.parent; p !== -1 && p !== undefined;) {
        if (opened.has(p)) return true;
        const par = secs.find(x => x.id === p);
        if (!par) break;
        p = par.parent;
      }
      return false;
    });
  }

  function applyDepth(depth) {
    const shown = new Set(visibleAt(depth).map(s => s.id));
    document.querySelectorAll('#skel-fit .sk-node').forEach(el => {
      el.hidden = !shown.has(+el.dataset.sec);
    });
    // A fold handle appears only where something is actually folded away.
    document.querySelectorAll('#skel-fit .sk-fold').forEach(btn => {
      const id = +btn.dataset.fold;
      const sec = secs.find(x => x.id === id);
      const kidsHidden = secs.some(x => x.parent === id && !shown.has(x.id));
      btn.hidden = !sec || !kidsHidden;
      btn.classList.toggle('open', opened.has(id));
    });
    const label = document.getElementById('sk-depth');
    if (label) {
      const deepest = Math.max(1, ...secs.map(s => s.level));
      label.textContent = depth < deepest ? `H1\u2013H${depth} \u00b7 deeper headings folded` : '';
    }
  }

  const phone = () => matchMedia('(max-width: 700px)').matches;

  let watcher = null;
  let watched = null;
  function fit() {
    const stage = document.getElementById('skel-stage');
    const inner = document.getElementById('skel-fit');
    if (!stage || !inner) return;
    // The report is rendered before the screen is shown, so the first call can land while the
    // stage still has no height. Re-observing each render matters because every report builds a
    // new stage and the old one is thrown away.
    if (window.ResizeObserver && watched !== stage) {
      if (watcher) watcher.disconnect();
      watcher = new ResizeObserver(() => fit());
      watched = stage;
      watcher.observe(stage);
    }
    if (phone()) {
      inner.style.transform = 'none';
      inner.style.width = '';
      applyDepth(9);
      inner.style.visibility = 'visible';
      return;
    }
    if (stage.clientHeight < 60) return;
    const pad = getComputedStyle(stage);
    const room = stage.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom) - 2;

    inner.style.transform = 'none';
    inner.style.width = '';
    let depth = 4;
    applyDepth(depth);
    // Drop a level at a time until it fits, but never below H1-H2: past that the drawing stops
    // being a shape and becomes a list of two words.
    while (inner.scrollHeight > room && depth > 2) { depth -= 1; applyDepth(depth); }

    // Only whatever is still over the edge after folding is taken out of the type size, and not
    // far: below four fifths it is no longer worth reading.
    const put = k => {
      if (k >= 1) { inner.style.transform = 'none'; inner.style.width = ''; }
      else { inner.style.transform = `scale(${k})`; inner.style.width = `${100 / k}%`; }
      return inner.scrollHeight * k <= room;
    };
    if (!put(1)) {
      let lo = 0.8, hi = 1, best = 0.8;
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2;
        if (put(mid)) { best = mid; lo = mid; } else hi = mid;
      }
      put(best);
    }
    inner.style.visibility = 'visible';
  }

  // Opening a branch is bounded: one at a time, so the drawing keeps its one-screen promise.
  function toggleFold(id) {
    if (opened.has(id)) opened.delete(id);
    else { opened.clear(); opened.add(id); }
    fit();
  }

  const clipText = (t, n) => (t || '').length > n ? (t || '').slice(0, n - 1) + '\u2026' : (t || '');
  const fmtNum = n => (n || 0).toLocaleString('en-US');

  // ---- linking evidence to the skeleton ----
  // The evidence quotes the page, so the way to find where it came from is to look for the page's
  // own words inside it. Matching that way round is what works: the evidence is plain text with no
  // reliable quoting, while every block in the skeleton knows exactly what it says. Checks with no
  // place in the body, a canonical tag or a schema block, are answered by the head instead.
  const HEAD_HINTS = /<title>|canonical|meta name=|meta property=|json-ld|json\+ld|og:|schema|structured data|metadata|breadcrumblist/i;
  const HEAD_GROUPS = /url semantics|metadata|schema|structured|breadcrumb/i;

  const flat = t => (t || '').replace(/\s+/g, ' ').replace(/[…]/g, '').trim().toLowerCase();

  // Three probes per block: its opening, its middle and a little further in. One of them will
  // survive whatever clipping the evidence did.
  function probesOf(text) {
    const t = flat(text);
    if (t.length < 14) return [];
    const out = [t.slice(0, Math.min(36, t.length))];
    if (t.length > 90) out.push(t.slice(Math.floor(t.length * 0.4), Math.floor(t.length * 0.4) + 34));
    if (t.length > 160) out.push(t.slice(Math.floor(t.length * 0.7), Math.floor(t.length * 0.7) + 34));
    return out.filter(p => p.length >= 14);
  }

  function locate(groupName, evidenceText) {
    const ev = flat(evidenceText);
    const hits = [];
    if (ev) {
      for (const n of nodes) {
        if (probesOf(n.text).some(p => ev.includes(p))) hits.push(n.id);
      }
    }
    const head = HEAD_HINTS.test(evidenceText || '') || HEAD_GROUPS.test(groupName || '');
    return { nodes: hits, head };
  }

  function clear() {
    document.querySelectorAll('.is-lit').forEach(el => el.classList.remove('is-lit'));
    const n = document.getElementById('skel-note');
    if (n) { n.hidden = true; n.textContent = ''; }
  }

  // Some checks have no single place in the body: they read the head, or the schema, or count
  // something across the whole page. Pointing at nothing taught people the drawing was broken, so
  // a check that cannot be pinned to a block lights the panel it belongs to and says why.
  const PANEL_OF = [
    [/metadata|url semantics/i, 'head'],
    [/breadcrumb|e-e-a-t|core coverage|entity properties|rich-result|validity|structured elements/i, 'wanted'],
    [/hierarchy|taxonomy|heading|dedup|answer|extractable|body text|question/i, 'structure']
  ];
  function panelFor(groupName) {
    const hit = PANEL_OF.find(([re]) => re.test(groupName || ''));
    return hit ? hit[1] : null;
  }
  const PANEL_WORD = { head: 'the metadata', wanted: 'the structured information', structure: 'the page structure' };

  function note(text) {
    const n = document.getElementById('skel-note');
    if (!n) return;
    n.textContent = text || '';
    n.hidden = !text;
  }

  // Everything the check looked at lights up, not just the first thing, because a check usually
  // read several places and showing one of them would misrepresent it.
  function light(groupName, evidenceText) {
    clear();
    const where = locate(groupName, evidenceText);
    const els = [];
    if (where.head) { const h = document.querySelector('[data-anchor="head"]'); if (h) els.push(h); }
    where.nodes.forEach(id => {
      const el = document.querySelector(`[data-node="${id}"]`) || document.querySelector(`[data-nodes~="${id}"]`);
      if (el && !el.closest('.sk-node[hidden]') && els.indexOf(el) < 0) els.push(el);
    });

    if (!els.length) {
      const panel = panelFor(groupName);
      const sec = panel && document.querySelector(`[data-anchor="${panel}"]`);
      if (!sec) { note('This check reads the page as a whole.'); return false; }
      sec.classList.add('is-lit');
      note(`No single block to point at \u2014 this check reads ${PANEL_WORD[panel]}.`);
      return true;
    }

    els.forEach(el => el.classList.add('is-lit'));
    return true;
  }

  // The other direction. Clicking the drawing opens the check that judged it, because the red
  // boxes are what people look at first and they used to lead nowhere.
  function jump(gkey) {
    if (!gkey) return false;
    const group = document.querySelector(`.check-group[data-gkey="${CSS.escape(gkey)}"]`);
    if (!group) return false;
    const card = group.closest('.score-card');
    if (card) card.querySelectorAll('details.evi').forEach(dt => { dt.open = false; });
    group.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    group.classList.remove('is-called');
    void group.offsetWidth;
    group.classList.add('is-called');
    setTimeout(() => group.classList.remove('is-called'), 1400);
    return true;
  }

  // One handler for the whole drawing: fold buttons open a branch, everything else is an address.
  document.addEventListener('click', e => {
    const fold = e.target.closest('#skel-fit .sk-fold');
    if (fold) { e.preventDefault(); toggleFold(+fold.dataset.fold); return; }
    const target = e.target.closest('#skel-fit [data-gkey]');
    if (target) jump(target.dataset.gkey);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fit(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest?.('#skel-fit [data-gkey], #skel-fit .sk-fold');
    if (!target) return;
    e.preventDefault();
    if (target.classList.contains('sk-fold')) toggleFold(+target.dataset.fold);
    else jump(target.dataset.gkey);
  });

  return { build, light, clear, fit, jump };
})();
