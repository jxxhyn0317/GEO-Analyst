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
    const head = m.head || [];
    const body = nodes.filter(n => !n.chrome);
    const chrome = nodes.filter(n => n.chrome);
    const readable = body.filter(n => !HOLE.has(n.kind)).reduce((s, n) => s + n.chars, 0);
    const holes = body.filter(n => HOLE.has(n.kind)).length;
    const host = (() => { try { return new URL(d.url).host; } catch { return ''; } })();

    return `
      <div class="skel">
        <div class="skel-head">
          <div class="skel-title">The page, as a model receives it</div>
          <div class="skel-key">
            <span class="skel-key-item"><i class="kb kb-full"></i>it can read this</span>
            <span class="skel-key-item"><i class="kb kb-void"></i>nothing here for it</span>
          </div>
        </div>
        <div class="skel-scroll" id="skel-scroll">
          <div class="skel-hidden" data-anchor="head">
            <div class="skel-hidden-tab">read before the page, never seen by a reader</div>
            ${head.map(h => `
              <div class="skel-meta${h.present ? '' : ' is-missing'}">
                <span class="skel-meta-key">${GEO.esc(h.label)}</span>
                ${h.present
                  ? `<span class="skel-meta-val">${GEO.esc(clipText(h.text, 54))}</span>`
                  : '<span class="skel-meta-val">not there</span>'}
              </div>`).join('')}
          </div>

          <div class="skel-page">
            <div class="skel-bar"><i></i><i></i><i></i><span>${GEO.esc(host)}</span></div>
            <div class="skel-paper">
              ${chrome.length ? `<div class="skel-chrome-strip" title="navigation">${'<i></i>'.repeat(Math.min(6, Math.max(3, chrome.length)))}</div>` : ''}
              ${body.length ? body.map(row).join('') : '<div class="skel-blank">A reader sees a page here.<br>A model receives nothing.</div>'}
              ${chrome.length ? '<div class="skel-chrome-strip skel-foot"><i></i><i></i><i></i></div>' : ''}
            </div>
          </div>
          <p class="skel-foot-note">${fmtNum(readable)} characters it can quote${holes ? ` · ${holes} ${holes === 1 ? 'place' : 'places'} it cannot read` : ''}</p>
        </div>
      </div>`;
  }

  // Shapes are the page a reader sees. Fill is what the model gets from it. One rule, and it
  // holds everywhere: a solid line is text it can quote, a hollow box is a place where a reader
  // sees something and the model receives nothing at all.
  function row(n) {
    const lit = `data-node="${n.id}"`;
    if (n.kind === 'heading') {
      const w = Math.max(28, Math.min(100, Math.round(n.chars * 1.6)));
      return `<div class="wf wf-h wf-h${n.level}" ${lit}><b style="width:${w}%"></b><span class="wf-cap">${GEO.esc(clipText(n.text, 46))}</span></div>`;
    }
    if (n.kind === 'media') {
      return `<div class="wf wf-img${n.alt ? ' has-alt' : ''}" ${lit}>
        <div class="wf-box"><svg viewBox="0 0 40 24" preserveAspectRatio="none"><path d="M0 0 40 24M40 0 0 24" /></svg></div>
        ${n.alt ? `<span class="wf-cap wf-alt">alt: ${GEO.esc(clipText(n.text, 44))}</span>` : '<span class="wf-cap wf-none">no alt text</span>'}
      </div>`;
    }
    if (n.kind === 'links') {
      return `<div class="wf wf-links" ${lit}>${'<i></i>'.repeat(Math.min(5, Math.max(2, n.items || 3)))}<span class="wf-cap wf-none">links only</span></div>`;
    }
    if (n.kind === 'table') {
      return `<div class="wf wf-table" ${lit}>${'<i></i>'.repeat(8)}</div>`;
    }
    // text and lists become the lines a wireframe uses, as many as the block has to say
    const lines = Math.max(1, Math.min(9, Math.round(n.chars / 55)));
    const widths = ['100%', '96%', '99%', '92%', '97%', '88%', '100%', '94%', '70%'];
    return `<div class="wf wf-text${n.kind === 'list' ? ' wf-list' : ''}" ${lit}>
      ${Array.from({ length: lines }, (_, i) => `<b style="width:${i === lines - 1 ? '62%' : widths[i % widths.length]}"></b>`).join('')}
    </div>`;
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
    if (where.head) { const h = document.querySelector('.skel-hidden'); if (h) els.push(h); }
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

  return { build, light, clear };
})();
