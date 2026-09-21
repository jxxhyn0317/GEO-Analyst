// ===== THE PAGE AS A MODEL RECEIVES IT =====
// A reader sees a designed page. An answer engine gets whatever survives in the HTML, in document
// order, and nothing else. This draws that second page: every block sized by how much text it
// actually offers, everything it cannot read left as a hole, and the head, which a reader never
// sees, drawn first because it is the first thing a model reads.
const SKEL = (() => {
  let nodes = [];

  const HOLE = new Set(['media', 'links']);

  function build(d) {
    const m = d.measure || {};
    nodes = m.outline || [];
    const ee = d.eeat || {};
    const ms = m.missingSchema || {};
    const host = (() => { try { return new URL(d.url).host; } catch { return ''; } })();

    // ---- 1. what was pulled out of the head ----
    const meta = (m.head || []).map(h => ({ label: h.label, value: h.text, has: h.present }));

    // ---- 2. the page split from the top heading down ----
    const tree = sectionsOf(nodes.filter(n => !n.chrome));

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

    return `
      <div class="skel">
        <div class="skel-head">
          <div class="skel-title">The page, as a model receives it</div>
          <div class="skel-key">
            <span class="skel-key-item"><i class="kb kb-has"></i>found</span>
            <span class="skel-key-item"><i class="kb kb-none"></i>not found</span>
          </div>
        </div>

        <div class="skel-stage" id="skel-stage">
          <div class="skel-fit" id="skel-fit">

            <section class="sk-sec" data-anchor="head">
              <h4 class="sk-sec-t">Metadata <span class="sk-host">${GEO.esc(host)}</span></h4>
              <div class="sk-chips">
                ${meta.map(x => `<span class="sk-chip ${x.has ? 'has' : 'none'}">
                  <b>${x.has ? '\u2713' : '\u2715'}</b>${GEO.esc(x.label)}${x.has && x.value ? `<em>${GEO.esc(clipText(x.value, 30))}</em>` : ''}</span>`).join('')}
              </div>
            </section>

            <section class="sk-sec">
              <h4 class="sk-sec-t">Structure</h4>
              ${tree.length ? tree.map(sec => `
                <div class="sk-node lvl${sec.level}">
                  <div class="sk-head" data-node="${sec.id}">
                    <span class="sk-tag">H${sec.level}</span>
                    <span class="sk-htext">${GEO.esc(clipText(sec.text, 52))}</span>
                  </div>
                  ${sec.blocks.length ? `<div class="sk-blocks">${sec.blocks.map(blockChip).join('')}</div>`
                    : '<div class="sk-blocks"><span class="sk-blk none">nothing under this heading</span></div>'}
                </div>`).join('')
                : '<div class="sk-blank">No headings. A model has no way to tell what this page is about.</div>'}
            </section>

            <section class="sk-sec">
              <h4 class="sk-sec-t">Structured information</h4>
              <div class="sk-grid">
                ${wanted.map(x => `<div class="sk-card ${x.has ? 'has' : 'none'}">
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
        if (!out.length) out.push({ id: -1, level: 1, text: '(before the first heading)', blocks: [] });
        out[0].blocks.push(n);
      }
    }
    return out;
  }

  function blockChip(n) {
    const lit = `data-node="${n.id}"`;
    if (n.kind === 'media') return n.alt
      ? `<span class="sk-blk has" ${lit}>image, described</span>`
      : `<span class="sk-blk none" ${lit}>image, no alt</span>`;
    if (n.kind === 'links') return `<span class="sk-blk none" ${lit}>links only</span>`;
    if (n.kind === 'table') return `<span class="sk-blk has" ${lit}>table</span>`;
    if (n.kind === 'list') return `<span class="sk-blk has" ${lit}>list</span>`;
    return `<span class="sk-blk has" ${lit}>text</span>`;
  }

  let watcher = null;
  function fit() {
    const stage = document.getElementById('skel-stage');
    const inner = document.getElementById('skel-fit');
    if (!stage || !inner) return;
    // The report is rendered before the screen is shown, so the first call can land while the
    // stage still has no height. Watching it means the drawing settles as soon as there is room,
    // and again whenever the room changes.
    if (!watcher && window.ResizeObserver) {
      watcher = new ResizeObserver(() => fit());
      watcher.observe(stage);
    }
    if (stage.clientHeight < 60) return;
    inner.style.transform = 'none';
    inner.style.width = '';
    const room = stage.clientHeight - 6;
    const need = inner.scrollHeight;
    const k = need > room ? Math.max(0.34, room / need) : 1;
    if (k < 1) { inner.style.transform = `scale(${k})`; inner.style.width = `${100 / k}%`; }
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
  }

  // Everything the check looked at lights up, not just the first thing, because a check usually
  // read several places and showing one of them would misrepresent it.
  function light(groupName, evidenceText) {
    clear();
    const where = locate(groupName, evidenceText);
    const els = [];
    if (where.head) { const h = document.querySelector('[data-anchor="head"]'); if (h) els.push(h); }
    where.nodes.forEach(id => { const el = document.querySelector(`.wf[data-node="${id}"]`); if (el) els.push(el); });
    if (!els.length) return false;
    els.forEach(el => el.classList.add('is-lit'));

    const box = document.getElementById('skel-scroll');
    if (box) {
      const first = els[0];
      const top = first.offsetTop - box.clientHeight / 2 + first.offsetHeight / 2;
      box.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    return true;
  }

  return { build, light, clear, fit };
})();
