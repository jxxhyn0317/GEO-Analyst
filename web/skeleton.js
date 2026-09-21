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

    return `
      <div class="skel">
        <div class="skel-head">
          <div class="skel-title">What the model receives</div>
          <p class="skel-sub">The page in document order, sized by how much text each part actually offers. Grey means nothing to read.</p>
        </div>
        <div class="skel-scroll" id="skel-scroll">
          <div class="skel-zone skel-zone-head" data-anchor="head">
            <div class="skel-zone-label">&lt;head&gt; · invisible to a reader, read first by a model</div>
            ${head.map(h => `
              <div class="skel-meta${h.present ? '' : ' is-missing'}" data-head="${GEO.esc(h.key)}">
                <span class="skel-meta-key">${GEO.esc(h.label)}</span>
                <span class="skel-meta-val">${h.present ? GEO.esc(clipText(h.text, 70)) : 'missing'}</span>
              </div>`).join('')}
          </div>
          <div class="skel-zone">
            <div class="skel-zone-label">body · ${fmtNum(readable)} characters it can quote${holes ? `, ${holes} places it cannot read` : ''}</div>
            ${body.length ? body.map(row).join('') : '<div class="skel-empty">Nothing in the body survived as text. To a model this page is blank.</div>'}
          </div>
          ${chrome.length ? `<div class="skel-zone skel-zone-chrome">
            <div class="skel-zone-label">navigation and footer · present, but not this page's content</div>
            ${chrome.slice(0, 14).map(row).join('')}
            ${chrome.length > 14 ? `<div class="skel-more">and ${chrome.length - 14} more</div>` : ''}
          </div>` : ''}
        </div>
      </div>`;
  }

  // Height carries the weight of the block, so a page that is mostly pictures looks mostly empty.
  function row(n) {
    const h = HOLE.has(n.kind) ? 26 : Math.max(10, Math.min(90, Math.round(n.chars / 10)));
    if (n.kind === 'heading') {
      return `<div class="skel-row skel-h skel-h${n.level}" data-node="${n.id}"><span class="skel-lvl">H${n.level}</span><span class="skel-text">${GEO.esc(n.text)}</span></div>`;
    }
    if (n.kind === 'media') {
      return `<div class="skel-row skel-hole" data-node="${n.id}" style="height:${h}px">
        <span class="skel-hole-label">${n.alt ? `image, alt: ${GEO.esc(clipText(n.text, 60))}` : `${GEO.esc(n.tag)} with no alt text · a hole`}</span></div>`;
    }
    if (n.kind === 'links') {
      return `<div class="skel-row skel-hole skel-links" data-node="${n.id}" style="height:${h}px">
        <span class="skel-hole-label">links only${n.items ? `, ${n.items}` : ''} · nothing to quote</span></div>`;
    }
    if (n.kind === 'table') {
      return `<div class="skel-row skel-block skel-table" data-node="${n.id}" style="height:${h}px"><span class="skel-text">table, ${n.rows} rows · ${GEO.esc(clipText(n.text, 90))}</span></div>`;
    }
    if (n.kind === 'list') {
      return `<div class="skel-row skel-block skel-list" data-node="${n.id}" style="height:${h}px"><span class="skel-text">${GEO.esc(clipText(n.text, 120))}</span></div>`;
    }
    return `<div class="skel-row skel-block" data-node="${n.id}" style="height:${h}px"><span class="skel-text">${GEO.esc(clipText(n.text, 150))}</span></div>`;
  }

  const clipText = (t, n) => (t || '').length > n ? (t || '').slice(0, n - 1) + '…' : (t || '');
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
    if (where.head) { const h = document.querySelector('.skel-zone-head'); if (h) els.push(h); }
    where.nodes.forEach(id => { const el = document.querySelector(`.skel-row[data-node="${id}"]`); if (el) els.push(el); });
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
